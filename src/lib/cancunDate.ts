/**
 * America/Cancun (UTC-5, no DST) date helpers.
 * All dates are plain YYYY-MM-DD strings in local Cancún time, matching how
 * lesson_date / effective dates are stored.
 */

const CANCUN_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Today's date in Cancún as YYYY-MM-DD. */
export function getCancunToday(): string {
  return new Date(Date.now() - CANCUN_OFFSET_MS).toISOString().substring(0, 10);
}

/** Compare date-only values locally; convert zoned timestamps to the Cancún day. */
export function isTodayInCancun(dateStr: string): boolean {
  if (!dateStr) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr === getCancunToday();
  // Unzoned ISO timestamps represent local Cancún time, never the browser's zone.
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateStr) ? dateStr : `${dateStr}-05:00`;
  const timestamp = new Date(zoned).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return new Date(timestamp - CANCUN_OFFSET_MS).toISOString().substring(0, 10) === getCancunToday();
}

/** Text class to highlight today's lesson option in pickers (theme accent token). */
export const TODAY_LESSON_TEXT_CLASS = '[--primary:var(--gold)] !text-primary [[role=option]:focus_&]:!text-accent-foreground [[role=option][data-highlighted]_&]:!text-accent-foreground';

/** Weekday (0 = Sunday … 6 = Saturday) of a YYYY-MM-DD string. */
export function weekdayOfISODate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

/**
 * Picker order: today first, then past (newest→oldest), then future
 * (nearest→farthest). Dates are YYYY-MM-DD strings compared as local
 * Cancún calendar days (no UTC parsing).
 */
export function sortByPickerOrder<T extends { lesson_date: string }>(items: T[]): T[] {
  const today = getCancunToday();
  const day = (d: string) => (d || '').substring(0, 10);
  return [...items].sort((a, b) => {
    const aD = day(a.lesson_date);
    const bD = day(b.lesson_date);
    const cat = (d: string) => (d === today ? 0 : d < today ? 1 : 2);
    const aCat = cat(aD);
    const bCat = cat(bD);
    if (aCat !== bCat) return aCat - bCat;
    if (aCat === 2) return aD < bD ? -1 : aD > bD ? 1 : 0;
    return aD > bD ? -1 : aD < bD ? 1 : 0;
  });
}

/** Human date, e.g. "15 oct 2026" / "Oct 15, 2026". */
export function formatCancunDate(dateStr: string, language: 'es' | 'en' = 'es'): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}
