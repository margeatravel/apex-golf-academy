import { fetchMovedOccurrenceKeys } from './movedOccurrences';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSlotBlockedBy, getSlotDurationMinutes, SlotItem, timeToMinutes, toISODate } from './calendarTypes';
import { buildProjectionBudget } from './projectionBudget';
import { isCadenceWeek } from '@/lib/recurringCadence';
import { resolveStudentTiers } from './resolveStudentTiers';
import { fetchLinkablePackagesByStudent } from '@/lib/recurringSlotPackages';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { buildDemoCalendarWeek } from '@/data/demoData';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Aggregates all sources of truth for the Master Calendar within a date range:
 *  - recurring_lesson_slots  → fixed weekly slots (projected onto each date)
 *  - lessons (any student)   → realized one-time bookings, plus skipped flags
 *                              and overrides of recurring occurrences
 *  - fixed_schedule_slots    → unclaimed open priority spots (projected weekly)
 *  - coach_availability_blocks → blocked time
 *
 * Returns a date → SlotItem[] map ordered by start time.
 *
 * Conflict rules:
 *  • A lesson row at (date, time) takes precedence over a projected recurring
 *    or open spot at the same (date, time).
 *  • A skipped lesson row keeps its tile (rendered muted) AND frees the
 *    underlying recurring slot for the booking system, but for display we
 *    keep showing the skipped tile so the coach knows what was skipped.
 */
export function useCalendarWeek(weekDates: Date[]) {
  const { user, effectiveCoachId } = useAuth();
  const startDate = weekDates.length ? toISODate(weekDates[0]) : '';
  const endDate = weekDates.length ? toISODate(weekDates[weekDates.length - 1]) : '';

  return useQuery({
    queryKey: ['master-calendar-week', startDate, endDate, effectiveCoachId ?? user?.id, isDemoModeActive() ? 'demo' : 'live'],
    enabled: !!startDate && !!endDate && (isDemoModeActive() || !!(effectiveCoachId ?? user?.id)),
    queryFn: async (): Promise<Record<string, SlotItem[]>> => {
      if (isDemoModeActive()) {
        return buildDemoCalendarWeek(weekDates);
      }
      const dateList = weekDates.map(toISODate);
      const map: Record<string, SlotItem[]> = Object.fromEntries(
        dateList.map((d) => [d, []]),
      );

      // Scope every source to the signed-in coach so coaches only see
      // (and can act on) their own data. When an admin is previewing another
      // coach, use that coach's id so the calendar mirrors their portal.
      const coachId = effectiveCoachId ?? user?.id ?? null;

      // ── recurring slots (fixed schedule)
      const recurringQuery = supabase
        .from('recurring_lesson_slots')
        .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, notes, is_active, package_id, starts_on, paused_until, ends_on, interval_weeks, interval_anchor')
        .eq('is_active', true);
      if (coachId) recurringQuery.eq('coach_id', coachId);
      const { data: recurring = [] } = await recurringQuery;

      // ── per-package projection budget (stops projecting once package runs out)
      const allowedProjections = await buildProjectionBudget(
        (recurring || []) as any,
      );

      // ── unclaimed open priority spots (weekly recurring openings)
      const openQuery = supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, notes, is_available, student_id, specific_date')
        .is('student_id', null)
        .eq('is_available', true);
      if (coachId) openQuery.eq('coach_id', coachId);
      const { data: openSpots = [] } = await openQuery;

      // ── concrete lessons in range (any student)
      const lessonsQuery = supabase
        .from('lessons')
        .select('id, student_id, lesson_date, lesson_time, duration_minutes, lesson_type, status, revenue, recurring_slot_id, skipped, skip_keep_closed, invitee_name, package_id')
        .gte('lesson_date', startDate)
        .lte('lesson_date', endDate);
      if (coachId) lessonsQuery.eq('coach_id', coachId);
      const { data: lessons = [] } = await lessonsQuery;
      const movedKeys = await fetchMovedOccurrenceKeys((recurring || []) as any, startDate, endDate, coachId);

      // ── blocks in range
      const blocksQuery = supabase
        .from('coach_availability_blocks')
        .select('id, block_date, start_time, end_time, reason')
        .gte('block_date', startDate)
        .lte('block_date', endDate);
      if (coachId) blocksQuery.eq('coach_id', coachId);
      const { data: blocks = [] } = await blocksQuery;

      // ── paid tier (Stripe subs + manual plan overrides on profile)
      const tierStudentIds = [
        ...(recurring || []).map((r: any) => r.student_id),
        ...(lessons || []).map((l: any) => l.student_id),
      ].filter(Boolean) as string[];
      const { hasPaidSub, tierOf } = await resolveStudentTiers(tierStudentIds);

      // ── student profiles (for names)
      const studentIds = Array.from(
        new Set(
          [
            ...(recurring || []).map((r: any) => r.student_id),
            ...(lessons || []).map((l: any) => l.student_id),
          ].filter(Boolean),
        ),
      );
      const profileById = new Map<string, any>();
      if (studentIds.length) {
        const { data: profiles = [] } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);
        (profiles || []).forEach((p: any) => profileById.set(p.id, p));
      }

      const nameOf = (id: string | null | undefined, fallback?: string | null) => {
        if (!id) return fallback ?? null;
        const p = profileById.get(id);
        return p?.full_name || p?.email || fallback || null;
      };

      // ── package sharing: build pkgId → { ownerId, memberIds[] }
      const pkgIds = Array.from(
        new Set(
          [
            ...(recurring || []).map((r: any) => r.package_id),
            ...(lessons || []).map((l: any) => l.package_id),
          ].filter(Boolean) as string[],
        ),
      );
      const pkgInfo = new Map<string, { ownerId: string | null; memberIds: string[] }>();
      if (pkgIds.length) {
        const [{ data: pkgs = [] }, { data: members = [] }] = await Promise.all([
          supabase.from('class_packages').select('id, user_id').in('id', pkgIds),
          supabase.from('package_members').select('package_id, student_id').in('package_id', pkgIds),
        ]);
        (pkgs || []).forEach((p: any) =>
          pkgInfo.set(p.id, { ownerId: p.user_id ?? null, memberIds: [] }),
        );
        (members || []).forEach((m: any) => {
          const e = pkgInfo.get(m.package_id) ?? { ownerId: null, memberIds: [] };
          e.memberIds.push(m.student_id);
          pkgInfo.set(m.package_id, e);
        });
        // Fetch any extra profiles we don't have yet for member names
        const extraIds = Array.from(
          new Set(
            Array.from(pkgInfo.values()).flatMap((e) => [
              ...(e.ownerId ? [e.ownerId] : []),
              ...e.memberIds,
            ]),
          ),
        ).filter((id) => !profileById.has(id));
        if (extraIds.length) {
          const { data: extraProfiles = [] } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', extraIds);
          (extraProfiles || []).forEach((p: any) => profileById.set(p.id, p));
        }
      }

      // ── package remaining per student (same source of truth as
      // "Administrar clases": computePackageCounts via fetchLinkablePackagesByStudent)
      const linkableByStudent = await fetchLinkablePackagesByStudent(studentIds, {
        includePackageIds: pkgIds,
      });
      const remainingOf = (
        sid: string | null | undefined,
        pkgId?: string | null,
      ): number | null => {
        if (!sid) return null;
        const list = linkableByStudent[sid];
        if (!list || list.length === 0) return null;
        if (pkgId) {
          const exact = list.find((p) => p.id === pkgId);
          if (exact) return exact.remaining;
        }
        return list[0]?.remaining ?? null;
      };

      const sharedWith = (
        packageId: string | null | undefined,
        currentStudentId: string | null | undefined,
      ): string[] | undefined => {
        if (!packageId) return undefined;
        const info = pkgInfo.get(packageId);
        if (!info) return undefined;
        const all = new Set<string>([...(info.ownerId ? [info.ownerId] : []), ...info.memberIds]);
        if (currentStudentId) all.delete(currentStudentId);
        if (all.size === 0) return undefined;
        const names = Array.from(all)
          .map((id) => nameOf(id))
          .filter(Boolean) as string[];
        return names.length ? names : undefined;
      };

      // ── index lessons by date|HH:MM for conflict-resolution
      const lessonAt = new Map<string, any[]>();
      (lessons || []).forEach((l: any) => {
        if (!l.lesson_date || !l.lesson_time) return;
        const t = String(l.lesson_time).slice(0, 5);
        const key = `${l.lesson_date}|${t}`;
        const arr = lessonAt.get(key) || [];
        arr.push(l);
        lessonAt.set(key, arr);
      });

      // ── pre-index concrete lessons per date with their effective interval
      // so we can (a) suppress projected tiles that a multi-hour lesson
      // already covers and (b) inject `blocked` overlap tiles for the
      // secondary hours of a 2h Playing Lesson.
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
        // Only return when this hhmm is a SECONDARY hour of the lesson —
        // i.e. strictly after the lesson's own start time. The lesson's own
        // tile is rendered separately at its start time.
        return arr.find((it) => s > it.startMin && s < it.endMin);
      };

      // Index lessons by (date | recurring_slot_id) regardless of time, so a
      // recurring slot whose occurrence was moved to a different time on a
      // given date doesn't also render its default-time projection
      // (phantom card). The moved lesson will still render via step 2.
      const lessonBySlotDate = new Map<string, any[]>();
      (lessons || []).forEach((l: any) => {
        if (!l.lesson_date || !l.recurring_slot_id) return;
        const key = `${l.lesson_date}|${l.recurring_slot_id}`;
        const arr = lessonBySlotDate.get(key) || [];
        arr.push(l);
        lessonBySlotDate.set(key, arr);
      });

      // ── helper: weekday of a date (0=Sun..6=Sat)
      const weekdayOf = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).getDay();
      };

      // 1) Project recurring slots onto each date in the week
      const offWeek: Array<{ iso: string; r: any }> = [];
      for (const iso of dateList) {
        const wd = weekdayOf(iso);
        for (const r of recurring || []) {
          if ((r as any).weekday !== wd) continue;
          // A slot with a future start date only projects from that date on.
          const startsOn = (r as any).starts_on
            ? String((r as any).starts_on).substring(0, 10)
            : null;
          if (startsOn && iso < startsOn) continue;
          // Paused slot: free (no projection) before paused_until.
          const pausedUntil = (r as any).paused_until
            ? String((r as any).paused_until).substring(0, 10)
            : null;
          if (pausedUntil && iso < pausedUntil) continue;
          // Temporary slot: no projection on or after ends_on.
          const endsOn = (r as any).ends_on
            ? String((r as any).ends_on).substring(0, 10)
            : null;
          if (endsOn && iso >= endsOn) continue;
          // Custom cadence: off weeks don't project the student.
          if (!isCadenceWeek(iso, (r as any).interval_anchor, (r as any).interval_weeks)) {
            offWeek.push({ iso, r });
            continue;
          }
          if (movedKeys.has(`${iso}|${(r as any).id}`)) continue;
          const t = String((r as any).start_time).slice(0, 5);
          // If any lesson row already exists for this slot+date (even at a
          // different time, e.g. a moved occurrence), suppress the
          // default-time projection. The lesson is rendered by step 2.
          const movedExists = (lessonBySlotDate.get(`${iso}|${r.id}`) || []).some(
            (l: any) => String(l.lesson_time).slice(0, 5) !== t,
          );
          if (movedExists) continue;
          const lessonsHere = lessonAt.get(`${iso}|${t}`);
          // Pick the lesson that belongs to this recurring slot (by recurring_slot_id or student_id)
          const lessonHere = lessonsHere?.find(
            (l: any) => l.recurring_slot_id === r.id || l.student_id === (r as any).student_id,
          ) ?? lessonsHere?.[0];

          if (lessonHere) {
            // a concrete lesson takes the slot; render based on its state.
            // Skipped lessons are hidden entirely — only an open spot may appear below.
            if (!lessonHere.skipped) {
              const kind: SlotItem['kind'] = lessonHere.recurring_slot_id ? 'fixed' : 'one_time';
              const pkgId = lessonHere.package_id ?? r.package_id ?? null;
              const sid = lessonHere.student_id ?? r.student_id;
              const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
              if (blockingSlot && blockingSlot.start_time !== t) {
                // A 2h lesson (e.g. Playing Lesson) starting earlier already
                // occupies this time — don't double-render.
              } else {
              map[iso].push({
                id: `lesson-${lessonHere.id}`,
                kind,
                date: iso,
                start_time: t,
                duration_minutes: lessonHere.duration_minutes ?? r.duration_minutes ?? 60,
                lesson_type: lessonHere.lesson_type ?? r.lesson_type,
                student_id: sid,
                student_name: nameOf(sid, lessonHere.invitee_name),
                recurring_slot_id: r.id,
                lesson_id: lessonHere.id,
                status: lessonHere.status,
                package_id: pkgId,
                shared_with: sharedWith(pkgId, sid),
                has_active_subscription: hasPaidSub(sid),
                subscription_tier: tierOf(sid),
                package_remaining: remainingOf(sid, pkgId),
                raw: { lesson: lessonHere, recurring: r },
              });
              }
            }
            // If the lesson is skipped and NOT kept closed, also inject an
            // "open" slot so the admin can book someone else in this time.
            // But only if no other (non-skipped) lesson is already booked at this time
            if (lessonHere.skipped && !lessonHere.skip_keep_closed) {
              const hasOtherLesson = lessonsHere?.some(
                (l: any) => l.id !== lessonHere.id && !l.skipped,
              );
              const skippedOpenDuration = getSlotDurationMinutes({
                duration_minutes: lessonHere.duration_minutes ?? r.duration_minutes ?? 60,
                lesson_type: lessonHere.lesson_type ?? r.lesson_type,
              });
              const isBlockedByExistingSlot = !!getSlotBlockedBy(t, map[iso] || []);
              const covering = findCoveringLesson(iso, t);
              if (!hasOtherLesson && !isBlockedByExistingSlot && !covering) {
                map[iso].push({
                  id: `open-skip-${lessonHere.id}`,
                  kind: 'open',
                  date: iso,
                  start_time: t,
                  duration_minutes: skippedOpenDuration,
                  lesson_type: r.lesson_type,
                  student_id: null,
                  student_name: null,
                  recurring_slot_id: null,
                  raw: { recurring: r },
                });
              }
            }
            // Remove this lesson from the array so it's not double-rendered below
            if (lessonsHere) {
              const remaining = lessonsHere.filter((l: any) => l.id !== lessonHere.id);
              if (remaining.length > 0) {
                lessonAt.set(`${iso}|${t}`, remaining);
              } else {
                lessonAt.delete(`${iso}|${t}`);
              }
            }
          } else {
            // projected recurring slot, no concrete lesson yet.
            // If the slot is tied to a package, only render while the package
            // still has projection budget — otherwise the time appears empty
            // so the coach can re-book or attach a new package.
            if (r.package_id && !allowedProjections.has(`${r.id}|${iso}`)) {
              // Package exhausted — keep the time visible as an open spot
              // so the coach or another student can claim it.
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
                  student_id: null,
                  student_name: null,
                  recurring_slot_id: null,
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
              student_name: nameOf(r.student_id),
              recurring_slot_id: r.id,
              package_id: r.package_id ?? null,
              shared_with: sharedWith(r.package_id, r.student_id),
              has_active_subscription: hasPaidSub(r.student_id),
                subscription_tier: tierOf(r.student_id),
              package_remaining: remainingOf(r.student_id, r.package_id),
              raw: { recurring: r },
            });
          }
        }
      }

      // 1b) Off-cadence weeks render as an open spot unless something else occupies the time.
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
          student_id: null,
          student_name: null,
          recurring_slot_id: null,
          raw: { recurring: r, offWeek: true },
        });
      }

      // 2) Add remaining concrete lessons (one-time bookings without a recurring projection)
      for (const [, arr] of lessonAt) {
        for (const l of arr) {
          if (l.skipped) continue; // hide skipped lessons entirely
          const iso = l.lesson_date as string;
          if (!map[iso]) continue;
          const t = String(l.lesson_time).slice(0, 5);
          const blockingSlot = getSlotBlockedBy(t, map[iso] || []);
          if (blockingSlot && blockingSlot.start_time !== t) continue;
          const kind: SlotItem['kind'] = l.recurring_slot_id ? 'fixed' : 'one_time';
          map[iso].push({
            id: `lesson-${l.id}`,
            kind,
            date: iso,
            start_time: t,
            duration_minutes: l.duration_minutes ?? 60,
            lesson_type: l.lesson_type,
            student_id: l.student_id,
            student_name: nameOf(l.student_id, l.invitee_name),
            recurring_slot_id: l.recurring_slot_id,
            lesson_id: l.id,
            status: l.status,
            package_id: l.package_id ?? null,
            shared_with: sharedWith(l.package_id, l.student_id),
            has_active_subscription: hasPaidSub(l.student_id),
                subscription_tier: tierOf(l.student_id),
            package_remaining: remainingOf(l.student_id, l.package_id),
            raw: { lesson: l },
          });
        }
      }

      // 3) Project unclaimed open priority spots onto each date (weekly)
      for (const iso of dateList) {
        const wd = weekdayOf(iso);
        for (const o of openSpots || []) {
          // One-time open spots only render on their exact date; weekly ones project by weekday.
          const specific = (o as any).specific_date as string | null | undefined;
          if (specific) {
            if (String(specific).slice(0, 10) !== iso) continue;
          } else if ((o as any).day_of_week !== wd) continue;
          const t = String((o as any).start_time).slice(0, 5);
          // Don't render an "open" tile if its start time falls inside any existing booking/block range.
          // Rule: booking start <= open slot time < booking start + booking duration.
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
                notes: blockingSlot.student_name
                  ? `Blocked by ${blockingSlot.student_name}`
                  : 'Blocked by existing lesson',
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
            notes: (o as any).notes ?? null,
            raw: { open: o },
          });
        }
      }

      // 4) Add blocks (full-day or partial)
      for (const b of blocks || []) {
        const iso = b.block_date as string;
        if (!map[iso]) continue;
        const t = b.start_time ? String(b.start_time).slice(0, 5) : '00:00';
        const dur =
          b.start_time && b.end_time
            ? Math.max(
                15,
                ((parseInt(String(b.end_time).slice(0, 2), 10) * 60 +
                  parseInt(String(b.end_time).slice(3, 5), 10)) -
                  (parseInt(String(b.start_time).slice(0, 2), 10) * 60 +
                    parseInt(String(b.start_time).slice(3, 5), 10))),
              )
            : 24 * 60;
        map[iso].push({
          id: `block-${b.id}`,
          kind: 'blocked',
          date: iso,
          start_time: t,
          duration_minutes: dur,
          lesson_type: 'Blocked',
          notes: b.reason ?? null,
          raw: { block: b },
        });
      }

      // sort each day by start_time
      for (const iso of dateList) {
        // ── inject `blocked` overlap tiles for every SECONDARY hour of a
        // multi-hour lesson (e.g. Playing Lesson 9-11 → blocked tile at 10)
        // that isn't already represented by another non-open tile. Uses the
        // same tile kind ('blocked') as coach_availability_blocks so it
        // renders with the existing blocked styling.
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
            // Remove any open tile at this exact time — the lesson occupies it.
            map[iso] = (map[iso] || []).filter(
              (s) => !(s.start_time === t && s.kind === 'open'),
            );
            const parentName = nameOf(it.lesson.student_id, it.lesson.invitee_name);
            map[iso].push({
              id: `blocked-lesson-${it.lesson.id}-${t}`,
              kind: 'blocked',
              date: iso,
              start_time: t,
              duration_minutes: 60,
              lesson_type: it.lesson.lesson_type
                ? `${it.lesson.lesson_type} overlap`
                : 'Unavailable',
              notes: parentName ? `Blocked by ${parentName}` : 'Blocked by existing lesson',
              raw: { blockedByLesson: it.lesson },
            });
          }
        }

        // If a full-day block exists, suppress only PROJECTED recurring & open
        // spots (no concrete lesson row). Real booked lessons must still appear
        // so the calendar stays coherent with Today's Schedule.
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