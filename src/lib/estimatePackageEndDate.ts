import { computePackageCounts } from '@/lib/lessonPackageUsage';
import { getCancunToday } from '@/lib/cancunDate';
import { isCadenceWeek } from '@/lib/recurringCadence';

export interface PackageEndEstimate {
  /** YYYY-MM-DD */
  date: string;
  /** true = projected from average cadence (show with "~", gray); false = real scheduled date */
  approximate: boolean;
}

/** Parse YYYY-MM-DD as a LOCAL date (never UTC). */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function toLocalYmd(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estimated end date of a package.
 *
 * remaining comes ONLY from computePackageCounts (total − used; the stored
 * classes_remaining column is never read). Shared packages: every lesson
 * linked via package_id counts, no matter which member took it.
 *
 * 1. If the package has >= remaining future scheduled lessons, the end date
 *    is the date of the Nth (remaining-th) scheduled lesson — exact.
 * 2. Otherwise project from the average gap (days) between completed/no_show
 *    lessons in the last 8 weeks (needs >= 2 such lessons):
 *    end = last scheduled date (or today) + (remaining − scheduled) × avgGap
 *    — approximate.
 * 3. remaining = 0 or not enough data → null ("—").
 */
export function estimatePackageEndDate(
  pkg: {
    id: string;
    package_size?: number | null;
    classes_used?: number | null;
    classes_remaining?: number | null;
  },
  lessons: any[],
  recurringSlots: any[] = [],
): PackageEndEstimate | null {
  const { remaining } = computePackageCounts(pkg, lessons || []);
  if (remaining <= 0) return null;

  const today = getCancunToday();
  const linked = (lessons || []).filter((l) => l && l.package_id === pkg.id && l.lesson_date);

  const ymd = (v: any) => (v ? String(v).substring(0, 10) : null);
  const slotById = new Map((recurringSlots || []).map((r) => [r.id, r]));
  // Same rule as Live Calendar: skipped lessons (lessons.skipped = true) show
  // as Open spots, and lessons of a slot paused (recurring_lesson_slots.paused_until)
  // before that date are not on the calendar → neither counts.
  const onCalendar = (l: any) => {
    if (l.skipped === true) return false;
    const pu = ymd(slotById.get(l.recurring_slot_id)?.paused_until);
    if (pu && String(l.lesson_date) < pu) return false;
    return true;
  };
  const scheduled = linked
    .filter((l) => l.status === 'scheduled' && String(l.lesson_date) >= today && onCalendar(l))
    .map((l) => String(l.lesson_date))
    .sort();

  // 1. Enough scheduled lessons → exact date of the remaining-th one.
  if (scheduled.length >= remaining) {
    return { date: scheduled[remaining - 1], approximate: false };
  }

  // 2a. Package with a recurring schedule → project the missing lessons on the
  //     slot's weekday + cadence, after the last scheduled lesson or the end
  //     of the skip/pause (whichever is later).
  const slots = (recurringSlots || []).filter((r) => r && r.is_active !== false);
  if (slots.length) {
    // Start right after the last valid lesson, or today (inclusive) if none.
    const base = scheduled.length ? scheduled[scheduled.length - 1] : today;
    const missing = remaining - scheduled.length;
    let found = 0;
    const cur = parseLocalYmd(base);
    if (!scheduled.length) cur.setDate(cur.getDate() - 1);
    for (let i = 0; i < 7 * 104; i++) {
      cur.setDate(cur.getDate() + 1);
      const d = toLocalYmd(cur);
      const wd = cur.getDay();
      const hits = slots.filter((r) => {
        if (Number(r.weekday) !== wd) return false;
        const so = ymd(r.starts_on);
        if (so && d < so) return false;
        const pu = ymd(r.paused_until);
        if (pu && d < pu) return false;
        return isCadenceWeek(d, r.interval_anchor, r.interval_weeks);
      }).length;
      found += hits;
      if (found >= missing) return { date: d, approximate: true };
    }
    return null;
  }

  // 2. Average gap between completed/no_show lessons in the last 8 weeks.
  const eightWeeksAgo = toLocalYmd(new Date(parseLocalYmd(today).getTime() - 56 * DAY_MS));
  const doneDates = linked
    .filter(
      (l) =>
        (l.status === 'completed' || l.status === 'no_show') &&
        String(l.lesson_date) >= eightWeeksAgo &&
        String(l.lesson_date) <= today,
    )
    .map((l) => String(l.lesson_date))
    .sort();

  if (doneDates.length < 2) return null;

  const first = parseLocalYmd(doneDates[0]).getTime();
  const last = parseLocalYmd(doneDates[doneDates.length - 1]).getTime();
  const avgGapDays = (last - first) / DAY_MS / (doneDates.length - 1);
  if (!(avgGapDays > 0)) return null;

  const baseYmd = scheduled.length ? scheduled[scheduled.length - 1] : today;
  const missing = remaining - scheduled.length;
  const endMs = parseLocalYmd(baseYmd).getTime() + Math.round(missing * avgGapDays) * DAY_MS;
  return { date: toLocalYmd(new Date(endMs)), approximate: true };
}
