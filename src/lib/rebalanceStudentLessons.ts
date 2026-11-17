import { supabase } from '@/integrations/supabase/client';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import { syncPersistedPackageCounters } from '@/lib/syncPackageCounters';

/**
 * SINGLE SOURCE OF TRUTH for "how many future lessons may a student have".
 *
 * Rules (see product spec):
 *  - Only ACTIVE, NON-PAUSED, NON-ARCHIVED packages count.
 *  - A package can never hold more scheduled lessons than its remaining
 *    classes (total − used), computed PER PACKAGE with computePackageCounts.
 *    Capacity is never summed across packages when filling one.
 *  - A student can only keep as many FUTURE scheduled lessons as the SUM of
 *    the remaining classes of the packages that count. The excess is deleted,
 *    starting with the farthest dates.
 *
 * Never touched: completed / no_show / cancelled lessons, lessons belonging to
 * a recurring slot flagged `no_package_intentional` (the "will pay later" /
 * "permanently no package" overrides), the recurring slots themselves,
 * revenue, SC points and stats.
 */

export type RebalancePackageRow = {
  id: string;
  name: string;
  capacity: number;
  before: number;
  after: number;
  counts: boolean;
};

export type RebalanceLessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string | null;
  package_id: string | null;
};

export type RebalancePlan = {
  studentId: string;
  packages: RebalancePackageRow[];
  moves: { lessonId: string; from: string | null; to: string }[];
  deletions: RebalanceLessonRow[];
  touchedPackageIds: string[];
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Builds the plan without writing anything (used by the confirmation dialog). */
export async function planStudentRebalance(studentId: string): Promise<RebalancePlan> {
  const cols =
    'id, package_name, package_size, classes_used, classes_remaining, is_active, is_paused, is_archived, created_at';

  const [{ data: pkgRows }, { data: lessonRows }, { data: noPkgSlots }] = await Promise.all([
    supabase
      .from('class_packages')
      .select(cols)
      .eq('user_id', studentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, lesson_date, lesson_time, package_id, status, lesson_type, recurring_slot_id')
      .eq('student_id', studentId),
    supabase
      .from('recurring_lesson_slots')
      .select('id')
      .eq('student_id', studentId)
      .eq('no_package_intentional', true),
  ]);

  const allPackages = (pkgRows ?? []) as any[];
  const allLessons = (lessonRows ?? []) as any[];
  const protectedSlotIds = new Set(((noPkgSlots ?? []) as any[]).map((s) => s.id));
  const today = todayStr();

  // Future scheduled lessons that consume package classes, chronological.
  const queue = allLessons
    .filter(
      (l) =>
        l.status === 'scheduled' &&
        String(l.lesson_date || '') >= today &&
        !!l.package_id &&
        !(l.recurring_slot_id && protectedSlotIds.has(l.recurring_slot_id)),
    )
    .sort((a, b) =>
      `${a.lesson_date}${a.lesson_time || ''}`.localeCompare(`${b.lesson_date}${b.lesson_time || ''}`),
    ) as RebalanceLessonRow[];

  // Per-package capacity = total − used (used = completed / no_show only).
  const eligible = allPackages
    .filter((p) => p.is_active === true && p.is_paused !== true && p.is_archived !== true)
    .map((p) => ({ pkg: p, capacity: computePackageCounts(p, allLessons).remaining }))
    .filter((p) => p.capacity > 0);

  const before = new Map<string, number>();
  for (const l of queue) before.set(l.package_id!, (before.get(l.package_id!) ?? 0) + 1);

  const after = new Map<string, number>();
  const moves: RebalancePlan['moves'] = [];
  const deletions: RebalanceLessonRow[] = [];

  let idx = 0;
  for (const lesson of queue) {
    while (idx < eligible.length && eligible[idx].capacity <= 0) idx++;
    if (idx >= eligible.length) {
      deletions.push(lesson);
      continue;
    }
    const target = eligible[idx];
    target.capacity -= 1;
    after.set(target.pkg.id, (after.get(target.pkg.id) ?? 0) + 1);
    if (lesson.package_id !== target.pkg.id) {
      moves.push({ lessonId: lesson.id, from: lesson.package_id, to: target.pkg.id });
    }
  }

  const shown = new Map<string, any>();
  allPackages.forEach((p) => {
    if (before.has(p.id) || after.has(p.id) || (p.is_active && p.is_paused !== true && p.is_archived !== true)) {
      shown.set(p.id, p);
    }
  });

  const packages: RebalancePackageRow[] = Array.from(shown.values()).map((p) => ({
    id: p.id,
    name: p.package_name || `${p.package_size}-Lesson Package`,
    capacity: computePackageCounts(p, allLessons).remaining,
    before: before.get(p.id) ?? 0,
    after: after.get(p.id) ?? 0,
    counts: p.is_active === true && p.is_paused !== true && p.is_archived !== true,
  }));

  const touched = new Set<string>();
  moves.forEach((m) => {
    if (m.from) touched.add(m.from);
    touched.add(m.to);
  });
  deletions.forEach((d) => d.package_id && touched.add(d.package_id));

  return { studentId, packages, moves, deletions, touchedPackageIds: Array.from(touched) };
}

/** Applies a plan produced by planStudentRebalance. */
export async function applyRebalancePlan(plan: RebalancePlan) {
  for (const move of plan.moves) {
    const { error } = await supabase
      .from('lessons')
      .update({ package_id: move.to })
      .eq('id', move.lessonId);
    if (error) throw error;
  }

  if (plan.deletions.length > 0) {
    const { error } = await supabase
      .from('lessons')
      .delete()
      .in('id', plan.deletions.map((d) => d.id));
    if (error) throw error;
  }

  await Promise.all(plan.touchedPackageIds.map((id) => syncPersistedPackageCounters(id)));

  return { moved: plan.moves.length, deleted: plan.deletions.length };
}

/** Plan + apply in one shot. */
export async function rebalanceStudentLessons(studentId: string) {
  if (!studentId) return { moved: 0, deleted: 0 };
  const plan = await planStudentRebalance(studentId);
  return applyRebalancePlan(plan);
}

/** Rebalance, then recreate the lessons that now fit again. */
export async function rebalanceAndRegenerate(studentId: string) {
  const result = await rebalanceStudentLessons(studentId);
  try {
    await supabase.functions.invoke('generate-recurring-lessons', {
      body: { student_id: studentId },
    });
  } catch {
    /* generation is best-effort; the rebalance already succeeded */
  }
  return result;
}
