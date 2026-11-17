/** Monthly revenue projection: each lesson is worth its own package's price ÷ package size. */

export interface ProjectionPackage { id: string; price: number | null; package_size: number | null; package_name?: string | null }
export interface ProjectionLesson {
  student_id: string | null;
  lesson_date: string;
  status: string;
  package_id: string | null;
  revenue: number | null;
  skipped?: boolean | null;
}

export function pricePerClass(pkg: ProjectionPackage | undefined | null): number {
  if (!pkg) return 0;
  const size = Number(pkg.package_size) || 0;
  if (size <= 0) return 0;
  return (Number(pkg.price) || 0) / size;
}

export function lessonValue(l: ProjectionLesson, pkgs: Map<string, ProjectionPackage>): number {
  if (l.package_id && pkgs.has(l.package_id)) return pricePerClass(pkgs.get(l.package_id));
  return Number(l.revenue) || 0;
}

/** Lessons that count for the month: on the calendar and not cancelled/skipped. */
export function countsForMonth(l: ProjectionLesson, monthKey: string): boolean {
  if (!l.lesson_date?.startsWith(monthKey)) return false;
  if (l.skipped) return false;
  return l.status === 'scheduled' || l.status === 'completed' || l.status === 'no_show';
}

export interface StudentProjectionRow { studentId: string; lessons: number; total: number; perClass: Set<number>; packages: Set<string> }

export function projectMonth(lessons: ProjectionLesson[], packages: ProjectionPackage[], monthKey: string) {
  const pkgs = new Map(packages.map((p) => [p.id, p]));
  const rows = new Map<string, StudentProjectionRow>();
  let total = 0;
  let count = 0;
  for (const l of lessons) {
    if (!countsForMonth(l, monthKey)) continue;
    const v = lessonValue(l, pkgs);
    total += v;
    count++;
    const id = l.student_id || 'unknown';
    const r = rows.get(id) || { studentId: id, lessons: 0, total: 0, perClass: new Set<number>(), packages: new Set<string>() };
    r.lessons++;
    r.total += v;
    r.perClass.add(Math.round(v));
    if (l.package_id && pkgs.get(l.package_id)?.package_name) r.packages.add(pkgs.get(l.package_id)!.package_name!);
    rows.set(id, r);
  }
  return { total, count, rows: [...rows.values()].sort((a, b) => b.total - a.total) };
}

function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

/** Future revenue per week (Monday key) or month (YYYY-MM-01 key), from `from` (YYYY-MM-DD) onward. */
export function projectBuckets(
  lessons: ProjectionLesson[],
  packages: ProjectionPackage[],
  from: string,
  view: 'weekly' | 'monthly',
): Array<{ date: string; revenue: number }> {
  const pkgs = new Map(packages.map((p) => [p.id, p]));
  const buckets = new Map<string, number>();
  for (const l of lessons) {
    if (!l.lesson_date || l.lesson_date < from) continue;
    if (l.skipped || l.status !== 'scheduled') continue;
    const key = view === 'monthly' ? `${l.lesson_date.slice(0, 7)}-01` : mondayOf(l.lesson_date);
    buckets.set(key, (buckets.get(key) || 0) + lessonValue(l, pkgs));
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({ date, revenue: Math.round(revenue) }));
}

// ---------- Renewals ----------
import { isCadenceWeek } from './recurringCadence';

export interface RenewalSlot { weekday: number; interval_weeks: number | null; interval_anchor: string | null; paused_until: string | null; starts_on: string | null }

/** A student "has renewed before" when they bought more than one package. */
export function hasRenewedBefore(studentPackages: unknown[]): boolean {
  return (studentPackages?.length || 0) > 1;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Lesson dates a renewing student would add after `afterDate` (exclusive) until `until` (exclusive),
 * following their recurring slots' weekday (0=Sun), cadence, start date and pause.
 */
export function projectRenewalDates(slots: RenewalSlot[], afterDate: string, until: string): string[] {
  const out: string[] = [];
  if (!slots.length) return out;
  for (let d = addDays(afterDate, 1); d < until; d = addDays(d, 1)) {
    const [y, m, dd] = d.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      if (s.starts_on && d < s.starts_on) continue;
      if (s.paused_until && d < s.paused_until) continue;
      if (!isCadenceWeek(d, s.interval_anchor || s.starts_on, s.interval_weeks)) continue;
      out.push(d);
    }
  }
  return out;
}

// ---------- Price scenarios ----------
/** Group key for a per-class price (rounded to whole pesos). */
export function priceTier(price: number): number {
  return Math.round(price);
}

/** Renewal price under a scenario: overrides map original tier → new per-class price. */
export function scenarioPrice(price: number, overrides: Record<string, number>): number {
  const o = overrides[String(priceTier(price))];
  return typeof o === 'number' && o > 0 ? o : price;
}

/** Selectable per-class scenario prices: $1,000 to $2,000 MXN in $50 steps. */
export const PRICE_STEPS = Array.from({ length: 21 }, (_, i) => 1000 + i * 50);

/** Share of students in a price tier, as a percent with one decimal at most. */
export function tierSharePercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function tierShareLabel(count: number, total: number): string {
  const p = tierSharePercent(count, total);
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

