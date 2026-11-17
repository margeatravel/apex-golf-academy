import { fetchMovedOccurrenceKeys } from './movedOccurrences';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSlotBlockedBy, getSlotDurationMinutes, SlotItem, SlotKind, timeToMinutes, toISODate } from './calendarTypes';
import { buildProjectionBudget } from './projectionBudget';
import { isCadenceWeek } from '@/lib/recurringCadence';
import { resolveStudentTiers } from './resolveStudentTiers';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { buildDemoCalendarWeek } from '@/data/demoData';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Aggregates the same five slot kinds as `useCalendarWeek` but spans an
 * arbitrary month window (start..end inclusive). Returned as date → slots
 * so MonthCalendarView can show counts and dot summaries per day.
 */
export function useCalendarMonth(monthDates: Date[]) {
  const { user, effectiveCoachId } = useAuth();
  const startDate = monthDates.length ? toISODate(monthDates[0]) : '';
  const endDate = monthDates.length ? toISODate(monthDates[monthDates.length - 1]) : '';

  return useQuery({
    queryKey: ['master-calendar-month', startDate, endDate, effectiveCoachId ?? user?.id, isDemoModeActive() ? 'demo' : 'live'],
    enabled: !!startDate && !!endDate && (isDemoModeActive() || !!(effectiveCoachId ?? user?.id)),
    queryFn: async (): Promise<Record<string, SlotItem[]>> => {
      if (isDemoModeActive()) {
        return buildDemoCalendarWeek(monthDates);
      }
      const dateList = monthDates.map(toISODate);
      const map: Record<string, SlotItem[]> = Object.fromEntries(
        dateList.map((d) => [d, []]),
      );

      // Scope to the signed-in coach (or the coach being previewed by admin).
      const coachId = effectiveCoachId ?? user?.id ?? null;

      const recurringQuery = supabase
        .from('recurring_lesson_slots')
        .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, is_active, package_id, starts_on, interval_weeks, interval_anchor')
        .eq('is_active', true);
      if (coachId) recurringQuery.eq('coach_id', coachId);

      const openQuery = supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, is_available, student_id, specific_date')
        .is('student_id', null)
        .eq('is_available', true);
      if (coachId) openQuery.eq('coach_id', coachId);

      const lessonsQuery = supabase
        .from('lessons')
        .select('id, student_id, lesson_date, lesson_time, duration_minutes, lesson_type, status, revenue, recurring_slot_id, skipped, invitee_name')
        .gte('lesson_date', startDate)
        .lte('lesson_date', endDate);
      if (coachId) lessonsQuery.eq('coach_id', coachId);

      const blocksQuery = supabase
        .from('coach_availability_blocks')
        .select('id, block_date, start_time, end_time, reason')
        .gte('block_date', startDate)
        .lte('block_date', endDate);
      if (coachId) blocksQuery.eq('coach_id', coachId);

      const [{ data: recurring = [] }, { data: openSpots = [] }, { data: lessons = [] }, { data: blocks = [] }] =
        await Promise.all([recurringQuery, openQuery, lessonsQuery, blocksQuery]);

      // Paid tier (Stripe subs + manual plan overrides on profile)
      const tierStudentIds = [
        ...(recurring || []).map((r: any) => r.student_id),
        ...(lessons || []).map((l: any) => l.student_id),
      ].filter(Boolean) as string[];
      const { hasPaidSub, tierOf } = await resolveStudentTiers(tierStudentIds);

      const allowedProjections = await buildProjectionBudget((recurring || []) as any);
      const movedKeys = await fetchMovedOccurrenceKeys((recurring || []) as any, startDate, endDate, coachId);

      const lessonAt = new Map<string, any>();
      (lessons || []).forEach((l: any) => {
        if (!l.lesson_date || !l.lesson_time) return;
        lessonAt.set(`${l.lesson_date}|${String(l.lesson_time).slice(0, 5)}`, l);
      });

      // Pre-index concrete lessons per date with their effective interval so
      // we can (a) suppress projected tiles that a multi-hour lesson already
      // covers and (b) inject `blocked` overlap tiles for the secondary
      // hours of a 2h Playing Lesson.
      type LessonInterval = { startMin: number; endMin: number; lesson: any };
      const lessonIntervalsByDate = new Map<string, LessonInterval[]>();
      (lessons || []).forEach((l: any) => {
        if (!l.lesson_date || !l.lesson_time) return;
        if (l.skipped) return;
        if (l.status === 'cancelled') return;
        const sMin = timeToMinutes(String(l.lesson_time).slice(0, 5));
        const dur = getSlotDurationMinutes({
          duration_minutes: l.duration_minutes,
          lesson_type: l.lesson_type,
        });
        const arr = lessonIntervalsByDate.get(l.lesson_date) || [];
        arr.push({ startMin: sMin, endMin: sMin + dur, lesson: l });
        lessonIntervalsByDate.set(l.lesson_date, arr);
      });
      const findCoveringLesson = (iso: string, hhmm: string) => {
        const s = timeToMinutes(hhmm);
        const arr = lessonIntervalsByDate.get(iso) || [];
        return arr.find((it) => s > it.startMin && s < it.endMin);
      };

      const weekdayOf = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).getDay();
      };

      // Project recurring + resolve conflicts
      const offWeek: Array<{ iso: string; r: any }> = [];
      for (const iso of dateList) {
        const wd = weekdayOf(iso);
        for (const r of recurring || []) {
          if ((r as any).weekday !== wd) continue;
          const startsOn = (r as any).starts_on
            ? String((r as any).starts_on).substring(0, 10)
            : null;
          if (startsOn && iso < startsOn) continue;
          // Custom cadence: off weeks don't project the student.
          if (!isCadenceWeek(iso, (r as any).interval_anchor, (r as any).interval_weeks)) {
            offWeek.push({ iso, r });
            continue;
          }
          if (movedKeys.has(`${iso}|${(r as any).id}`)) continue;
          const t = String((r as any).start_time).slice(0, 5);
          const lessonHere = lessonAt.get(`${iso}|${t}`);
          if (lessonHere) {
            if (!lessonHere.skipped) {
              const kind: SlotKind = lessonHere.recurring_slot_id ? 'fixed' : 'one_time';
              const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
              if (blockingSlot && blockingSlot.start_time !== t) {
                lessonAt.delete(`${iso}|${t}`);
                continue;
              }
              map[iso].push({
                id: `lesson-${lessonHere.id}`,
                kind,
                date: iso,
                start_time: t,
                duration_minutes: lessonHere.duration_minutes ?? r.duration_minutes ?? 60,
                lesson_type: lessonHere.lesson_type ?? r.lesson_type,
                student_id: lessonHere.student_id ?? r.student_id,
                status: lessonHere.status,
                has_active_subscription: hasPaidSub(lessonHere.student_id ?? r.student_id),
                subscription_tier: tierOf(lessonHere.student_id ?? r.student_id),
                raw: { lesson: lessonHere, recurring: r },
              });
            }
            lessonAt.delete(`${iso}|${t}`);
          } else {
            if ((r as any).package_id && !allowedProjections.has(`${r.id}|${iso}`)) {
              const dur = r.duration_minutes ?? 60;
              const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
              if (!blockingSlot && !findCoveringLesson(iso, t)) {
                map[iso].push({
                  id: `open-rec-${r.id}-${iso}`,
                  kind: 'open',
                  date: iso,
                  start_time: t,
                  duration_minutes: dur,
                  lesson_type: r.lesson_type,
                  raw: { recurring: r, exhausted: true },
                });
              }
              continue;
            }
            const recBlocking = getSlotBlockedBy(t, map[iso] || []);
            if (recBlocking && recBlocking.start_time !== t) continue;
            if (findCoveringLesson(iso, t)) continue;
            map[iso].push({
              id: `rec-${r.id}-${iso}`,
              kind: 'fixed',
              date: iso,
              start_time: t,
              duration_minutes: r.duration_minutes ?? 60,
              lesson_type: r.lesson_type,
              student_id: r.student_id,
              has_active_subscription: hasPaidSub(r.student_id),
                subscription_tier: tierOf(r.student_id),
              raw: { recurring: r },
            });
          }
        }
      }

      // Off-cadence weeks render as an open spot unless something else occupies the time.
      for (const { iso, r } of offWeek) {
        if (!map[iso]) continue;
        const t = String(r.start_time).slice(0, 5);
        if (getSlotBlockedBy(t, map[iso] || [])) continue;
        if (findCoveringLesson(iso, t)) continue;
        map[iso].push({
          id: `open-cad-${r.id}-${iso}`,
          kind: 'open',
          date: iso,
          start_time: t,
          duration_minutes: r.duration_minutes ?? 60,
          lesson_type: r.lesson_type,
          raw: { recurring: r, offWeek: true },
        });
      }

      // remaining lessons (one-times)
      for (const [, l] of lessonAt) {
        if (l.skipped) continue;
        const iso = l.lesson_date as string;
        if (!map[iso]) continue;
        const t = String(l.lesson_time).slice(0, 5);
        const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
        if (blockingSlot && blockingSlot.start_time !== t) continue;
        const kind: SlotKind = l.recurring_slot_id ? 'fixed' : 'one_time';
        map[iso].push({
          id: `lesson-${l.id}`,
          kind,
          date: iso,
          start_time: t,
          duration_minutes: l.duration_minutes ?? 60,
          lesson_type: l.lesson_type,
          student_id: l.student_id,
          status: l.status,
          has_active_subscription: hasPaidSub(l.student_id),
                subscription_tier: tierOf(l.student_id),
          raw: { lesson: l },
        });
      }

      // open spots (skip if any non-open slot overlaps the open spot's time range)
      for (const iso of dateList) {
        const wd = weekdayOf(iso);
        for (const o of openSpots || []) {
          const specific = (o as any).specific_date as string | null | undefined;
          if (specific) {
            if (String(specific).slice(0, 10) !== iso) continue;
          } else if ((o as any).day_of_week !== wd) continue;
          const t = String((o as any).start_time).slice(0, 5);
          const openDuration = getSlotDurationMinutes(o as any);
          const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
          if (blockingSlot) {
            if (blockingSlot.start_time !== t) {
              map[iso].push({
                id: `blocked-overlap-${o.id}-${iso}`,
                kind: 'blocked',
                date: iso,
                start_time: t,
                duration_minutes: openDuration,
                lesson_type: blockingSlot.lesson_type ? `${blockingSlot.lesson_type} overlap` : 'Unavailable',
                notes: 'Blocked by existing lesson',
                raw: { open: o, blockedBySlot: blockingSlot },
              });
            }
            continue;
          }
          map[iso].push({
            id: `open-${o.id}-${iso}`,
            kind: 'open',
            date: iso,
            start_time: t,
            duration_minutes: (o as any).duration_minutes ?? 60,
            lesson_type: (o as any).lesson_type ?? 'Range',
            raw: { open: o },
          });
        }
      }

      // blocks
      for (const b of blocks || []) {
        const iso = b.block_date as string;
        if (!map[iso]) continue;
        const isFullDay = !b.start_time || !b.end_time;
        map[iso].push({
          id: `block-${b.id}`,
          kind: 'blocked',
          date: iso,
          start_time: b.start_time ? String(b.start_time).slice(0, 5) : '00:00',
          duration_minutes: isFullDay ? 24 * 60 : 60,
          lesson_type: 'Blocked',
          notes: b.reason ?? null,
          raw: { block: b },
        });
      }

      for (const iso of dateList) {
        // ── inject `blocked` overlap tiles for the secondary hours of
        // multi-hour lessons (Playing Lesson 9-11 → blocked tile at 10).
        const dayIntervals = lessonIntervalsByDate.get(iso) || [];
        for (const it of dayIntervals) {
          if (it.endMin - it.startMin <= 60) continue;
          for (let m = it.startMin + 60; m < it.endMin; m += 60) {
            const hh = String(Math.floor(m / 60)).padStart(2, '0');
            const mm = String(m % 60).padStart(2, '0');
            const t = `${hh}:${mm}`;
            const existing = (map[iso] || []).find(
              (s) => s.start_time === t && s.kind !== 'open',
            );
            if (existing) continue;
            map[iso] = (map[iso] || []).filter(
              (s) => !(s.start_time === t && s.kind === 'open'),
            );
            map[iso].push({
              id: `blocked-lesson-${it.lesson.id}-${t}`,
              kind: 'blocked',
              date: iso,
              start_time: t,
              duration_minutes: 60,
              lesson_type: it.lesson.lesson_type
                ? `${it.lesson.lesson_type} overlap`
                : 'Unavailable',
              notes: 'Blocked by existing lesson',
              raw: { blockedByLesson: it.lesson },
            });
          }
        }

        const hasFullDayBlock = (map[iso] || []).some(
          (s) => s.kind === 'blocked' && s.duration_minutes >= 24 * 60,
        );
        if (hasFullDayBlock) {
          map[iso] = map[iso].filter(
            (s) => s.kind === 'blocked' || !!s.lesson_id || s.status === 'cancelled',
          );
        }
        map[iso].sort((a, b) => a.start_time.localeCompare(b.start_time));
      }
      return map;
    },
  });
}

/**
 * Builds a 6×7 grid (42 dates) anchored at the first Monday on/before
 * the 1st of the anchor's month. Always includes leading/trailing days
 * from neighboring months so the calendar grid is complete.
 */
export function monthGridDates(anchor: Date): { dates: Date[]; firstOfMonth: Date } {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const dow = firstOfMonth.getDay();
  const diffToMon = (dow + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - diffToMon);
  const dates = Array.from({ length: 42 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x;
  });
  return { dates, firstOfMonth };
}