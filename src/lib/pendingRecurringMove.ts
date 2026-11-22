/**
 * Scheduled ("apply from a date") moves for recurring_lesson_slots.
 *
 * A pending move stores the FUTURE day/time on the slot itself
 * (pending_weekday / pending_start_time / pending_effective_date). The base
 * weekday/start_time keep driving lessons before the effective date; the
 * generator swaps to the pending schedule from the effective date onwards and
 * promotes it to the base schedule once that date arrives.
 */
import { supabase } from '@/integrations/supabase/client';
import { getCancunToday } from '@/lib/cancunDate';
import { cadencesOverlap } from '@/lib/recurringCadence';
import { getSlotDurationMinutes, timeToMinutes } from '@/components/calendar/calendarTypes';

export const WEEKDAYS_SHORT_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface PendingMove {
  weekday: number;
  startTime: string;       // HH:MM
  effectiveDate: string;   // YYYY-MM-DD
}

export function normalizeTimeHM(t?: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.substring(0, 5) : t;
}

export function getPendingMove(slot: any): PendingMove | null {
  if (!slot) return null;
  const { pending_weekday, pending_start_time, pending_effective_date } = slot;
  if (pending_weekday === null || pending_weekday === undefined) return null;
  if (!pending_start_time || !pending_effective_date) return null;
  return {
    weekday: Number(pending_weekday),
    startTime: normalizeTimeHM(pending_start_time),
    effectiveDate: String(pending_effective_date).substring(0, 10),
  };
}

export function fmtTime12h(t: string) {
  const [hh, mm] = normalizeTimeHM(t).split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

/** Shift a YYYY-MM-DD date by N days (calendar-safe, no timezone drift). */
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().substring(0, 10);
}

/** "5 oct" / "Oct 5" — day + short month, no year. */
export function formatShortDate(dateStr: string, language: 'es' | 'en' = 'es'): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(dt)
    .replace('.', '');
}

/** "Desde 5 oct" (new card) / "Hasta 4 oct" (ghost card at the old time). */
export function pendingMoveShortLabel(
  move: PendingMove,
  variant: 'from' | 'until' = 'from',
  language: 'es' | 'en' = 'es'
) {
  if (variant === 'until') {
    const last = formatShortDate(addDaysISO(move.effectiveDate, -1), language);
    return language === 'en' ? `Until ${last}` : `Hasta ${last}`;
  }
  const from = formatShortDate(move.effectiveDate, language);
  return language === 'en' ? `From ${from}` : `Desde ${from}`;
}

/** "Cambia a Vie 10:00am desde 2026-10-01" */
export function pendingMoveLabel(move: PendingMove, language: 'es' | 'en' = 'es') {
  const when = `${WEEKDAYS_SHORT_LABEL[move.weekday]} ${fmtTime12h(move.startTime)}`;
  return language === 'en'
    ? `Moves to ${when} from ${move.effectiveDate}`
    : `Cambia a ${when} desde ${move.effectiveDate}`;
}

/** Clears the scheduled change, leaving the slot on its current schedule. */
export async function cancelPendingMove(slotId: string) {
  const { error } = await supabase
    .from('recurring_lesson_slots')
    .update({
      pending_weekday: null,
      pending_start_time: null,
      pending_effective_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId);
  if (error) throw error;
}

/**
 * Conflicts with OTHER students' recurring slots at the target weekday/time,
 * valid from the effective date onwards. Playing Lessons occupy 2 hours, so
 * overlaps are computed on minute ranges, not exact time equality.
 */
export async function findRecurringMoveConflicts(opts: {
  slotId: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  lessonType?: string | null;
  coachId?: string | null;
  effectiveDate?: string | null;
  intervalWeeks?: number | null;
  intervalAnchor?: string | null;
}): Promise<string[]> {
  const start = timeToMinutes(normalizeTimeHM(opts.startTime));
  const end =
    start +
    getSlotDurationMinutes({
      duration_minutes: opts.durationMinutes,
      lesson_type: opts.lessonType ?? null,
    });

  let q = supabase
    .from('recurring_lesson_slots')
    .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, coach_id, pending_weekday, pending_start_time, pending_effective_date, interval_weeks, interval_anchor, pending_interval_weeks, pending_interval_anchor, paused_until, ends_on')
    .eq('is_active', true);
  if (opts.coachId) q = q.eq('coach_id', opts.coachId);
  const { data } = await q;

  const effective = opts.effectiveDate || getCancunToday();
  const conflicts: string[] = [];
  const ids = new Set<string>();

  // A slot that already ended (ends_on <= effective) occupies nothing.
  const rows = ((data as any[]) || []).filter((r) => {
    if (r.id === opts.slotId) return false;
    const endsOn = r.ends_on ? String(r.ends_on).substring(0, 10) : null;
    return !endsOn || endsOn > effective;
  });

  // A slot with a scheduled move only keeps its CURRENT day/time until the
  // move's effective date. That old leg only blocks the new spot if a real
  // (non-cancelled) lesson still exists on it inside that short window —
  // otherwise the spot is effectively free already.
  const oldLegDates = new Map<string, string[]>();
  for (const row of rows) {
    const pending = getPendingMove(row);
    if (!pending || pending.effectiveDate <= effective) continue;
    const dates: string[] = [];
    for (let d = effective; d < pending.effectiveDate; d = addDaysISO(d, 1)) {
      const [y, m, dd] = d.split('-').map((n) => parseInt(n, 10));
      if (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() === Number(row.weekday)) dates.push(d);
    }
    if (dates.length > 0) oldLegDates.set(row.id, dates);
  }
  const oldLegBusy = new Set<string>();
  const oldLegStudentIds = Array.from(
    new Set(rows.filter((r) => oldLegDates.has(r.id)).map((r) => r.student_id).filter(Boolean))
  );
  if (oldLegStudentIds.length > 0) {
    const allDates = Array.from(new Set(Array.from(oldLegDates.values()).flat()));
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('student_id, lesson_date, lesson_time, status')
      .in('student_id', oldLegStudentIds)
      .in('lesson_date', allDates)
      .neq('status', 'cancelled');
    for (const row of rows) {
      const dates = oldLegDates.get(row.id);
      if (!dates) continue;
      const t = normalizeTimeHM(row.start_time);
      const hit = ((lessonRows as any[]) || []).some(
        (l) =>
          l.student_id === row.student_id &&
          dates.includes(String(l.lesson_date).substring(0, 10)) &&
          normalizeTimeHM(l.lesson_time) === t
      );
      if (hit) oldLegBusy.add(row.id);
    }
  }

  for (const row of rows) {
    const pending = getPendingMove(row);
    // Legs of this slot that can collide with a spot starting at `effective`.
    const legs: { weekday: number; time: string; n: number | null; a: string | null }[] = [];
    if (pending) {
      legs.push({
        weekday: pending.weekday,
        time: pending.startTime,
        n: row.pending_interval_weeks ?? row.interval_weeks,
        a: row.pending_interval_anchor ?? row.interval_anchor,
      });
      if (pending.effectiveDate > effective && oldLegBusy.has(row.id)) {
        legs.push({ weekday: row.weekday, time: normalizeTimeHM(row.start_time), n: row.interval_weeks, a: row.interval_anchor });
      }
    } else {
      legs.push({ weekday: row.weekday, time: normalizeTimeHM(row.start_time), n: row.interval_weeks, a: row.interval_anchor });
    }
    for (const leg of legs) {
      if (leg.weekday !== opts.weekday) continue;
      // Custom cadence: only a conflict if both slots can land on the same week.
      if (!cadencesOverlap(opts.intervalWeeks ?? 1, opts.intervalAnchor ?? null, leg.n, leg.a)) continue;
      const s = timeToMinutes(leg.time);
      const e = s + getSlotDurationMinutes(row);
      if (s < end && start < e) {
        if (ids.has(row.id)) continue;
        ids.add(row.id);
        conflicts.push(`${WEEKDAYS_SHORT_LABEL[leg.weekday]} ${fmtTime12h(leg.time)}|${row.student_id ?? ''}`);
      }
    }
  }
  // Attach the student's name: "Ana López · Tue 12:30pm".
  const sids = Array.from(new Set(conflicts.map((c) => c.split('|')[1]).filter(Boolean)));
  const names = new Map<string, string>();
  if (sids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', sids);
    for (const p of (profs as any[]) || []) names.set(p.id, p.full_name || p.email || '');
  }
  return conflicts.map((c) => {
    const [label, sid] = c.split('|');
    const n = sid ? names.get(sid) : '';
    return n ? `${n} · ${label}` : label;
  });
}

export interface RecurringConflictSlot {
  slotId: string;
  studentId: string | null;
  studentName: string;
  weekday: number;
  startTime: string; // HH:MM (schedule in effect at/after the effective date)
  durationMinutes: number;
  lessonType: string | null;
  packageId: string | null;
  noPackageIntentional: boolean;
  intervalWeeks: number;
  intervalAnchor: string | null;
}

/**
 * Same matching rules as findRecurringMoveConflicts (pending leg, cadence,
 * minute-range overlap) but returns the conflicting slots themselves.
 * `excludeSlotIds` lets callers ignore extra slots (e.g. both sides of a swap).
 */
export async function findRecurringMoveConflictSlots(opts: {
  slotId: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  lessonType?: string | null;
  coachId?: string | null;
  effectiveDate?: string | null;
  intervalWeeks?: number | null;
  intervalAnchor?: string | null;
  excludeSlotIds?: string[];
}): Promise<RecurringConflictSlot[]> {
  const start = timeToMinutes(normalizeTimeHM(opts.startTime));
  const end =
    start +
    getSlotDurationMinutes({ duration_minutes: opts.durationMinutes, lesson_type: opts.lessonType ?? null });

  let q = supabase
    .from('recurring_lesson_slots')
    .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, coach_id, package_id, no_package_intentional, pending_weekday, pending_start_time, pending_effective_date, pending_duration_minutes, pending_lesson_type, interval_weeks, interval_anchor, pending_interval_weeks, pending_interval_anchor')
    .eq('is_active', true);
  if (opts.coachId) q = q.eq('coach_id', opts.coachId);
  const { data } = await q;

  const effective = opts.effectiveDate || getCancunToday();
  const exclude = new Set([opts.slotId, ...(opts.excludeSlotIds ?? [])]);
  const out: RecurringConflictSlot[] = [];

  for (const row of (data as any[]) || []) {
    if (exclude.has(row.id)) continue;
    const pending = getPendingMove(row);
    const usePending = pending && pending.effectiveDate <= effective;
    const weekday = usePending ? pending!.weekday : row.weekday;
    const time = normalizeTimeHM(usePending ? pending!.startTime : row.start_time);
    if (weekday !== opts.weekday) continue;
    const rowN = usePending ? (row.pending_interval_weeks ?? row.interval_weeks) : row.interval_weeks;
    const rowA = usePending ? (row.pending_interval_anchor ?? row.interval_anchor) : row.interval_anchor;
    if (!cadencesOverlap(opts.intervalWeeks ?? 1, opts.intervalAnchor ?? null, rowN, rowA)) continue;
    const s = timeToMinutes(time);
    const e = s + getSlotDurationMinutes(row);
    if (s < end && start < e) {
      out.push({
        slotId: row.id,
        studentId: row.student_id ?? null,
        studentName: '',
        weekday,
        startTime: time,
        durationMinutes: row.duration_minutes ?? 60,
        lessonType: row.lesson_type ?? null,
        packageId: row.package_id ?? null,
        noPackageIntentional: !!row.no_package_intentional,
        intervalWeeks: row.interval_weeks ?? 1,
        intervalAnchor: row.interval_anchor ?? null,
      });
    }
  }
export interface FutureSpotConflict {
  slotId: string;
  studentId: string | null;
  studentName: string;
  label: string; // "Wed 5:00pm"
  resumesOn: string; // YYYY-MM-DD — the paused slot's paused_until
}

/**
 * Paused-aware conflict check for creating a NEW recurring spot.
 *
 * A paused slot (paused_until in the future) does NOT hard-block a spot
 * that starts before the pause ends — it only becomes a conflict when the
 * pause lifts, so it is returned in `future` with the resume date. The
 * caller can then create the new spot as TEMPORARY, ending it on the
 * resume date (ends_on = paused_until), so the two never collide.
 *
 * A slot that already ended (ends_on <= effective date) blocks nothing.
 * Everything else that overlaps is a `hard` conflict, same format as
 * findRecurringMoveConflicts ("Ana López · Tue 12:30pm").
 */
export async function findRecurringSpotConflicts(opts: {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  lessonType?: string | null;
  coachId?: string | null;
  effectiveDate?: string | null;
  intervalWeeks?: number | null;
  intervalAnchor?: string | null;
}): Promise<{ hard: string[]; future: FutureSpotConflict[] }> {
  const start = timeToMinutes(normalizeTimeHM(opts.startTime));
  const end =
    start +
    getSlotDurationMinutes({
      duration_minutes: opts.durationMinutes,
      lesson_type: opts.lessonType ?? null,
    });

  let q = supabase
    .from('recurring_lesson_slots')
    .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, coach_id, paused_until, ends_on, pending_weekday, pending_start_time, pending_effective_date, interval_weeks, interval_anchor, pending_interval_weeks, pending_interval_anchor')
    .eq('is_active', true);
  if (opts.coachId) q = q.eq('coach_id', opts.coachId);
  const { data } = await q;

  const effective = opts.effectiveDate || getCancunToday();
  const hard: string[] = [];
  const future: FutureSpotConflict[] = [];
  const seenFuture = new Set<string>();
  const seenHard = new Set<string>();

  for (const row of (data as any[]) || []) {
    const endsOn = row.ends_on ? String(row.ends_on).substring(0, 10) : null;
    if (endsOn && endsOn <= effective) continue;
    const pausedUntil = row.paused_until ? String(row.paused_until).substring(0, 10) : null;
    const isPaused = !!pausedUntil && pausedUntil > effective;
    const pending = getPendingMove(row);
    // Legs that can collide with a spot starting at `effective`.
    const legs: { weekday: number; time: string; n: number | null; a: string | null }[] = [];
    if (pending) {
      legs.push({
        weekday: pending.weekday,
        time: pending.startTime,
        n: row.pending_interval_weeks ?? row.interval_weeks,
        a: row.pending_interval_anchor ?? row.interval_anchor,
      });
      // The old leg only matters until the move takes effect; while paused
      // it is the schedule that resumes, so keep it as the resume leg.
      if (pending.effectiveDate > effective) {
        legs.push({ weekday: row.weekday, time: normalizeTimeHM(row.start_time), n: row.interval_weeks, a: row.interval_anchor });
      }
    } else {
      legs.push({ weekday: row.weekday, time: normalizeTimeHM(row.start_time), n: row.interval_weeks, a: row.interval_anchor });
    }
    for (const leg of legs) {
      if (leg.weekday !== opts.weekday) continue;
      if (!cadencesOverlap(opts.intervalWeeks ?? 1, opts.intervalAnchor ?? null, leg.n, leg.a)) continue;
      const s = timeToMinutes(leg.time);
      const e = s + getSlotDurationMinutes(row);
      if (s < end && start < e) {
        if (isPaused) {
          if (seenFuture.has(row.id)) continue;
          seenFuture.add(row.id);
          future.push({
            slotId: row.id,
            studentId: row.student_id ?? null,
            studentName: '',
            label: `${WEEKDAYS_SHORT_LABEL[leg.weekday]} ${fmtTime12h(leg.time)}`,
            resumesOn: pausedUntil!,
          });
        } else {
          if (seenHard.has(row.id)) continue;
          seenHard.add(row.id);
          hard.push(`${WEEKDAYS_SHORT_LABEL[leg.weekday]} ${fmtTime12h(leg.time)}|${row.student_id ?? ''}`);
        }
      }
    }
  }
  const sids = Array.from(
    new Set([...hard.map((c) => c.split('|')[1]), ...future.map((c) => c.studentId)].filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (sids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', sids);
    for (const p of (profs as any[]) || []) names.set(p.id, p.full_name || p.email || '');
  }
  const hardNamed = hard.map((c) => {
    const [label, sid] = c.split('|');
    const n = sid ? names.get(sid) : '';
    return n ? `${n} · ${label}` : label;
  });
  for (const f of future) f.studentName = (f.studentId && names.get(f.studentId)) || 'Alumno';
  return { hard: hardNamed, future };
}

