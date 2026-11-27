// Recurring schedule change requests — shared rules and helpers.
//
// Santiago's rules (27 Nov 2026):
//   * the change is free, but needs coach approval; the student's current
//     schedule stays while the request is under review;
//   * max recurring schedules per week: Scratch 1, Pro 2, Apex 2;
//   * if two students want the same slot, Scratch and Pro win (priority
//     plans). Apex is treated like Pro here — it is the top paid plan with a
//     fixed spot, so it would be odd for it to lose to Scratch.
// Priority is enforced at approval time (coach review queue) and at claim
// time (claim-recurring-slot edge function), not just in the UI.

export type RecurringChangeRequestType = 'change' | 'add_second';
export type RecurringChangeStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface ChangeRequestRow {
  id: string;
  student_id: string;
  coach_id: string | null;
  request_type: RecurringChangeRequestType;
  current_slot_kind: 'fixed' | 'recurring' | null;
  current_slot_id: string | null;
  target_slot_id: string;
  target_weekday: number;
  target_start_time: string;
  target_duration_minutes: number;
  target_lesson_type: string | null;
  plan_at_request: string | null;
  status: RecurringChangeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Max distinct weekly recurring schedules per effective plan. */
export const RECURRING_SLOT_LIMITS: Record<string, number> = {
  scratch: 1,
  pro: 2,
  apex: 2,
};

export function maxRecurringSlotsForPlan(plan?: string | null): number {
  if (!plan) return 0;
  return RECURRING_SLOT_LIMITS[plan.toLowerCase()] ?? 0;
}

/** Plans that win when two students want the same slot. */
export const PRIORITY_PLANS = ['scratch', 'pro', 'apex'] as const;

export function isPriorityPlan(plan?: string | null): boolean {
  if (!plan) return false;
  return (PRIORITY_PLANS as readonly string[]).includes(plan.toLowerCase());
}

/** Review-queue order: Apex first, then Pro, then Scratch, then the rest. */
export function planPriorityRank(plan?: string | null): number {
  switch ((plan ?? '').toLowerCase()) {
    case 'apex':
      return 0;
    case 'pro':
      return 1;
    case 'scratch':
      return 2;
    default:
      return 3;
  }
}

/** "HH:MM" (or "HH:MM:SS") -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = String(time).split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + (m || 0);
}

export function timeRangesOverlap(
  aStart: string,
  aDurationMinutes: number,
  bStart: string,
  bDurationMinutes: number,
): boolean {
  const a0 = toMinutes(aStart);
  const a1 = a0 + (aDurationMinutes || 60);
  const b0 = toMinutes(bStart);
  const b1 = b0 + (bDurationMinutes || 60);
  return a0 < b1 && b0 < a1;
}

/**
 * Next occurrence of a weekday, in Cancún (YYYY-MM-DD), strictly after the
 * given date — never today. Approved moves take effect "from next week", so a
 * Monday request for a Monday slot applies the following Monday.
 */
export function nextOccurrenceOfWeekday(weekday: number, fromCancunDate?: string): string {
  const base = fromCancunDate ?? new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const [y, m, d] = base.split('-').map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  let daysAhead = (weekday - date.getUTCDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  date.setUTCDate(date.getUTCDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Weekday name for a 0=Sunday..6=Saturday index, in the given language. */
export function weekdayName(weekday: number, language: 'es' | 'en'): string {
  // 2026-11-29 is a Sunday; adding the weekday index gives that weekday.
  const date = new Date(Date.UTC(2026, 10, 29 + weekday));
  return new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Distinct weekly schedules, keyed by weekday + start time. */
export function distinctScheduleCount(
  schedules: { weekday: number; startTime: string }[],
): number {
  const keys = new Set(schedules.map((s) => `${s.weekday}|${String(s.startTime).slice(0, 5)}`));
  return keys.size;
}
