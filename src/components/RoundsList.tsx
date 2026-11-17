import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Trophy, Sparkles, Pencil, Calendar as CalendarIcon, BarChart3, List, ChevronRight, CloudSun, FileText } from 'lucide-react';
import { LogRoundModal } from '@/components/LogRoundModal';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  ComposedChart,
} from 'recharts';
import { computeTrendLine } from '@/lib/trendLine';
import { useEffect } from 'react';
import { setHolesFilterFor, hasStoredHolesFilter, type HolesFilter } from '@/lib/roundsFilterStore';
import { localeFor } from '@/lib/uiLocale';
import { ROUND_METRICS, type RoundMetricKey } from '@/lib/roundMetrics';



export interface RoundRow {
  id: string;
  course_id: string | null;
  course_name_snapshot: string;
  round_type: 'practice' | 'tournament';
  played_on: string;
  holes_played: number;
  course_par: number;
  total_score: number;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_in_regulation: number | null;
  putts: number | null;
  penalties: number | null;
  weather: string | null;
  notes: string | null;
  tees: string | null;
  lost_balls?: number | null;
  tournament_position?: number | null;
  up_downs_attempted?: number | null;
  up_downs_converted?: number | null;
  eagles?: number | null;
  birdies?: number | null;
  pars?: number | null;
  bogeys?: number | null;
  doubles_plus?: number | null;
  par3_avg?: number | null;
  par4_avg?: number | null;
  par5_avg?: number | null;
}

interface RoundsListProps {
  studentId: string;
  canEdit?: boolean;
  emptyHint?: string;
  /** Initial tab: 'list' (rounds) or 'charts' (Trends). Default 'list'. */
  initialView?: 'list' | 'charts' | 'reports';
  /** Initial metric for the Trends tab (from the dashboard chart link). */
  initialMetric?: RoundMetricKey;
  /** Optional third tab content (student portal Reports tab). */
  reportsSlot?: React.ReactNode;
}

function formatDate(d: string, locale: 'en-US' | 'es-MX') {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Parse a YYYY-MM-DD round date as a LOCAL date (America/Cancun has no DST),
// never as UTC, so sorting and labels never shift a day.
function parseLocalRoundDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function shortDate(d: string, locale: 'en-US' | 'es-MX') {
  return parseLocalRoundDate(d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Single source of truth for round metric definitions + formulas.
type ChartMetric = RoundMetricKey;

const METRICS = ROUND_METRICS;


export function RoundsList({ studentId, canEdit = true, emptyHint, initialView = 'list', initialMetric, reportsSlot }: RoundsListProps) {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const [editing, setEditing] = useState<RoundRow | null>(null);
  const [viewing, setViewing] = useState<RoundRow | null>(null);
  const [view, setView] = useState<'list' | 'charts' | 'reports'>(initialView);
  const [activeMetric, setActiveMetric] = useState<ChartMetric>(
    initialMetric && ROUND_METRICS.some((m) => m.key === initialMetric) ? initialMetric : 'score',
  );
  // Filter rounds by hole count so a 9-hole 52 isn't averaged next to
  // 18-hole 101s. The user can only pick 18 or 9 — 'all' no longer exists.
  // Default: '18', unless the student has no 18-hole rounds but does have 9-hole ones.
  const [holesFilter, setHolesFilterState] = useState<HolesFilter>('18');
  // Publish the active filter so the Scoring Report (PDF) buttons outside this
  // component can generate the PDF for exactly what the user is looking at.
  const setHolesFilter = (f: HolesFilter) => {
    setHolesFilterState(f);
    setHolesFilterFor(studentId, f);
  };

  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ['golf-rounds', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('student_id', studentId)
        .order('played_on', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RoundRow[];
    },
  });

  // Fix the default once rounds load: a student who only logs 9-hole rounds
  // starts on '9' instead of an empty 18-hole view.
  useEffect(() => {
    if (rounds.length === 0) return;
    if (hasStoredHolesFilter(studentId)) return; // user already picked — keep it
    const has18 = rounds.some((r) => (r.holes_played ?? 18) === 18);
    const has9 = rounds.some((r) => r.holes_played === 9);
    const def: HolesFilter = has18 ? '18' : has9 ? '9' : '18';
    setHolesFilterState(def);
    setHolesFilterFor(studentId, def);
  }, [rounds, studentId]);

  const filteredRounds = useMemo(() => {
    const target = holesFilter === '18' ? 18 : 9;
    return rounds.filter((r) => (r.holes_played ?? 18) === target);
  }, [rounds, holesFilter]);

  // Total averages across ALL rounds
  const stats = useMemo(() => {
    if (filteredRounds.length === 0) return null;
    const avg = (arr: number[]) =>
      arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
    const scores = filteredRounds.map((r) => r.total_score);
    const overPar = filteredRounds.map((r) => r.total_score - r.course_par);
    const putts = filteredRounds.map((r) => r.putts).filter((x): x is number => x != null);
    const gir = filteredRounds
      .map((r) =>
        r.greens_in_regulation != null && r.holes_played
          ? (r.greens_in_regulation / r.holes_played) * 100
          : null
      )
      .filter((x): x is number => x != null);
    const fir = filteredRounds
      .map((r) =>
        r.fairways_hit != null && r.fairways_total && r.fairways_total > 0
          ? (r.fairways_hit / r.fairways_total) * 100
          : null
      )
      .filter((x): x is number => x != null);
    const lostBalls = filteredRounds.map((r) => r.lost_balls).filter((x): x is number => x != null);
    const birdiesArr = filteredRounds.map((r) => r.birdies).filter((x): x is number => x != null);
    const bogeysArr = filteredRounds.map((r) => r.bogeys).filter((x): x is number => x != null);
    const udPcts = filteredRounds
      .map((r) =>
        r.up_downs_attempted != null && r.up_downs_attempted > 0 && r.up_downs_converted != null
          ? (r.up_downs_converted / r.up_downs_attempted) * 100
          : null
      )
      .filter((x): x is number => x != null);
    const fairwaysHitArr = filteredRounds.map((r) => r.fairways_hit).filter((x): x is number => x != null);
    const girRawArr = filteredRounds.map((r) => r.greens_in_regulation).filter((x): x is number => x != null);
    return {
      total: filteredRounds.length,
      avgScore: avg(scores),
      avgVsPar: avg(overPar),
      avgPutts: avg(putts),
      girPct: gir.length ? Math.round(avg(gir)!) : null,
      firPct: fir.length ? Math.round(avg(fir)!) : null,
      best: Math.min(...overPar),
      avgLostBalls: avg(lostBalls),
      avgBirdies: avg(birdiesArr),
      avgBogeys: avg(bogeysArr),
      udPct: udPcts.length ? Math.round(avg(udPcts)!) : null,
      avgFairwaysHit: avg(fairwaysHitArr),
      avgGir: avg(girRawArr),
    };
  }, [filteredRounds]);

  // Chart data (chronological order): sort by the round's LOCAL date so the
  // first point is the first round ever uploaded and the last is the latest,
  // with no date-range trimming.
  const chartData = useMemo(() => {
    return [...filteredRounds]
      .sort((a, b) => parseLocalRoundDate(a.played_on).getTime() - parseLocalRoundDate(b.played_on).getTime())
      .map((r) => {
        const point: Record<string, string | number | null> = {
          date: shortDate(r.played_on, locale),
        };
        // All per-round metric values come from the shared definitions.
        for (const m of ROUND_METRICS) point[m.key] = m.value(r);
        return point;
      });
  }, [filteredRounds, locale]);


  // Trend line for the active metric, recomputed whenever the holes filter or
  // the metric changes. Needs >= 3 valid points (MIN_TREND_POINTS).
  const trend = useMemo(() => {
    const values = chartData.map((d) => (d as Record<string, unknown>)[activeMetric] as number | null);
    return computeTrendLine(values);
  }, [chartData, activeMetric]);

  // Chart data augmented with the fitted trend value at each x position.
  const trendChartData = useMemo(() => {
    if (!trend || chartData.length < 2) return chartData;
    return chartData.map((d, i) => ({ ...d, __trend: trend.intercept + trend.slope * i }));
  }, [chartData, trend]);



  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-ivory/40" />
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="pro-zone-tile p-6 text-center space-y-2">
        <CalendarIcon className="h-8 w-8 mx-auto text-ivory/30" />
        <p className="text-ivory/60 text-sm">{t('prozone2.rounds.noRoundsLogged')}</p>
        {emptyHint && <p className="text-ivory/40 text-xs">{emptyHint}</p>}
      </div>
    );
  }

  const currentMetric = METRICS.find((m) => m.key === activeMetric)!;
  const currentMetricLabel = t(currentMetric.labelKey);

  return (
    <div className="space-y-4">
      {/* Holes filter — separates 9- and 18-hole rounds so averages aren't distorted */}
      <div className="flex gap-2">
        {([
          { key: '18', label: t('prozone2.rounds.holes18') },
          { key: '9', label: t('prozone2.rounds.holes9') },
        ] as const).map((opt) => (
          <Button
            key={opt.key}
            variant={holesFilter === opt.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHolesFilter(opt.key)}
            className={`text-xs ${
              holesFilter === opt.key
                ? 'bg-gold-accent text-black hover:bg-gold-accent/90'
                : 'bg-white/5 border-white/10 text-ivory hover:bg-white/10'
            }`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Total averages summary */}
      {stats && (
        <div className="pro-zone-tile p-4">
          <p className="text-ivory/50 text-[10px] uppercase tracking-widest mb-3">
            {t('prozone2.rounds.allTimeAverages')} · {stats.total} {stats.total === 1 ? t('prozone2.rounds.round') : t('prozone2.rounds.roundsPlural')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.avgScore')}</p>
              <p className="text-lg font-semibold text-ivory">
                {stats.avgScore ?? '—'}
                {stats.avgVsPar != null && (
                  <span
                    className={`text-xs ml-1 ${
                      stats.avgVsPar < 0 ? 'text-green-accent' : stats.avgVsPar > 0 ? 'text-gold-accent' : 'text-ivory/60'
                    }`}
                  >
                    {stats.avgVsPar > 0 ? '+' : ''}{stats.avgVsPar}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.gir')}</p>
              <p className="text-lg font-semibold text-ivory leading-tight">
                {stats.avgGir != null ? stats.avgGir.toFixed(1) : '—'}
              </p>
              {stats.girPct != null && (
                <p className="text-[10px] text-ivory/50 tabular-nums">{stats.girPct}%</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.fir')}</p>
              <p className="text-lg font-semibold text-ivory leading-tight">
                {stats.avgFairwaysHit != null ? stats.avgFairwaysHit.toFixed(1) : '—'}
              </p>
              {stats.firPct != null && (
                <p className="text-[10px] text-ivory/50 tabular-nums">{stats.firPct}%</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.puttsPerRound')}</p>
              <p className="text-lg font-semibold text-ivory">{stats.avgPutts ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.best')}</p>
              <p className="text-lg font-semibold text-green-accent">
                {stats.best === 0 ? 'E' : stats.best > 0 ? `+${stats.best}` : stats.best}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.birdiesPerRound')}</p>
              <p className="text-lg font-semibold text-ivory">{stats.avgBirdies ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.bogeysPerRound')}</p>
              <p className="text-lg font-semibold text-ivory">{stats.avgBogeys ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.udPct')}</p>
              <p className="text-lg font-semibold text-ivory">{stats.udPct != null ? `${stats.udPct}%` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-ivory/50 uppercase">{t('prozone2.rounds.lostBallsPerRound')}</p>
              <p className="text-lg font-semibold text-ivory">{stats.avgLostBalls ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2">
        <Button
          variant={view === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('list')}
          className={`gap-1.5 text-xs ${view === 'list' ? 'bg-gold-accent text-black hover:bg-gold-accent/90' : 'bg-white/5 border-white/10 text-ivory hover:bg-white/10'}`}
        >
          <List className="h-3.5 w-3.5" /> {t('prozone2.rounds.roundsTab')}
        </Button>
        <Button
          variant={view === 'charts' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('charts')}
          className={`gap-1.5 text-xs ${view === 'charts' ? 'bg-gold-accent text-black hover:bg-gold-accent/90' : 'bg-white/5 border-white/10 text-ivory hover:bg-white/10'}`}
        >
          <BarChart3 className="h-3.5 w-3.5" /> {t('prozone2.rounds.trendsTab')}
        </Button>
        {reportsSlot && (
          <Button
            variant={view === 'reports' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('reports')}
            className={`gap-1.5 text-xs ${view === 'reports' ? 'bg-gold-accent text-black hover:bg-gold-accent/90' : 'bg-white/5 border-white/10 text-ivory hover:bg-white/10'}`}
          >
            <FileText className="h-3.5 w-3.5" /> {t('reports.reportsTab')}
          </Button>
        )}
      </div>

      {view === 'reports' && reportsSlot ? (
        <div>{reportsSlot}</div>
      ) : view === 'charts' ? (
        <div className="space-y-3">
          {/* Metric selector */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-none">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  activeMetric === m.key
                    ? 'text-black'
                    : 'bg-white/5 text-ivory/60 hover:bg-white/10 hover:text-ivory'
                }`}
                style={activeMetric === m.key ? { backgroundColor: m.color } : undefined}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="pro-zone-tile p-3 sm:p-4 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs text-ivory/50">{currentMetricLabel} {t('prozone2.rounds.overTime')}</p>
            </div>
            <div className="h-48 sm:h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendChartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={currentMetric.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={currentMetric.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    // Point scale with zero padding: the chart starts exactly at
                    // the first round and ends at the last, and the trend line
                    // spans from the first round's x to the last one's.
                    scale="point"
                    padding={{ left: 0, right: 0 }}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={44}
                    tickMargin={4}
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                    tickFormatter={(v: number) =>
                      activeMetric === 'score' && v > 0 ? `+${v}` : `${v}`
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(13,31,24,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f5f0e8',
                    }}
                    // The fitted trend is a guide, not round data — keep it out of the tooltip.
                    formatter={((value: unknown, name: unknown, item: { dataKey?: string | number }) =>
                      item?.dataKey === '__trend' ? null : [value, name]
                    ) as never}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetric}
                    stroke={currentMetric.color}
                    strokeWidth={2}
                    fill={`url(#grad-${activeMetric})`}
                    dot={{ r: 3, fill: currentMetric.color, strokeWidth: 0 }}
                    connectNulls
                  />
                  {trend && (
                    <Line
                      type="linear"
                      dataKey="__trend"
                      // Same stroke color as the Area it belongs to.
                      stroke={currentMetric.color}
                      strokeOpacity={0.9}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      ) : (
        /* List */
        <div className="space-y-2">
          {filteredRounds.map((r) => {
            const overUnder = r.total_score - r.course_par;
            const ouLabel = overUnder === 0 ? 'E' : overUnder > 0 ? `+${overUnder}` : `${overUnder}`;
            const ouColor = overUnder < 0 ? 'text-green-accent' : overUnder > 0 ? 'text-gold-accent' : 'text-ivory/70';
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewing(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setViewing(r);
                  }
                }}
                className="pro-zone-tile p-4 flex items-start gap-3 w-full text-left transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-white/5 border border-white/10">
                  {r.round_type === 'tournament' ? (
                    <Trophy className="h-4 w-4 text-gold-accent" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-green-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ivory truncate">{r.course_name_snapshot}</p>
                    <p className={`text-base font-semibold tabular-nums ${ouColor}`}>
                      {r.total_score}
                      <span className="text-xs ml-1 text-ivory/50">({ouLabel})</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                    <p className="text-xs text-ivory/50">{formatDate(r.played_on, locale)}</p>
                    <span className="text-ivory/30">·</span>
                    <p className="text-xs text-ivory/50">{r.round_type === 'tournament' ? t('prozone2.rounds.tournament') : t('prozone2.rounds.practice')}{r.round_type === 'tournament' && r.tournament_position != null ? ` · ${t('prozone2.rounds.placeAbbrev')} ${r.tournament_position}` : ''}</p>
                    <span className="text-ivory/30">·</span>
                    <p className="text-xs text-ivory/50">{r.holes_played} {t('prozone2.rounds.holesSuffix')}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-ivory/60">
                    {r.fairways_hit != null && r.fairways_total != null && (
                      <span>FIR {r.fairways_hit}/{r.fairways_total}</span>
                    )}
                    {r.greens_in_regulation != null && (
                      <span>GIR {r.greens_in_regulation}/{r.holes_played}</span>
                    )}
                    {r.putts != null && <span>{r.putts} {t('prozone2.rounds.puttsAbbrev')}</span>}
                    {(r.lost_balls ?? r.penalties) != null && (r.lost_balls ?? r.penalties)! > 0 && <span>{r.lost_balls ?? r.penalties} {t('prozone2.rounds.penaltiesAbbrev')}</span>}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-ivory/55 mt-2 italic line-clamp-2">"{r.notes}"</p>
                  )}
                  {canEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-ivory/50 hover:text-ivory transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      {t('prozone2.rounds.edit')}
                    </button>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-ivory/30 self-center shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      <LogRoundModal
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        studentId={studentId}
        round={editing}
      />

      <RoundDetailsDialog
        round={viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        canEdit={canEdit}
        onEdit={(r) => { setViewing(null); setEditing(r); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-ivory/50">{label}</p>
      <p className="text-sm font-semibold text-ivory mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-ivory/40">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function pct(num: number | null | undefined, denom: number | null | undefined): string | null {
  if (num == null || !denom) return null;
  return `${Math.round((num / denom) * 100)}%`;
}

function RoundDetailsDialog({
  round,
  onOpenChange,
  canEdit,
  onEdit,
}: {
  round: RoundRow | null;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  onEdit: (r: RoundRow) => void;
}) {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  if (!round) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }
  const r = round;
  const overUnder = r.total_score - r.course_par;
  const ouLabel = overUnder === 0 ? 'E' : overUnder > 0 ? `+${overUnder}` : `${overUnder}`;
  const ouColor = overUnder < 0 ? 'text-green-accent' : overUnder > 0 ? 'text-gold-accent' : 'text-ivory/70';

  const scoringHas = r.eagles != null || r.birdies != null || r.pars != null || r.bogeys != null || r.doubles_plus != null;
  const t2gHas = (r.fairways_total ?? 0) > 0 || r.greens_in_regulation != null || r.penalties != null || r.lost_balls != null;
  const shortHas = r.putts != null || r.up_downs_attempted != null;
  const parAvgHas = r.par3_avg != null || r.par4_avg != null || r.par5_avg != null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {r.round_type === 'tournament' ? (
              <Trophy className="h-4 w-4 text-gold-accent" />
            ) : (
              <Sparkles className="h-4 w-4 text-green-accent" />
            )}
            <span className="truncate">{r.course_name_snapshot}</span>
          </DialogTitle>
          <DialogDescription>
            {formatDate(r.played_on, locale)} · <span className="capitalize">{r.round_type}</span> · {r.holes_played} holes
            {r.tees ? <> · <span className="capitalize">{r.tees} tees</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Headline score */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ivory/50">{t('prozone2.rounds.totalScore')}</p>
              <p className={`text-3xl font-bold tabular-nums ${ouColor}`}>
                {r.total_score}
                <span className="text-base ml-2 text-ivory/60">({ouLabel})</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-ivory/50">{t('prozone2.rounds.coursePar')}</p>
              <p className="text-xl font-semibold text-ivory tabular-nums">{r.course_par}</p>
            </div>
          </div>

          {scoringHas && (
            <Section title={t('ui.rounds.scoringBreakdown')}>
              {r.eagles != null && <Stat label={t('ui.rounds.eagles')} value={r.eagles} />}
              {r.birdies != null && <Stat label={t('ui.rounds.birdies')} value={r.birdies} />}
              {r.pars != null && <Stat label={t('prozone2.logRound.pars')} value={r.pars} />}
              {r.bogeys != null && <Stat label={t('ui.rounds.bogeys')} value={r.bogeys} />}
              {r.doubles_plus != null && <Stat label={t('ui.rounds.doublePlus')} value={r.doubles_plus} />}
            </Section>
          )}

          {t2gHas && (
            <Section title={t('ui.rounds.teeToGreen')}>
              {r.fairways_total != null && r.fairways_total > 0 && (
                <Stat
                  label={t('ui.rounds.fairways')}
                  value={
                    <span className="flex flex-col leading-tight">
                      <span>{pct(r.fairways_hit, r.fairways_total) ?? '—'}</span>
                      <span className="text-[10px] font-normal text-ivory/50 mt-0.5">
                        {r.fairways_hit ?? 0}/{r.fairways_total} {t('prozone2.rounds.fairwaysCount')}
                      </span>
                    </span>
                  }
                />
              )}
              {r.greens_in_regulation != null && (
                <Stat
                  label={t('prozone2.rounds.gir')}
                  value={
                    <span className="flex flex-col leading-tight">
                      <span>{pct(r.greens_in_regulation, r.holes_played) ?? '—'}</span>
                      <span className="text-[10px] font-normal text-ivory/50 mt-0.5">
                        {r.greens_in_regulation}/{r.holes_played} {t('prozone2.rounds.greensCount')}
                      </span>
                    </span>
                  }
                />
              )}
              {(r.lost_balls ?? r.penalties) != null && <Stat label={t('ui.rounds.lostBalls')} value={(r.lost_balls ?? r.penalties)!} />}
            </Section>
          )}

          {shortHas && (
            <Section title={t('ui.rounds.shortGame')}>
              {r.putts != null && <Stat label={t('ui.rounds.putts')} value={r.putts} />}
              {r.up_downs_attempted != null && r.up_downs_attempted > 0 && (
                <Stat
                  label={t('ui.rounds.upAndDowns')}
                  value={
                    <span className="flex flex-col leading-tight">
                      <span>{pct(r.up_downs_converted, r.up_downs_attempted) ?? '—'}</span>
                      <span className="text-[10px] font-normal text-ivory/50 mt-0.5">
                        {r.up_downs_converted ?? 0}/{r.up_downs_attempted} {t('prozone2.rounds.convertedCount')}
                      </span>
                    </span>
                  }
                />
              )}
            </Section>
          )}

          {parAvgHas && (
            <Section title={t('ui.rounds.parAverages')}>
              {r.par3_avg != null && <Stat label={t('ui.rounds.par3Avg')} value={r.par3_avg} />}
              {r.par4_avg != null && <Stat label={t('ui.rounds.par4Avg')} value={r.par4_avg} />}
              {r.par5_avg != null && <Stat label={t('ui.rounds.par5Avg')} value={r.par5_avg} />}
            </Section>
          )}

          {r.weather && (
            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-ivory/50" />
              <p className="text-sm text-ivory/80 capitalize">{r.weather}</p>
            </div>
          )}

          {r.notes && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-ivory/40">{t('prozone2.rounds.notes')}</p>
              <p className="text-sm text-ivory/80 whitespace-pre-wrap italic">"{r.notes}"</p>
            </div>
          )}
        </div>

        {canEdit && (
          <DialogFooter className="mt-4">
            <Button
              onClick={() => onEdit(r)}
              className="gap-1.5 bg-gold-accent text-black hover:bg-gold-accent/90"
            >
              <Pencil className="h-3.5 w-3.5" /> {t('prozone2.rounds.editRound')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
