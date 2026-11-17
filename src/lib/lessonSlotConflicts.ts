import { supabase } from '@/integrations/supabase/client';
import { timeToMinutes, getSlotDurationMinutes } from '@/components/calendar/calendarTypes';
import { weekdayOfDate, formatTime12 } from '@/lib/affectedStudentsOnDate';
import { isCadenceWeek } from '@/lib/recurringCadence';

/**
 * Single source of truth for "is this wall-clock slot free?" on the client.
 *
 * Reuses exactly the sources the Coach calendar merges through
 * useCalendarWeek / useCalendarMonth:
 *   - recurring_lesson_slots (active, projected onto the weekday)
 *   - lessons (any non-cancelled, non-no-show row)
 *   - fixed_schedule_slots (claimed spots for that weekday)
 *   - coach_availability_blocks (full-day or partial blocks)
 *
 * Dates and times are wall-clock in America/Cancun (the same representation
 * stored in lesson_date / lesson_time), so no UTC conversion is applied.
 */
export type SlotConflict = { kind: 'blocked' | 'lesson' | 'recurring' | 'fixed'; label: string };

async function nameMap(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  const m = new Map<string, string>();
  if (uniq.length === 0) return m;
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', uniq);
  for (const p of (data as any[]) || []) m.set(p.id, p.full_name || p.email || 'Alumno');
  return m;
}

/**
 * Dated check (lessons). Minute ranges: [start, start + duration) — Playing
 * Lessons count as 120 min. Two ranges conflict when they overlap.
 */
export async function findSlotConflicts(opts: {
  dateStr: string;              // YYYY-MM-DD (Cancún wall date)
  time: string;                 // HH:MM (Cancún wall time)
  durationMinutes: number;
  lessonType?: string | null;
  coachId?: string | null;
  /** When coachId is absent, scope to this student's coach. */
  studentId?: string | null;
  /** Lesson being edited (never conflicts with itself or its own slot). */
  excludeLessonId?: string | null;
  /** Recurring slot this lesson belongs to. */
  excludeRecurringSlotId?: string | null;
}): Promise<SlotConflict[]> {
  const { dateStr, time } = opts;
  if (!dateStr || !time) return [];
  // Scope to the student's coach (assigned coach, else default coach).
  let coachId = opts.coachId ?? null;
  if (!coachId && opts.studentId) {
    const { data: sp } = await supabase
      .from('profiles').select('assigned_coach_id').eq('id', opts.studentId).maybeSingle();
    coachId = (sp as any)?.assigned_coach_id || '13480fb4-e4d2-423c-b035-c65846b061fc';
  }

  const start = timeToMinutes(time);
  const end = start + getSlotDurationMinutes(
    { duration_minutes: opts.durationMinutes, lesson_type: opts.lessonType ?? null },
  );
  const overlaps = (s: number, e: number) => s < end && start < e;
  const weekday = weekdayOfDate(dateStr);

  const byCoach = <T extends { eq: (c: string, v: any) => T }>(q: T) =>
    coachId ? q.eq('coach_id', coachId) : q;

  const [blocksRes, lessonsRes, recurringRes, fixedRes] = await Promise.all([
    byCoach(supabase
      .from('coach_availability_blocks')
      .select('block_date, start_time, end_time, reason, coach_id')
      .eq('block_date', dateStr) as any),
    byCoach(supabase
      .from('lessons')
      .select('id, student_id, recurring_slot_id, lesson_time, duration_minutes, lesson_type, status, coach_id, skipped')
      .eq('lesson_date', dateStr)
      .neq('status', 'cancelled') as any),
    byCoach(supabase
      .from('recurring_lesson_slots')
      .select('id, student_id, start_time, duration_minutes, lesson_type, is_active, weekday, coach_id, starts_on, paused_until, interval_weeks, interval_anchor, pending_effective_date, pending_weekday, pending_start_time, pending_duration_minutes, pending_lesson_type, pending_interval_weeks, pending_interval_anchor')
      .eq('is_active', true) as any),
    byCoach(supabase
      .from('fixed_schedule_slots')
      .select('id, start_time, duration_minutes, lesson_type, day_of_week, student_id, is_available, coach_id')
      .eq('day_of_week', weekday) as any),
  ]);

  // A no-show frees the spot: the student didn't come, so the coach can book it.
  const lessons = ((lessonsRes.data as any[]) || []).filter(
    (l) => l.id !== opts.excludeLessonId && !l.skipped && l.status !== 'no_show',
  );
  // A recurring slot that already produced a lesson that day (even a cancelled
  // one) is represented by that lesson; don't project it again.
  const { data: allDayLessons } = await (byCoach(supabase
    .from('lessons')
    .select('recurring_slot_id, coach_id')
    .eq('lesson_date', dateStr)
    .not('recurring_slot_id', 'is', null) as any) as any);
  const slotsWithLesson = new Set(
    [...((lessonsRes.data as any[]) || []), ...((allDayLessons as any[]) || [])]
      .map((l) => l.recurring_slot_id)
      .filter(Boolean),
  );
  // Resolve the configuration in effect on dateStr (pending_* once effective),
  // then keep only slots that land on this weekday and cadence week.
  const recurring = ((recurringRes.data as any[]) || [])
    .map((r) => {
      const eff = r.pending_effective_date && String(r.pending_effective_date).substring(0, 10) <= dateStr;
      if (!eff) return r;
      return {
        ...r,
        weekday: r.pending_weekday ?? r.weekday,
        start_time: r.pending_start_time ?? r.start_time,
        duration_minutes: r.pending_duration_minutes ?? r.duration_minutes,
        lesson_type: r.pending_lesson_type ?? r.lesson_type,
        interval_weeks: r.pending_interval_weeks ?? r.interval_weeks,
        interval_anchor: r.pending_interval_anchor ?? r.interval_anchor,
      };
    })
    .filter(
      (r) =>
        r.weekday === weekday &&
        r.id !== opts.excludeRecurringSlotId &&
        !slotsWithLesson.has(r.id) &&
        !(r.starts_on && String(r.starts_on).substring(0, 10) > dateStr) &&
        // Paused slot is free before paused_until (same rule as Live Calendar).
        !(r.paused_until && dateStr < String(r.paused_until).substring(0, 10)) &&
        isCadenceWeek(dateStr, r.interval_anchor, r.interval_weeks),
    );
  const fixed = ((fixedRes.data as any[]) || []).filter((f) => f.student_id);
  const names = await nameMap([
    ...lessons.map((l) => l.student_id),
    ...recurring.map((r) => r.student_id),
    ...fixed.map((f) => f.student_id),
  ]);
  const who = (id?: string | null) => (id && names.get(id)) || 'otro alumno';

  const conflicts: SlotConflict[] = [];

  for (const b of (blocksRes.data as any[]) || []) {
    if (!b.start_time && !b.end_time) {
      conflicts.push({ kind: 'blocked', label: `Día bloqueado${b.reason ? ` (${b.reason})` : ''}` });
    } else if (b.start_time && b.end_time) {
      if (overlaps(timeToMinutes(b.start_time), timeToMinutes(b.end_time))) {
        conflicts.push({
          kind: 'blocked',
          label: `Horario bloqueado ${formatTime12(b.start_time)}–${formatTime12(b.end_time)}`,
        });
      }
    }
  }

  for (const l of lessons) {
    if (!l.lesson_time) continue;
    const s = timeToMinutes(l.lesson_time);
    if (overlaps(s, s + getSlotDurationMinutes(l))) {
      conflicts.push({ kind: 'lesson', label: `${who(l.student_id)} · ${formatTime12(l.lesson_time)}` });
    }
  }

  for (const r of recurring) {
    const s = timeToMinutes(r.start_time);
    if (overlaps(s, s + getSlotDurationMinutes(r))) {
      conflicts.push({ kind: 'recurring', label: `${who(r.student_id)} · ${formatTime12(r.start_time)} (recurrente)` });
    }
  }

  for (const f of fixed) {
    const s = timeToMinutes(f.start_time);
    if (overlaps(s, s + getSlotDurationMinutes(f))) {
      conflicts.push({ kind: 'fixed', label: `${who(f.student_id)} · ${formatTime12(f.start_time)} (horario fijo)` });
    }
  }

  return conflicts;
}

/**
 * Weekly check (open spots / fixed slots): overlaps with active recurring
 * slots and with other fixed spots on the same weekday, by minutes.
 */
export async function findWeeklySlotConflicts(opts: {
  weekday: number;
  time: string;
  durationMinutes: number;
  lessonType?: string | null;
  coachId?: string | null;
  excludeFixedId?: string | null;
  excludeRecurringSlotId?: string | null;
}): Promise<string[]> {
  if (!opts.time) return [];
  const start = timeToMinutes(opts.time);
  const end = start + getSlotDurationMinutes({ duration_minutes: opts.durationMinutes, lesson_type: opts.lessonType ?? null });
  const overlaps = (s: number, e: number) => s < end && start < e;
  let rq: any = supabase
    .from('recurring_lesson_slots')
    .select('id, student_id, start_time, duration_minutes, lesson_type')
    .eq('weekday', opts.weekday)
    .eq('is_active', true);
  let fq: any = supabase
    .from('fixed_schedule_slots')
    .select('id, student_id, start_time, duration_minutes, lesson_type')
    .eq('day_of_week', opts.weekday);
  if (opts.coachId) { rq = rq.eq('coach_id', opts.coachId); fq = fq.eq('coach_id', opts.coachId); }
  const [rRes, fRes] = await Promise.all([rq, fq]);
  const rec = ((rRes.data as any[]) || []).filter((r) => r.id !== opts.excludeRecurringSlotId);
  const fix = ((fRes.data as any[]) || []).filter((f) => f.id !== opts.excludeFixedId);
  const names = await nameMap([...rec.map((r) => r.student_id), ...fix.map((f) => f.student_id)]);
  const out: string[] = [];
  for (const r of rec) {
    const s = timeToMinutes(r.start_time);
    if (overlaps(s, s + getSlotDurationMinutes(r))) out.push(`${names.get(r.student_id) || 'otro alumno'} · ${formatTime12(r.start_time)}`);
  }
  for (const f of fix) {
    const s = timeToMinutes(f.start_time);
    if (overlaps(s, s + getSlotDurationMinutes(f))) {
      out.push(`${f.student_id ? names.get(f.student_id) || 'otro alumno' : 'Horario abierto'} · ${formatTime12(f.start_time)}`);
    }
  }
  return out;
}
