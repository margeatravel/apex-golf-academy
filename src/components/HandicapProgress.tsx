import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Target, TrendingUp, Loader2, Pencil } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { roundHandicapEstimate } from '@/lib/roundHandicapEstimate';

export function HandicapProgress() {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const es = language === 'es';
  const locale = es ? 'es-MX' : 'en-US';
  const { data: rounds = [], isLoading: roundsLoading, isError: roundsError } = useQuery({
    queryKey: ['golf-rounds', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('golf_rounds')
        .select('*')
        .eq('student_id', profile?.id).order('played_on', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const estimates = roundHandicapEstimate(rounds);
  const latestEstimate = estimates.at(-1);
  const previousEstimate = estimates.at(-2);
  const estimateChange = latestEstimate && previousEstimate ? Number((latestEstimate.handicap - previousEstimate.handicap).toFixed(1)) : null;
  const { data: history = [], isLoading, isError } = useQuery({
    queryKey: ['handicap-history', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('handicap_history').select('*')
        .eq('user_id', profile?.id).order('recorded_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = profile?.handicap;
  const goalProfile = profile as (typeof profile & { handicap_goal?: number | null; handicap_goal_date?: string | null });
  const goal = goalProfile?.handicap_goal;
  const goalDate = goalProfile?.handicap_goal_date;
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'America/Cancun' });
  const points = history.map((h) => ({ date: dateFormat.format(new Date(h.recorded_at)), handicap: Number(h.handicap) }));
  const change = points.length > 1 ? points[points.length - 1].handicap - points[0].handicap : null;

  return (
    <section className="pro-zone-tile p-4 sm:p-5 min-w-0" aria-label={es ? 'Avance de handicap' : 'Handicap progress'}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold text-foreground text-sm">
          <TrendingUp className="h-4 w-4 text-accent" />{es ? 'Mi handicap' : 'My handicap'}
        </h2>
        <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5">
          <Link to="/profile"><Pencil className="h-3 w-3" />{es ? 'Editar meta' : 'Edit goal'}</Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border mb-4">
        <div className="pr-2 min-w-0"><p className="text-[11px] text-muted-foreground">{es ? 'Registrado' : 'Entered'}</p><p className="text-3xl font-heading font-bold text-foreground tabular-nums">{current ?? '—'}</p></div>
        <div className="px-3 min-w-0"><p className="text-[11px] text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />{es ? 'Meta' : 'Goal'}</p><p className="text-2xl font-heading font-semibold text-accent tabular-nums">{goal ?? '—'}</p></div>
        <div className="pl-3 min-w-0"><p className="text-[11px] text-muted-foreground">{es ? 'Cambio' : 'Change'}</p><p className={`text-2xl font-heading font-semibold tabular-nums ${change != null && change < 0 ? 'text-green-accent' : 'text-foreground'}`}>{change == null ? '—' : `${change > 0 ? '+' : ''}${Number(change.toFixed(1))}`}</p></div>
      </div>
      {goalDate && <p className="text-xs text-muted-foreground mb-3">{es ? 'Fecha objetivo' : 'Target date'} · {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${goalDate}T12:00:00`))}</p>}
      {isLoading ? <div className="h-44 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : isError ? <p className="text-xs text-muted-foreground py-6">{es ? 'No se pudo cargar el historial de handicap.' : 'Handicap history could not be loaded.'}</p> : points.length > 0 ? (
        <div className="h-44 sm:h-52 min-w-0" aria-label={es ? 'Gráfica de avance del handicap' : 'Handicap history chart'}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 15, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--pro-zone-edge)" strokeDasharray="3 5" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={35} tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.6)' }} />
              <YAxis axisLine={false} tickLine={false} domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.6)' }} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border border-border bg-background p-3 text-xs text-foreground"><p className="text-muted-foreground mb-1">{label}</p><p>Handicap · {payload[0].value}</p></div> : null} />
              {goal != null && <ReferenceLine y={Number(goal)} stroke="hsl(var(--accent))" strokeDasharray="5 5" ifOverflow="extendDomain" />}
              <Line name="Handicap" type="monotone" dataKey="handicap" stroke="hsl(var(--success))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--accent))', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="text-xs text-muted-foreground py-5 text-center">{es ? 'Aún no hay historial de handicap.' : 'No handicap history yet.'}</p>}
      {goal != null && points.length > 0 && <p className="text-[11px] text-accent mt-2 flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-accent" />{es ? 'Meta de handicap' : 'Handicap goal'} · {goal}</p>}
      <div className="border-t border-border mt-4 pt-4">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{es ? 'Handicap estimado por rondas' : 'Round-based handicap estimate'}</h3>
            <p className="text-[11px] text-muted-foreground mt-1">{es ? 'Promedio sobre par · últimas 20 rondas · equivalente a 18 hoyos · no oficial' : 'Average over par · last 20 rounds · 18-hole equivalent · unofficial'}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{es ? 'Sin ajuste por dificultad del campo ni límites por hoyo.' : 'No adjustment for course difficulty or hole-score limits.'}</p>
          </div>
          <p className="text-2xl font-heading font-bold text-accent shrink-0 tabular-nums">{roundsLoading ? '…' : latestEstimate?.handicap ?? '—'}</p>
        </div>
        {roundsError ? <p className="text-xs text-muted-foreground mt-3">{es ? 'No se pudieron cargar las rondas.' : 'Rounds could not be loaded.'}</p> : latestEstimate ? <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-3">
            <span className="text-muted-foreground">{latestEstimate.count} {es ? 'rondas utilizadas' : 'rounds used'}</span>
            {estimateChange != null && <span className={estimateChange < 0 ? 'text-green-accent' : 'text-foreground'}>{es ? 'Cambio desde la ronda anterior' : 'Change since previous round'}: {estimateChange > 0 ? '+' : ''}{estimateChange}</span>}
            {current != null && <span className="text-muted-foreground">{es ? 'Vs. handicap registrado' : 'Vs. entered handicap'}: {latestEstimate.handicap - Number(current) > 0 ? '+' : ''}{Number((latestEstimate.handicap - Number(current)).toFixed(1))}</span>}
          </div>
          <div className="h-36 sm:h-44 mt-3" aria-label={es ? 'Gráfica del handicap estimado por rondas' : 'Round-based handicap estimate chart'}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={estimates.slice(-20).map(p => ({ ...p, date: dateFormat.format(new Date(`${p.date}T12:00:00-05:00`)) }))} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--pro-zone-edge)" strokeDasharray="3 5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={35} tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.6)' }} />
                <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.6)' }} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border border-border bg-background p-3 text-xs text-foreground"><p className="text-muted-foreground mb-1">{label}</p><p>{es ? 'Estimado' : 'Estimated'} · {payload[0].value}</p></div> : null} />
                {goal != null && <ReferenceLine y={Number(goal)} stroke="hsl(var(--success))" strokeDasharray="5 5" ifOverflow="extendDomain" />}
                <Line type="monotone" dataKey="handicap" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--accent))', strokeWidth: 0 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </> : !roundsLoading && <p className="text-xs text-muted-foreground mt-3">{es ? 'Sin rondas para estimar el handicap.' : 'No rounds to estimate handicap.'}</p>}
      </div>
    </section>
  );
}