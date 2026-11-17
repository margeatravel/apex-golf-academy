import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Flag, Package as PackageIcon, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import { computeTrendLine } from '@/lib/trendLine';
import { computePackageProgress } from '@/lib/lessonPackageUsage';
import {
  ROUND_METRIC_COLUMNS,
  availableRoundMetrics,
  type RoundMetricKey,
} from '@/lib/roundMetrics';
import {
  useSharedPackageIds,
  useSharedPackageMemberNames,
  formatSharedWith,
} from '@/hooks/useSharedPackages';


/**
 * Desktop-only (lg+) home blocks for the student portal.
 * Purely additive: these components are rendered with `hidden lg:block`
 * wrappers, so the mobile dashboard is untouched.
 */

const SCORE_COLOR = '#F0C040'; // same as the "Score vs Par" metric in RoundsList

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

/** `YYYY-MM-DD` parsed as a local date (never UTC-shifted). */
function parseLocalDate(value: string): Date {
  const [y, m, d] = (value || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function DesktopScoreTrendCard({ studentId }: { studentId?: string }) {
  const { language, t } = useLanguage();
  const [metricKey, setMetricKey] = useState<RoundMetricKey>('score');

  const { data: rounds = [] } = useQuery({
    queryKey: ['desktop-score-trend', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('golf_rounds')
        .select(ROUND_METRIC_COLUMNS)
        .eq('student_id', studentId!)
        .order('played_on', { ascending: false })
        .limit(10);
      return (data ?? []).slice().reverse();
    },
  });

  const sorted = (rounds as any[])
    .slice()
    .sort((a, b) => parseLocalDate(a.played_on).getTime() - parseLocalDate(b.played_on).getTime());

  // Same metric list / formulas the "My Stats" page uses. A chip only shows up
  // when the student has that metric in >= 3 rounds.
  const metrics = availableRoundMetrics(sorted as any, 3);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const color = metric?.color ?? SCORE_COLOR;

  const points = sorted.map((r) => ({
    date: parseLocalDate(r.played_on).toLocaleDateString(localeFor(language), {
      month: 'short', day: 'numeric',
    }),
    // Single source of truth: identical values to the "My Stats" page.
    value: metric ? metric.value(r as any) : null,
  }));


  const trend = computeTrendLine(points.map((p) => p.value));
  const chartData = points.map((p, i) => ({
    ...p,
    trend: trend ? trend.intercept + trend.slope * i : undefined,
  }));

  const title = metric ? t(metric.labelKey) : t('home.scoreVsPar');
  const fmt = metric?.format ?? ((v: number) => (v > 0 ? `+${v}` : String(v)));
  // Deep-link into Round Stats keeping the selected metric.
  const statsLink = `/pro-zone/stats?view=trends&metric=${metric?.key ?? 'score'}`;

  if (sorted.length < 3) {
    return (
      <section style={glass} className="px-5 py-6 text-center">
        <Flag className="h-5 w-5 mx-auto" style={{ color: SCORE_COLOR }} />
        <p className="text-ivory text-sm font-semibold mt-2">
          {t('home.logYourRounds')}
        </p>
        <p className="text-ivory/60 text-xs mt-1">
          {t('home.logRoundsHint')}
        </p>
        <Link
          to="/pro-zone/stats"
          className="inline-block mt-3 text-xs font-semibold px-4 py-2 rounded-full transition-all duration-200"
          style={{ background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.4)', color: SCORE_COLOR }}
        >
          {t('home.logRound')}
        </Link>
      </section>
    );
  }

  return (
    <section style={glass} className="block px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <Link
          to={statsLink}
          className="group inline-flex items-center gap-0.5 text-ivory/55 text-[10px] uppercase tracking-[0.18em] hover:text-ivory/90 transition-colors"
        >
          {title}
          <ChevronRight className="h-3 w-3 opacity-50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:opacity-90" />
        </Link>
        <p className="text-ivory/45 text-[11px]">
          {t('home.last10Rounds')}
        </p>
      </div>

      {metrics.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {metrics.map((m) => {
            const active = m.key === metric?.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricKey(m.key)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-all duration-200"
                style={{
                  background: active ? `${m.color}26` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? `${m.color}66` : 'rgba(255,255,255,0.10)'}`,
                  color: active ? m.color : 'rgba(245,240,232,0.6)',
                }}
              >
                {t(m.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      <Link
        to={statsLink}
        aria-label={title}
        className="block rounded-xl cursor-pointer transition-colors hover:bg-white/[0.02]"
      >
      <div style={{ height: 180 }} className="pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="desktopScoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              scale="point"
              padding={{ left: 0, right: 0 }}
              tick={{ fill: 'rgba(245,240,232,0.45)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={44}
              tick={{ fill: 'rgba(245,240,232,0.45)', fontSize: 10 }}
              tickFormatter={(v: number) => fmt(v)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,25,20,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgba(245,240,232,0.7)' }}
              formatter={(value: any, name: string) =>
                name === 'trend' ? null : [fmt(Number(value)), title]
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#desktopScoreFill)"
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="trend"
              stroke={color}
              strokeOpacity={0.9}
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </Link>
    </section>
  );
}


export function DesktopPackageProgressCard({ studentId }: { studentId?: string }) {
  const { language, t } = useLanguage();
  const es = language === 'es';

  // Owned packages + shared packages this student is a member of.
  const sharedPackageIds = useSharedPackageIds(studentId);
  const sharedKey = sharedPackageIds.join(',');

  const { data: packages = [] } = useQuery({
    queryKey: ['desktop-package-progress', studentId, sharedKey],
    enabled: !!studentId,
    queryFn: async () => {
      let query = supabase
        .from('class_packages')
        .select('*')
        .eq('is_active', true)
        .eq('is_paused', false)
        .eq('is_archived', false);
      query = sharedPackageIds.length
        ? query.or(`user_id.eq.${studentId},id.in.(${sharedPackageIds.join(',')})`)
        : query.eq('user_id', studentId!);
      const { data } = await query.order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  const ids = (packages as any[]).map((p) => p.id);
  const { data: lessons = [] } = useQuery({
    queryKey: ['desktop-package-progress-lessons', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, status, lesson_date, lesson_start_at, lesson_type, package_id')
        .in('package_id', ids);
      return data ?? [];
    },
  });

  const active = (packages as any[])
    .map((pkg) => ({ pkg, progress: computePackageProgress(pkg, lessons as any[]) }))
    .find((p) => p.progress.remaining > 0);

  const sharedNames = useSharedPackageMemberNames(active ? [active.pkg.id] : [], studentId);
  const sharedWithLabel = active ? formatSharedWith(sharedNames[active.pkg.id] ?? [], es) : null;

  if (!active) {
    return (
      <section style={glass} className="px-5 py-6 text-center">
        <PackageIcon className="h-5 w-5 mx-auto" style={{ color: '#7BC894' }} />
        <p className="text-ivory text-sm font-semibold mt-2">
          {t('home.noActivePackageDesktop')}
        </p>
        <p className="text-ivory/60 text-xs mt-1">
          {t('home.buyPackageToSeeHere')}
        </p>
      </section>
    );
  }

  const { pkg, progress } = active;
  const name = pkg.package_name || `${progress.size} ${t('home.lessonsWord')}`;

  return (
    <section style={glass} className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ivory/55 text-[10px] uppercase tracking-[0.18em]">
            {t('home.packageProgress')}
          </p>
          <p className="text-ivory text-sm font-semibold mt-1.5 truncate">{name}</p>
        </div>
        <p className="text-ivory font-heading font-bold text-lg flex-shrink-0">
          {progress.used} / {progress.size}
        </p>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden mt-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progress.pct}%`,
            background: 'linear-gradient(90deg, #4a7c59, #7CC598)',
            boxShadow: '0 0 8px rgba(124,197,152,0.5)',
          }}
        />
      </div>
      <p className="text-ivory/50 text-[11px] mt-2">
        {progress.remaining} {t('home.lessonsAvailable')}
      </p>
      {sharedWithLabel && (
        <p className="text-ivory/45 text-[11px] mt-1">{sharedWithLabel}</p>
      )}
    </section>
  );
}
