/**
 * Master Calendar — shared types & color tokens.
 *
 * The calendar is the single source of truth for everything that touches a
 * coach time slot: recurring (fixed schedule) lessons, one-time lessons,
 * open spots that students can book/claim, blocked time, and individual
 * skipped weeks of a recurring slot.
 *
 * Every visual surface (dashboard hero, full /admin/calendar page) renders
 * the same SlotItem shape so colors, legend, and behavior stay consistent.
 */

export type SlotKind =
  | 'fixed'      // 🟢 recurring weekly lesson assigned to a student
  | 'one_time'   // 🔵 individual booked lesson (no recurring_slot_id)
  | 'open'       // ⚪ open spot — claimable / bookable
  | 'skipped'    // 🔴 muted recurring occurrence skipped this week
  | 'blocked';   // ⛔ coach blocked time (vacation, full-day off, etc.)

export interface SlotItem {
  id: string;                  // unique within a date+time
  kind: SlotKind;
  date: string;                // ISO YYYY-MM-DD
  start_time: string;          // 'HH:MM'
  duration_minutes: number;
  lesson_type?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  recurring_slot_id?: string | null;
  lesson_id?: string | null;   // present for fixed/one_time/skipped
  notes?: string | null;
  status?: string | null;      // lesson status (scheduled/completed/no_show/cancelled)
  /** Names of OTHER students sharing the underlying package. Empty/undefined = not shared. */
  shared_with?: string[];
  /** The package id backing this slot (recurring.package_id or lesson.package_id), if any. */
  package_id?: string | null;
  /** True when the student attached to this slot has an active paid subscription (scratch/pro/apex). */
  has_active_subscription?: boolean;
  /** Plan tier of the active paid subscription, when present. */
  subscription_tier?: 'scratch' | 'pro' | 'apex' | null;
  /** Lessons left in the student's package (computePackageCounts remaining). Null = no package. */
  package_remaining?: number | null;
  /** Original source row, for downstream actions/edits. */
  raw?: any;
}

/** Short label rendered on tiles next to the student name for paid subs. */
export function subscriptionTierLabel(
  tier?: 'scratch' | 'pro' | 'apex' | null,
): string | null {
  if (!tier) return null;
  if (tier === 'scratch') return 'Scratch';
  if (tier === 'pro') return 'Pro';
  if (tier === 'apex') return 'Apex';
  return null;
}

/**
 * Visual tokens for the small tier badge + left-border accent used across
 * the calendar (Master Calendar tiles, recurring schedule lists, etc.).
 * Keep these aligned with PlanTierBadge.
 */
export function subscriptionTierStyle(
  tier?: 'scratch' | 'pro' | 'apex' | null,
): { text: string; bg: string; border: string; accent: string } | null {
  if (tier === 'scratch') {
    return {
      text: '#86EFAC',
      bg: 'rgba(134,239,172,0.14)',
      border: '1px solid rgba(134,239,172,0.45)',
      accent: '#4ADE80',
    };
  }
  if (tier === 'pro') {
    return {
      text: '#F0C040',
      bg: 'rgba(240,192,64,0.14)',
      border: '1px solid rgba(240,192,64,0.5)',
      accent: '#F0C040',
    };
  }
  if (tier === 'apex') {
    return {
      text: '#93C5FD',
      bg: 'rgba(27,79,138,0.22)',
      border: '1px solid rgba(27,79,138,0.7)',
      accent: '#1B4F8A',
    };
  }
  return null;
}

/**
 * Centralized color tokens for the Master Calendar legend & tiles.
 * Keep these in lockstep with the legend rendered above the grid.
 */
export const SLOT_STYLE: Record<
  SlotKind,
  { label: string; dot: string; bg: string; border: string; text: string }
> = {
  fixed: {
    label: 'Fixed schedule',
    dot: '#4a7c59',
    bg: 'rgba(74,124,89,0.22)',
    border: '1px solid rgba(74,124,89,0.55)',
    text: '#E6F2EA',
  },
  one_time: {
    label: 'One-time lesson',
    dot: '#60a5fa',
    bg: 'rgba(96,165,250,0.18)',
    border: '1px solid rgba(96,165,250,0.55)',
    text: '#DCEAFD',
  },
  open: {
    label: 'Open spot',
    dot: '#F0C040',
    bg: 'rgba(245,240,232,0.04)',
    border: '1px dashed rgba(240,192,64,0.65)',
    text: '#F0C040',
  },
  skipped: {
    label: 'Skipped',
    dot: '#9CA3AF',
    bg: 'rgba(156,163,175,0.10)',
    border: '1px solid rgba(156,163,175,0.35)',
    text: '#9CA3AF',
  },
  blocked: {
    label: 'Blocked',
    dot: '#ef4444',
    bg: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.45)',
    text: '#FCA5A5',
  },
};

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function fmtTime12h(time: string) {
  const [hhRaw, mm] = time.split(':');
  const h = parseInt(hhRaw, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

// Lesson types that must always render as a 2-hour block on the calendar,
// regardless of the stored duration_minutes/end_time. Matched case-insensitively
// and across snake_case / Title Case variants.
const TWO_HOUR_LESSON_TYPES = new Set([
  'campo',
  'playing lesson',
  'playing_lesson',
  'field lesson',
  'field_lesson',
]);

function isTwoHourLessonType(lessonType?: string | null): boolean {
  if (!lessonType) return false;
  return TWO_HOUR_LESSON_TYPES.has(lessonType.trim().toLowerCase());
}

export function timeToMinutes(time: string) {
  const [hhRaw, mmRaw = '0'] = time.split(':');
  return parseInt(hhRaw, 10) * 60 + parseInt(mmRaw, 10);
}

export function getSlotDurationMinutes(
  slot: Pick<SlotItem, 'duration_minutes' | 'lesson_type'> | { duration_minutes?: number | null; lesson_type?: string | null },
  fallback = 60,
) {
  const rawDuration = Number(slot.duration_minutes);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : fallback;
  return isTwoHourLessonType(slot.lesson_type) ? 120 : duration;
}

/**
 * Returns the existing non-open slot that owns `slotStartTime`, using:
 * booking start <= slot time < booking start + booking duration.
 */
export function getSlotBlockedBy(
  slotStartTime: string,
  existingSlots: SlotItem[],
) {
  const slotStart = timeToMinutes(slotStartTime);
  return existingSlots.find((slot) => {
    if (slot.kind === 'open') return false;
    const bookingStart = timeToMinutes(slot.start_time);
    const bookingEnd = bookingStart + getSlotDurationMinutes(slot);
    return bookingStart <= slotStart && slotStart < bookingEnd;
  });
}

/** Returns ISO YYYY-MM-DD for a Date. */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the Sunday-anchored week (7 dates: Sun → Sat) that contains `anchor`.
 * Function name kept for backwards-compat with existing imports.
 */
export function mondayWeek(anchor: Date): Date[] {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}