import { supabase } from '@/integrations/supabase/client';
import { toISODate } from './calendarTypes';
import { isCadenceWeek } from '@/lib/recurringCadence';

/**
 * Build a set of (recurring_slot_id|YYYY-MM-DD) keys that are still allowed
 * to render as a projected "fixed" tile on the live calendar, based on the
 * linked package's remaining capacity.
 *
 * Rules:
 *  - Slots without a package_id are NOT in the budget set (callers should
 *    treat those as "always allowed" — existing behavior).
 *  - For each package_id used by the active recurring slots, the projection
 *    budget = classes_remaining - (already-scheduled, non-skipped future
 *    lessons using that package). Inactive packages → 0.
 *  - Projected occurrences are enumerated globally in chronological order
 *    across every slot pointing at the package, and budget is consumed in
 *    that order. Past budget runs out → no more tiles render for that
 *    package, anywhere on the calendar.
 *  - Dates where a scheduled lesson already exists at the slot's
 *    (student_id, date, time) don't consume budget — that lesson is already
 *    counted in the subtraction above and will render via its lesson row.
 */
export async function buildProjectionBudget(
  recurring: Array<{
    id: string;
    student_id: string | null;
    weekday: number;
    start_time: string;
    package_id: string | null;
    interval_weeks?: number | null;
    interval_anchor?: string | null;
  }>,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  const pkgIds = Array.from(
    new Set((recurring || []).map((r) => r.package_id).filter(Boolean) as string[]),
  );
  if (pkgIds.length === 0) return allowed;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toISODate(today);

  const [{ data: pkgs = [] }, { data: futureSched = [] }] = await Promise.all([
    supabase
      .from('class_packages')
      .select('id, classes_remaining, is_active, ar_status')
      .in('id', pkgIds),
    supabase
      .from('lessons')
      .select('student_id, lesson_date, lesson_time, package_id, status')
      .in('package_id', pkgIds)
      // Scheduled usage reserves projection budget; other statuses (completed,
      // no_show, cancelled) only block re-projection of that same occurrence.
      // Cancelled rows reserve nothing.
      .eq('skipped', false)
      .gte('lesson_date', todayIso),
  ]);

  const scheduledByPkg = new Map<string, number>();
  (futureSched || []).forEach((l: any) => {
    if (!l.package_id) return;
    if (l.status !== 'scheduled') return;
    scheduledByPkg.set(l.package_id, (scheduledByPkg.get(l.package_id) || 0) + 1);
  });

  const budget = new Map<string, number>();
  (pkgs || []).forEach((p: any) => {
    const remaining = p.is_active && p.ar_status !== 'draft'
      ? Math.max((p.classes_remaining ?? 0) - (scheduledByPkg.get(p.id) || 0), 0)
      : 0;
    budget.set(p.id, remaining);
  });

  // Lessons already existing at exact (student, date, time) — any status
  // (scheduled, completed, no_show, cancelled) — skip without consuming
  // budget so projections don't double-count a real occurrence.
  const lessonKey = new Set<string>();
  (futureSched || []).forEach((l: any) => {
    if (!l.student_id || !l.lesson_date || !l.lesson_time) return;
    lessonKey.add(`${l.student_id}|${l.lesson_date}|${String(l.lesson_time).slice(0, 5)}`);
  });

  type Cand = { slotId: string; pkgId: string; studentId: string | null; iso: string; time: string };
  const cands: Cand[] = [];
  const HARD_MAX_WEEKS = 200;

  for (const r of recurring || []) {
    if (!r.package_id) continue;
    const time = String(r.start_time).slice(0, 5);
    const first = new Date(today);
    const diff = ((r.weekday as number) - first.getDay() + 7) % 7;
    first.setDate(first.getDate() + diff);
    for (let w = 0; w < HARD_MAX_WEEKS; w++) {
      const d = new Date(first);
      d.setDate(first.getDate() + w * 7);
      if (!isCadenceWeek(toISODate(d), r.interval_anchor, r.interval_weeks)) continue;
      cands.push({
        slotId: r.id,
        pkgId: r.package_id,
        studentId: r.student_id,
        iso: toISODate(d),
        time,
      });
    }
  }
  cands.sort((a, b) => (a.iso + a.time).localeCompare(b.iso + b.time));

  for (const c of cands) {
    const lkey = c.studentId ? `${c.studentId}|${c.iso}|${c.time}` : '';
    if (lkey && lessonKey.has(lkey)) {
      // Already a real scheduled lesson here — render via lesson row; don't decrement.
      continue;
    }
    const remaining = budget.get(c.pkgId) ?? 0;
    if (remaining <= 0) continue;
    allowed.add(`${c.slotId}|${c.iso}`);
    budget.set(c.pkgId, remaining - 1);
  }

  return allowed;
}