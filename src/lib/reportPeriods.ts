import { supabase } from '@/integrations/supabase/client';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import { getCancunToday } from '@/lib/cancunDate';
import { formatReportRange } from '@/lib/studentReports';

/** Shared period options for every "Crear reporte" modal. Order matters. */
export type ReportPeriodPreset = 'this_month' | 'last_package' | 'all_lessons' | 'custom' | 'ytd' | 'month' | 'year';

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriodPreset; labelKey: string }[] = [
  { value: 'this_month', labelKey: 'reports.thisMonth' },
  { value: 'last_package', labelKey: 'reports.lastPackage' },
  { value: 'all_lessons', labelKey: 'reports.allLessons' },
  { value: 'custom', labelKey: 'reports.customRange' },
];

/** Day 1 of the current Cancún month → today (Cancún). YYYY-MM-DD strings. */
export function thisMonthRange(): { start: string; end: string } {
  const today = getCancunToday();
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

/**
 * Most recent package of the student (own or shared via package_members),
 * validated through computePackageCounts. Range = first scheduled/registered
 * lesson of that package → today. Returns null when there's no package.
 */
export async function lastPackageRange(studentId: string): Promise<{ start: string; end: string } | null> {
  const [ownRes, memberRes] = await Promise.all([
    supabase.from('class_packages').select('id, package_size, classes_used, classes_remaining, payment_date, created_at').eq('user_id', studentId),
    supabase.from('package_members').select('package_id').eq('student_id', studentId),
  ]);
  let pkgs = (ownRes.data ?? []) as any[];
  const sharedIds = (memberRes.data ?? []).map((m: any) => m.package_id).filter((id: string) => !pkgs.some((p) => p.id === id));
  if (sharedIds.length) {
    const { data } = await supabase.from('class_packages').select('id, package_size, classes_used, classes_remaining, payment_date, created_at').in('id', sharedIds);
    pkgs = pkgs.concat(data ?? []);
  }
  if (!pkgs.length) return null;
  const key = (p: any) => String(p.payment_date || p.created_at || '').slice(0, 10) + String(p.created_at || '');
  pkgs.sort((a, b) => key(b).localeCompare(key(a)));
  const pkg = pkgs[0];
  // Lessons linked to the package include every member's lessons (shared packages).
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, package_id, lesson_date, status, lesson_type, duration_minutes')
    .eq('package_id', pkg.id);
  computePackageCounts(pkg, lessons ?? []); // source of truth for the package's linked lessons
  const today = getCancunToday();
  const dates = (lessons ?? [])
    .filter((l: any) => l.status !== 'cancelled' && l.lesson_date)
    .map((l: any) => String(l.lesson_date).slice(0, 10))
    .sort();
  const start = dates[0] || String(pkg.payment_date || pkg.created_at).slice(0, 10);
  return { start: start > today ? today : start, end: today };
}

/** First registered lesson of the student → today. */
export async function allLessonsRange(studentId: string): Promise<{ start: string; end: string }> {
  const today = getCancunToday();
  const { data } = await supabase
    .from('lessons')
    .select('lesson_date')
    .eq('student_id', studentId)
    .in('status', ['completed', 'no_show'])
    .order('lesson_date', { ascending: true })
    .limit(1);
  const first = data?.[0]?.lesson_date ? String(data[0].lesson_date).slice(0, 10) : today;
  return { start: first, end: today };
}

export async function studentHasPackage(studentId: string): Promise<boolean> {
  const [own, mem] = await Promise.all([
    supabase.from('class_packages').select('id', { count: 'exact', head: true }).eq('user_id', studentId),
    supabase.from('package_members').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
  ]);
  return (own.count ?? 0) + (mem.count ?? 0) > 0;
}

/** Scoring Report period options (YTD first = default). */
export const SCORING_PERIOD_OPTIONS: { value: ReportPeriodPreset; labelKey: string }[] = [
  { value: 'ytd', labelKey: 'reports.ytd' },
  { value: 'month', labelKey: 'reports.periodMonth' },
  { value: 'year', labelKey: 'reports.periodYear' },
  ...REPORT_PERIOD_OPTIONS,
];

const pad = (n: number) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD (never UTC). */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Jan 1 of the current year → today (Cancún). */
export function ytdRange(): { start: string; end: string } {
  const today = getCancunToday();
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

/** Whole calendar month (month = 1..12). */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` };
}

/** Whole calendar year. */
export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Distinct years with logged rounds for the student, newest first. */
export async function roundYears(studentId: string): Promise<number[]> {
  const { data } = await supabase.from('golf_rounds').select('played_on').eq('student_id', studentId);
  const ys = new Set<number>();
  (data ?? []).forEach((r: any) => r.played_on && ys.add(Number(String(r.played_on).slice(0, 4))));
  return Array.from(ys).sort((a, b) => b - a);
}

export interface PeriodState {
  preset: ReportPeriodPreset;
  customStart?: Date;
  customEnd?: Date;
  /** 1..12 */
  month: number;
  year: number;
}

export function defaultPeriodState(preset: ReportPeriodPreset = 'ytd'): PeriodState {
  const today = getCancunToday();
  return { preset, month: Number(today.slice(5, 7)), year: Number(today.slice(0, 4)) };
}

/** Resolves a period to a YYYY-MM-DD range. */
export async function resolvePeriodRange(p: PeriodState, studentId: string): Promise<{ start: string; end: string }> {
  switch (p.preset) {
    case 'ytd': return ytdRange();
    case 'month': return monthRange(p.year, p.month);
    case 'year': return yearRange(p.year);
    case 'this_month': return thisMonthRange();
    case 'last_package': return (await lastPackageRange(studentId)) ?? thisMonthRange();
    case 'all_lessons': return allLessonsRange(studentId);
    case 'custom': {
      const m = thisMonthRange();
      const last = monthRange(Number(m.start.slice(0, 4)), Number(m.start.slice(5, 7))).end;
      return {
        start: p.customStart ? toLocalYmd(p.customStart) : m.start,
        end: p.customEnd ? toLocalYmd(p.customEnd) : last,
      };
    }
  }
}

/** Human label printed on the PDF, e.g. "YTD 2026", "Septiembre 2026", "1 mar – 15 jun 2026". */
export function periodLabelFor(p: PeriodState, range: { start: string; end: string }, locale: string): string {
  if (p.preset === 'ytd') return `YTD ${range.start.slice(0, 4)}`;
  if (p.preset === 'year') return String(p.year);
  if (p.preset === 'month') {
    const s = new Date(p.year, p.month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return formatReportRange(range.start, range.end, locale);
}
