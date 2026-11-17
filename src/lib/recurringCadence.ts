/**
 * Custom cadence (every 1–4 weeks) for recurring_lesson_slots.
 * Same logic as generate-recurring-lessons, using local dates (no UTC midnight).
 */
function parseLocal(dateStr: string): Date {
  const [y, m, d] = String(dateStr).substring(0, 10).split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Monday (Mon–Sun week) of a YYYY-MM-DD date. */
export function mondayOf(dateStr: string): string {
  const dt = parseLocal(dateStr);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return fmtLocal(dt);
}

/** Whole weeks between the Mondays of two dates (b − a). */
export function weeksBetween(a: string, b: string): number {
  const ma = parseLocal(mondayOf(a));
  const mb = parseLocal(mondayOf(b));
  return Math.round((mb.getTime() - ma.getTime()) / (7 * 86400000));
}

export function isCadenceWeek(
  dateStr: string,
  anchor: string | null | undefined,
  n: number | null | undefined,
): boolean {
  if (!n || n <= 1 || !anchor) return true;
  const weeks = weeksBetween(String(anchor), dateStr);
  return weeks >= 0 && weeks % n === 0;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True when two cadences can land on the same week. */
export function cadencesOverlap(
  n1: number | null | undefined,
  a1: string | null | undefined,
  n2: number | null | undefined,
  a2: string | null | undefined,
): boolean {
  const x = n1 ?? 1;
  const y = n2 ?? 1;
  if (x <= 1 || y <= 1 || !a1 || !a2) return true;
  const d = Math.abs(weeksBetween(String(a1), String(a2)));
  return d % gcd(x, y) === 0;
}

/** First date on/after `fromDate` (YYYY-MM-DD) that falls on `weekday` (0=Sun). */
export function firstWeekdayOnOrAfter(fromDate: string, weekday: number): string {
  const dt = parseLocal(fromDate);
  dt.setDate(dt.getDate() + ((weekday - dt.getDay() + 7) % 7));
  return fmtLocal(dt);
}
