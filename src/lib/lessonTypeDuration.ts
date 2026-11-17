import type { LessonTypeValue } from '@/components/LessonDateRows';

/**
 * Standard duration (minutes) per lesson type. Single source of truth:
 * today every lesson type uses the academy-wide 60-minute default (the same
 * value AddLessonModal has always written), so new write paths must derive
 * duration from here instead of hardcoding their own number.
 */
export const LESSON_TYPE_DURATION_MINUTES: Record<LessonTypeValue, number> = {
  Range: 60,
  'Playing Lesson': 120,
};

export const DEFAULT_LESSON_DURATION_MINUTES = 60;

export function durationForLessonType(lessonType: string | null | undefined): number {
  return (
    LESSON_TYPE_DURATION_MINUTES[lessonType as LessonTypeValue] ??
    DEFAULT_LESSON_DURATION_MINUTES
  );
}
