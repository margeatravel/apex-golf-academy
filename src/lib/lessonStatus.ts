import { getTodayInAppTimezone } from '@/lib/formatLessonDateTime';

const APP_TZ = 'America/Cancun';

function dateStrFor(lesson: { lesson_date?: string | null; lesson_start_at?: string | null }): string | null {
  if (lesson.lesson_start_at) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(lesson.lesson_start_at));
  }
  return lesson.lesson_date ?? null;
}

/**
 * If a lesson is marked `completed` but its date is in the future,
 * treat it as `scheduled` for display/counting purposes. Future-dated
 * lessons cannot have happened yet, regardless of stored status.
 */
export function effectiveLessonStatus(
  lesson: { status?: string | null; lesson_date?: string | null; lesson_start_at?: string | null },
  todayStr: string = getTodayInAppTimezone(),
): string {
  const status = lesson.status ?? 'scheduled';
  if (status === 'completed' || status === 'no_show') {
    const d = dateStrFor(lesson);
    if (d && d > todayStr) return 'scheduled';
  }
  return status;
}

/** Completed and no-show are both lessons taken for history and package usage. */
export function isEffectivelyTaken(
  lesson: { status?: string | null; lesson_date?: string | null; lesson_start_at?: string | null },
  todayStr: string = getTodayInAppTimezone(),
): boolean {
  const status = effectiveLessonStatus(lesson, todayStr);
  return status === 'completed' || status === 'no_show';
}

/** True if this lesson should be counted as a completed/past lesson. */
export function isEffectivelyCompleted(
  lesson: { status?: string | null; lesson_date?: string | null; lesson_start_at?: string | null },
  todayStr: string = getTodayInAppTimezone(),
): boolean {
  return effectiveLessonStatus(lesson, todayStr) === 'completed';
}