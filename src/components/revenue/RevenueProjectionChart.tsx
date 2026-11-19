import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { TrendingUp, ChevronDown, ExternalLink } from 'lucide-react';
import { buildRevenueReportPdf } from '@/lib/revenueReportPdf';
import { weeklyHours, recurringWeeklyHours, averageMonthly, lessonMinutes, pendingPackageRows } from '@/lib/revenueReportData';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import type { RevenueReportExtras } from '@/lib/revenueReportPdf';
import { setRevenuePdfHandler } from '@/lib/revenuePdfBridge';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { getCancunToday } from '@/lib/cancunDate';
import { mondayOf } from '@/lib/recurringCadence';
import {
  projectBuckets, pricePerClass, hasRenewedBefore, projectRenewalDates, priceTier, scenarioPrice, PRICE_STEPS, tierShareLabel,
  type ProjectionLesson, type ProjectionPackage, type RenewalSlot,
} from '@/lib/revenueProjection';

function addMonths(dateStr: string, n: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const HORIZONS = [
  { value: 1, es: 'Siguiente mes', en: 'Next month', esDesc: 'Próximo mes', enDesc: 'Next month' },
  { value: 3, es: 'Siguientes 3 meses', en: 'Next 3 months', esDesc: 'Próximos 3 meses', enDesc: 'Next 3 months' },
  { value: 6, es: 'Siguientes 6 meses', en: 'Next 6 months', esDesc: 'Próximos 6 meses', enDesc: 'Next 6 months' },
  { value: 12, es: 'Siguiente año', en: 'Next year', esDesc: 'Próximo año', enDesc: 'Next year' },
] as const;
type HorizonValue = (typeof HORIZONS)[number]['value'];


type Pkg = ProjectionPackage & { user_id: string; created_at: string };
type Slot = RenewalSlot & { student_id: string };

export function RevenueProjectionChart() {
  const { effectiveCoachId } = useAuth();
  const { language } = useLanguage();
  const es = language === 'es';
  const loc = es ? { locale: esLocale } : undefined;
  const today = getCancunToday();
  const [months, setMonths] = useState<HorizonValue>(6);
  const horizon = HORIZONS.find((h) => h.value === months) ?? HORIZONS[2];
  const until = addMonths(today, months);
  const [view, setView] = useState<'weekly' | 'monthly'>('monthly');

  // Scenario edits are drafts until the coach taps "Guardar"; saved copy lives in revenue_scenarios.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [allPrice, setAllPrice] = useState('');
  const [renewPrices, setRenewPrices] = useState<Record<string, number>>({});
  const [savedSnap, setSavedSnap] = useState('');
  const [savingScenario, setSavingScenario] = useState(false);
  const snap = JSON.stringify({ overrides, prices, renewPrices });
  const dirty = savedSnap !== '' && snap !== savedSnap;
  useEffect(() => {
    if (!effectiveCoachId) return;
    let alive = true;
    (async () => {
      const { data: row } = await supabase.from('revenue_scenarios').select('overrides, prices, renew_prices').eq('coach_id', effectiveCoachId).maybeSingle();
      const ls = (k: string) => { try { return JSON.parse(localStorage.getItem(`${k}:${effectiveCoachId}`) || '{}'); } catch { return {}; } };
      const o = (row?.overrides as any) ?? ls('apex-renewal-overrides');
      const p = (row?.prices as any) ?? ls('apex-price-scenario');
      const r = (row?.renew_prices as any) ?? ls('apex-renewal-prices');
      if (!alive) return;
      setOverrides(o); setPrices(p); setRenewPrices(r);
      setSavedSnap(JSON.stringify({ overrides: o, prices: p, renewPrices: r }));
    })();
    return () => { alive = false; };
  }, [effectiveCoachId]);
  const saveOverrides = (o: Record<string, boolean>) => setOverrides(o);
  const savePrices = (o: Record<string, number>) => setPrices(o);
  const saveRenewPrices = (o: Record<string, number>) => setRenewPrices(o);
  const persistScenario = async () => {
    if (!effectiveCoachId) return;
    setSavingScenario(true);
    const { error } = await supabase.from('revenue_scenarios').upsert({ coach_id: effectiveCoachId, overrides, prices, renew_prices: renewPrices, updated_at: new Date().toISOString() });
    setSavingScenario(false);
    if (error) { toast.error(es ? 'No se pudo guardar' : 'Could not save'); return; }
    setSavedSnap(snap);
    toast.success(es ? 'Guardado' : 'Saved');
  };

  const { data } = useQuery({
    queryKey: ['revenue-projection-v2', effectiveCoachId, today, months],
    enabled: !!effectiveCoachId,
    queryFn: async () => {
      const { data: students } = await supabase.from('profiles').select('id, full_name').eq('assigned_coach_id', effectiveCoachId!);
      const ids = (students || []).map((s: any) => s.id);
      const names = new Map<string, string>((students || []).map((s: any) => [s.id, s.full_name || '—']));
      const lessons: ProjectionLesson[] = [];
      const allPackages: Pkg[] = [];
      const slots: Slot[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [l, p, s] = await Promise.all([
          supabase.from('lessons')
            .select('student_id, lesson_date, status, package_id, revenue, skipped')
            .in('student_id', chunk).eq('status', 'scheduled')
            .gte('lesson_date', today).lt('lesson_date', until),
          supabase.from('class_packages')
            .select('id, price, package_size, user_id, created_at')
            .in('user_id', chunk),
          supabase.from('recurring_lesson_slots')
            .select('student_id, weekday, interval_weeks, interval_anchor, paused_until, starts_on')
            .in('student_id', chunk).eq('is_active', true),
        ]);
        lessons.push(...((l.data as any[]) || []));
        allPackages.push(...((p.data as any[]) || []));
        slots.push(...((s.data as any[]) || []));
      }
      // Packages referenced by lessons but owned by someone else (shared packages).
      const known = new Set(allPackages.map((p) => p.id));
      const missing = [...new Set(lessons.map((l) => l.package_id).filter((id) => id && !known.has(id)))] as string[];
      if (missing.length) {
        const { data: extra } = await supabase.from('class_packages').select('id, price, package_size, user_id, created_at').in('id', missing);
        allPackages.push(...((extra as any[]) || []));
      }
      return { lessons, allPackages, slots, names, ids };
    },
  });

  // Per-student renewal info
  const students = useMemo(() => {
    if (!data?.ids) return [];
    return data.ids
      .map((id) => {
        const pkgs = data.allPackages.filter((p) => p.user_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const slots = data.slots.filter((s) => s.student_id === id);
        if (!slots.length || !pkgs.length) return null;
        const own = data.lessons.filter((l) => l.student_id === id && !l.skipped).map((l) => l.lesson_date).sort();
        const last = own.length ? own[own.length - 1] : today;
        return {
          id,
          name: data.names.get(id) || '—',
          renewed: hasRenewedBefore(pkgs),
          price: pricePerClass(pkgs[0]),
          dates: projectRenewalDates(slots, last, until),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name)) as Array<{ id: string; name: string; renewed: boolean; price: number; dates: string[] }>;
  }, [data, today, until]);

  const isRenewing = (s: { id: string; renewed: boolean }) => overrides[s.id] ?? s.renewed;

  const buildChart = (pr: Record<string, number>, rp: Record<string, number> = {}) => {
    if (!data?.allPackages) return [] as Array<{ date: string; withRenewals: number }>;
    const base = projectBuckets(data.lessons, data.allPackages, today, view);
    const map = new Map<string, { date: string; withRenewals: number }>();
    base.forEach((b) => map.set(b.date, { date: b.date, withRenewals: b.revenue }));
    for (const s of students) {
      // In the scenario, a student whose price tier was changed counts as renewing at the new price.
      const repriced = pr[String(priceTier(s.price))] > 0 || rp[s.id] > 0;
      if (!isRenewing(s) && !repriced) continue;
      // A per-student renewal price wins over the tier scenario.
      const price = rp[s.id] > 0 ? rp[s.id] : scenarioPrice(s.price, pr);
      for (const d of s.dates) {
        const key = view === 'monthly' ? `${d.slice(0, 7)}-01` : mondayOf(d);
        const row = map.get(key) || { date: key, withRenewals: 0 };
        row.withRenewals += price;
        map.set(key, row);
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, withRenewals: Math.round(r.withRenewals) }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chartData = useMemo(() => buildChart(prices, renewPrices), [data, students, overrides, view, today, prices, renewPrices]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const realData = useMemo(() => buildChart({}), [data, students, overrides, view, today]);

  const totalRenew = chartData.reduce((s, d) => s + d.withRenewals, 0);
  const totalReal = realData.reduce((s, d) => s + d.withRenewals, 0);
  const scenarioActive = Object.keys(prices).length > 0 || Object.keys(renewPrices).length > 0;
  const renewingCount = students.filter(isRenewing).length;
  const tiers = useMemo(() => {
    const m = new Map<number, Array<{ id: string; name: string }>>();
    students.forEach((s) => { const t = priceTier(s.price); m.set(t, [...(m.get(t) || []), { id: s.id, name: s.name }]); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [students]);

  const [, setPdfBusy] = useState(false);
  const downloadReport = async (extras?: RevenueReportExtras) => {
    if (!data?.ids || !effectiveCoachId) {
      toast.info(es ? 'Cargando datos, intenta en unos segundos' : 'Loading data, try again in a few seconds');
      return;
    }
    setPdfBusy(true);
    const tid = toast.loading(es ? 'Generando PDF…' : 'Generating PDF…');
    try {
      const year = Number(today.slice(0, 4));
      const wkStart = new Date(today + 'T00:00:00Z'); wkStart.setUTCDate(wkStart.getUTCDate() - 7 * 12);
      const histFrom = wkStart.toISOString().slice(0, 10) < `${year}-01-01` ? wkStart.toISOString().slice(0, 10) : `${year}-01-01`;
      const { data: me } = await supabase.from('profiles').select('full_name').eq('id', effectiveCoachId).maybeSingle();
      const hist: any[] = []; const pkgs: any[] = []; const slotRows: any[] = [];
      for (let i = 0; i < data.ids.length; i += 200) {
        const chunk = data.ids.slice(i, i + 200);
        const [l, p, s] = await Promise.all([
          supabase.from('lessons').select('lesson_date, status, revenue, duration_minutes, lesson_type, skipped')
            .in('student_id', chunk).gte('lesson_date', histFrom).lte('lesson_date', `${year}-12-31`),
          supabase.from('class_packages').select('id, user_id, package_name, package_size, classes_used, classes_remaining, price, is_active, created_at').in('user_id', chunk),
          supabase.from('recurring_lesson_slots').select('student_id, weekday, start_time, duration_minutes, lesson_type, interval_weeks, paused_until')
            .in('student_id', chunk).eq('is_active', true),
        ]);
        hist.push(...(l.data || [])); pkgs.push(...(p.data || [])); slotRows.push(...(s.data || []));
      }
      const pkgIds = pkgs.map((p) => p.id);
      const pays: any[] = [];
      for (let i = 0; i < pkgIds.length; i += 200) {
        const { data: pp } = await supabase.from('package_payments').select('amount, payment_date').in('package_id', pkgIds.slice(i, i + 200))
          .gte('payment_date', `${year}-01-01`).lte('payment_date', `${year}-12-31`);
        pays.push(...(pp || []));
      }
      // Lessons linked to active packages → canonical "still to teach" counts.
      const activeIds = pkgs.filter((p) => p.is_active).map((p) => p.id);
      const pkgLessons: any[] = [];
      for (let i = 0; i < activeIds.length; i += 200) {
        const chunk = activeIds.slice(i, i + 200);
        for (let from = 0; ; from += 1000) {
          const { data: pl } = await supabase.from('lessons')
            .select('id, package_id, status, lesson_date, lesson_type, skipped')
            .in('package_id', chunk).order('id').range(from, from + 999);
          pkgLessons.push(...(pl || []));
          if (!pl || pl.length < 1000) break;
        }
      }
      const pending = pendingPackageRows(pkgs, pkgLessons, data.names, computePackageCounts, es);
      const monthMap = new Map<string, number>();
      const addM = (ds: string, a: number) => { if (ds?.startsWith(String(year))) monthMap.set(ds.slice(0, 7), (monthMap.get(ds.slice(0, 7)) || 0) + a); };
      hist.forEach((l) => addM(l.lesson_date, Number(l.revenue) || 0));
      pays.forEach((p) => addM(String(p.payment_date || ''), Number(p.amount) || 0));
      const months = Array.from({ length: 12 }, (_, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; return { month: k, revenue: monthMap.get(k) || 0 }; });
      const worked = hist.filter((l) => !l.skipped && (l.status === 'completed' || l.status === 'no_show' || (l.status === 'scheduled' && l.lesson_date <= today)));
      const activeSlots = slotRows.filter((s) => !s.paused_until || s.paused_until <= today);
      const dayN = es ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const reportStudents = data.ids.map((id) => {
        const own = pkgs.filter((p) => p.user_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const act = own.find((p) => p.is_active) || own[0];
        const sl = activeSlots.filter((s) => s.student_id === id);
        if (!act && !sl.length) return null;
        return {
          name: data.names.get(id) || '—',
          pkgName: act?.package_name || (act ? `${act.package_size} ${es ? 'clases' : 'lessons'}` : '—'),
          price: act ? pricePerClass(act) : 0,
          remaining: act ? (act.is_active ? computePackageCounts(act, pkgLessons.filter((l) => l.package_id === act.id)).remaining : (act.classes_remaining ?? 0)) : 0,
          schedule: sl.map((s) => `${dayN[s.weekday]} ${String(s.start_time).slice(0, 5)}`).join(', '),
        };
      }).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name)) as any[];
      const blob = buildRevenueReportPdf({
        es, coachName: me?.full_name || 'Coach', today,
        students: reportStudents,
        tiers: tiers.map(([price, list]) => ({ price, count: list.length, pct: tierShareLabel(list.length, students.length) })),
        slots: activeSlots.map((s) => ({ weekday: s.weekday, time: String(s.start_time).slice(0, 5), name: data.names.get(s.student_id) || '—', minutes: lessonMinutes(s) })),
        weekly: weeklyHours(worked, today, 12),
        recurringHours: recurringWeeklyHours(activeSlots),
        months, year, avgMonthly: averageMonthly(months, today),
        projection: realData.map((r) => ({ date: r.date, value: r.withRenewals })),
        projectionTotal: totalReal,
        horizonLabel: es ? horizon.es : horizon.en,
        scenarioTotal: scenarioActive ? totalRenew : undefined,
        renewals: students.map((s) => ({ name: s.name, price: s.price, renewing: isRenewing(s), count: s.dates.length })),
        pending,
        extras,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `margea-${es ? 'reporte-ingresos' : 'revenue-report'}-${today}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(es ? 'PDF descargado' : 'PDF downloaded', { id: tid });
    } catch (e) {
      console.error('[revenue-pdf]', e);
      toast.error(es ? 'No se pudo generar el PDF' : 'Could not generate the PDF', { id: tid });
    } finally { setPdfBusy(false); }
  };

  // Keep the header button bound to the latest render's data.
  const downloadRef = useRef(downloadReport);
  downloadRef.current = downloadReport;
  const readyRef = useRef(false);
  readyRef.current = !!data?.ids && !!effectiveCoachId;
  useEffect(() => {
    setRevenuePdfHandler(async (getExtras) => {
      // If the projection is still loading, wait for it instead of failing.
      const started = Date.now();
      const waitId = readyRef.current ? null : toast.loading(language === 'es' ? 'Preparando datos…' : 'Preparing data…');
      while (!readyRef.current && Date.now() - started < 60_000) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (waitId != null) toast.dismiss(waitId);
      downloadRef.current(getExtras?.());
    });
    return () => setRevenuePdfHandler(null);
  }, []);

  const fmtTick = (v: string) => { try { return format(parseISO(v), view === 'monthly' ? 'MMM yyyy' : 'MMM d', loc); } catch { return v; } };
  const fmtLabel = (v: string) => { try { return view === 'monthly' ? format(parseISO(v), 'MMMM yyyy', loc) : `${es ? 'Semana del' : 'Week of'} ${format(parseISO(v), 'MMM d, yyyy', loc)}`; } catch { return v; } };
  const labelRenew = es ? 'Con renovaciones' : 'With renewals';

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {es ? 'Proyección de ingresos' : 'Revenue Projection'}
          </CardTitle>
          <CardDescription>
            {es ? horizon.esDesc : horizon.enDesc} {es ? 'según tu calendario' : 'based on your calendar'} • <span className="text-success">{labelRenew}: {fmtMXN(scenarioActive ? totalReal : totalRenew)}</span>
            {scenarioActive && (
              <span className="block mt-1">{es ? 'Real' : 'Actual'}: {fmtMXN(totalReal)} → {es ? 'Escenario' : 'Scenario'}: <span className="text-primary">{fmtMXN(totalRenew)}</span> ({totalRenew - totalReal >= 0 ? '+' : '−'}{fmtMXN(Math.abs(totalRenew - totalReal))})</span>
            )}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v) as HorizonValue)}>
            <SelectTrigger className="w-full sm:w-[165px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HORIZONS.map((h) => (
                <SelectItem key={h.value} value={String(h.value)}>{es ? h.es : h.en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={view} onValueChange={(v: 'weekly' | 'monthly') => setView(v)}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{es ? 'Semanal' : 'Weekly'}</SelectItem>
              <SelectItem value="monthly">{es ? 'Mensual' : 'Monthly'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6 space-y-4">
        <div className="h-[220px] sm:h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={realData.map((r) => ({ ...r, scenario: chartData.find((c) => c.date === r.date)?.withRenewals ?? r.withRenewals }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tickFormatter={fmtTick} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} className="fill-muted-foreground" />
              <YAxis tickFormatter={(v) => `$${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`} tick={{ fontSize: 10 }} width={48} className="fill-muted-foreground" />
              <Tooltip formatter={(value: number, name: string) => [fmtMXNStr(value), name]} labelFormatter={(l) => fmtLabel(String(l))} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line name={labelRenew} type="monotone" dataKey="withRenewals" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
              {scenarioActive && (
                <Line name={es ? 'Escenario (precios nuevos)' : 'Scenario (new prices)'} type="monotone" dataKey="scenario" stroke="hsl(var(--success) / 0.45)" strokeWidth={2} strokeDasharray="5 4" dot={{ fill: 'hsl(var(--success) / 0.45)', r: 2 }} activeDot={{ r: 4 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-muted-foreground">{es ? 'Cambios sin guardar' : 'Unsaved changes'}</span>}
          <Button size="sm" disabled={!dirty || savingScenario} onClick={persistScenario}>
            {savingScenario ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save')}
          </Button>
        </div>
        <Tabs defaultValue="students">
          <TabsList className="w-full">
            <TabsTrigger value="students" className="flex-1">{es ? 'Alumnos' : 'Students'}</TabsTrigger>
            <TabsTrigger value="prices" className="flex-1">{es ? 'Precios' : 'Prices'}</TabsTrigger>
          </TabsList>
          <TabsContent value="students">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span>{es ? '¿Quién renueva?' : 'Who renews?'} ({renewingCount}/{students.length})</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => saveOverrides(Object.fromEntries(students.map((s) => [s.id, true])))}>{es ? 'Todos' : 'All'}</Button>
              <Button size="sm" variant="secondary" onClick={() => saveOverrides(Object.fromEntries(students.map((s) => [s.id, false])))}>{es ? 'Ninguno' : 'None'}</Button>
              <Button size="sm" variant="secondary" onClick={() => saveOverrides({})}>{es ? 'Según historial' : 'By history'}</Button>
            </div>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">{es ? 'Ningún alumno tiene horario recurrente.' : 'No students with a recurring schedule.'}</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {students.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <Checkbox checked={isRenewing(s)} onCheckedChange={(v) => saveOverrides({ ...overrides, [s.id]: !!v })} />
                    <span className="flex-1 text-sm truncate">{s.name}</span>
                    <Select value={renewPrices[s.id] ? String(renewPrices[s.id]) : 'same'} onValueChange={(v) => { const next = { ...renewPrices }; if (v === 'same') delete next[s.id]; else next[s.id] = Number(v); saveRenewPrices(next); }}>
                      <SelectTrigger className="h-7 w-[110px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="same">{fmtMXNStr(Math.round(s.price))}</SelectItem>
                        {PRICE_STEPS.map((v) => <SelectItem key={v} value={String(v)}>{fmtMXNStr(v)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {s.renewed ? (es ? 'Ha renovado' : 'Has renewed') : (es ? 'Primer paquete' : 'First package')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
          </TabsContent>
          <TabsContent value="prices" className="space-y-3">
            <p className="text-xs text-muted-foreground">{es ? 'Simulación: el precio nuevo aplica desde la siguiente renovación. No cambia tus precios reales.' : 'Simulation: new price applies from the next renewal. Your real prices are not changed.'}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={allPrice} onValueChange={setAllPrice}>
                <SelectTrigger className="w-40"><SelectValue placeholder={es ? 'Precio por clase' : 'Price per class'} /></SelectTrigger>
                <SelectContent>{PRICE_STEPS.map((v) => <SelectItem key={v} value={String(v)}>{fmtMXNStr(v)}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="secondary" disabled={!(Number(allPrice) > 0)} onClick={() => savePrices(Object.fromEntries(tiers.map(([t]) => [String(t), Number(allPrice)])))}>{es ? 'Subir todos a este precio' : 'Set all to this price'}</Button>
              <Button size="sm" variant="outline" disabled={!scenarioActive} onClick={() => { savePrices({}); setAllPrice(''); }}>{es ? 'Restablecer' : 'Reset'}</Button>
            </div>
            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{es ? 'Ningún alumno tiene horario recurrente.' : 'No students with a recurring schedule.'}</p>
            ) : (
              <div className="space-y-1">
                {tiers.map(([t, studs]) => (
                  <div key={t} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <span className="flex-1 text-sm">{fmtMXN(t)} <span className="text-muted-foreground">{es ? 'por clase' : 'per class'} · </span><HoverList students={studs} label={`${studs.length} ${es ? (studs.length === 1 ? 'alumno' : 'alumnos') : (studs.length === 1 ? 'student' : 'students')}`} /> <span className="text-muted-foreground">· {tierShareLabel(studs.length, students.length)}</span></span>
                    <Select value={prices[String(t)] ? String(prices[String(t)]) : 'none'} onValueChange={(v) => { const next = { ...prices }; if (v === 'none') delete next[String(t)]; else next[String(t)] = Number(v); savePrices(next); }}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{es ? 'Sin cambio' : 'No change'}</SelectItem>
                        {PRICE_STEPS.map((v) => <SelectItem key={v} value={String(v)}>{fmtMXNStr(v)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function HoverList({ students, label }: { students: Array<{ id: string; name: string }>; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="underline decoration-dotted underline-offset-2 text-muted-foreground hover:text-foreground"
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>{label}</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 text-sm" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <ul className="space-y-0.5">
          {[...students].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <li key={s.id}>
              <Link to={`/admin/student/${s.id}`} onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-muted">
                <span className="truncate">{s.name}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
