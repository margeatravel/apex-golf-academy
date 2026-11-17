import { supabase } from '@/integrations/supabase/client';

/**
 * Turns a PROJECTED recurring occurrence (a recurring_lesson_slots row rendered
 * on a given date with no concrete `lessons` row yet) into a real lesson row.
 *
 * The creation itself is NOT duplicated here: it delegates to the same
 * `generate-recurring-lessons` edge function that materializes projections in
 * bulk, so the written fields (student, date, time, duration, lesson_type,
 * package_id, recurring_slot_id, auto_generated, currency, coach) are identical
 * and the package budget rules are the same.
 *
 * Idempotent: if a row already exists for that slot+date (or student+date+time)
 * its id is returned and nothing new is created.
 */
export async function materializeRecurringLesson(
  recurringSlotId: string,
  dateStr: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-recurring-lessons', {
    body: { materialize_slot_id: recurringSlotId, materialize_date: dateStr },
  });
  if (error) throw error;
  if (!data?.ok || !data?.lesson_id) {
    throw new Error(data?.error || 'Could not create the lesson for this recurring slot.');
  }
  return data.lesson_id as string;
}

/**
 * Resolves a Today's Schedule / calendar row to a concrete lesson id,
 * materializing the projection first when needed.
 */
export async function ensureLessonRowId(lesson: {
  id: string;
  _hasLessonRow?: boolean;
  recurring_slot_id?: string | null;
  lesson_date?: string | null;
}): Promise<string> {
  if (lesson._hasLessonRow !== false) return lesson.id;
  if (!lesson.recurring_slot_id || !lesson.lesson_date) {
    throw new Error('This projected lesson has no recurring slot to materialize.');
  }
  return materializeRecurringLesson(lesson.recurring_slot_id, lesson.lesson_date);
}

/**
 * Removes a lesson from the calendar. Recurring occurrences are not hard
 * deleted (the weekly slot would re-project them); they are marked cancelled
 * + skipped so they disappear and free the time. One-off lessons are deleted.
 */
export async function removeLessonFromCalendar(lesson: {
  id: string;
  recurring_slot_id?: string | null;
}) {
  if (lesson.recurring_slot_id) {
    return supabase
      .from('lessons')
      .update({ status: 'cancelled' as any, skipped: true, skip_keep_closed: false } as any)
      .eq('id', lesson.id);
  }
  return supabase.from('lessons').delete().eq('id', lesson.id);
}

/**
 * "Delete this lesson only" for a recurring occurrence. Stored lesson → same
 * exception as Skip this week (cancelled + skipped, open). Projected occurrence
 * (no lesson row yet) → insert the skip exception so the generator won't create it.
 */
export async function deleteRecurringOccurrence(slot: {
  lesson_id?: string | null;
  recurring_slot_id?: string | null;
  student_id?: string | null;
  date: string;
  start_time: string;
  duration_minutes?: number | null;
  lesson_type?: string | null;
  package_id?: string | null;
  coach_id?: string | null;
}) {
  if (slot.lesson_id) {
    return removeLessonFromCalendar({ id: slot.lesson_id, recurring_slot_id: slot.recurring_slot_id ?? null });
  }
  if (!slot.recurring_slot_id || !slot.student_id) {
    return { error: new Error('No lesson to delete') } as any;
  }
  return supabase.from('lessons').insert({
    student_id: slot.student_id,
    lesson_date: slot.date,
    lesson_time: `${slot.start_time.slice(0, 5)}:00`,
    duration_minutes: slot.duration_minutes ?? 60,
    lesson_type: slot.lesson_type ?? 'Range',
    recurring_slot_id: slot.recurring_slot_id,
    auto_generated: true,
    status: 'cancelled' as any,
    skipped: true,
    skipped_at: new Date().toISOString(),
    skip_keep_closed: false,
    package_id: slot.package_id ?? null,
    coach_id: slot.coach_id ?? undefined,
    currency: 'MXN',
  } as any);
}
