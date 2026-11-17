import { getLessonSortKey } from '@/lib/formatLessonDateTime';
import { isEffectivelyTaken, effectiveLessonStatus } from '@/lib/lessonStatus';

export const DOUBLE_SLOT_LESSON_TYPES = ['Campo', 'Playing Lesson', 'Field Lesson'];

export function isDoubleSlotLesson(lessonOrType: { lesson_type?: string | null } | string | null | undefined) {
  const lessonType = typeof lessonOrType === 'string' ? lessonOrType : lessonOrType?.lesson_type;
  return DOUBLE_SLOT_LESSON_TYPES.includes(lessonType || '');
}

export function getLessonSlotWeight(lessonOrType: { lesson_type?: string | null } | string | null | undefined) {
  return isDoubleSlotLesson(lessonOrType) ? 2 : 1;
}

export function getWeightedLessonCount(lessons: any[], completedOnly = false) {
  return lessons.reduce((sum, lesson) => {
    if (completedOnly && !isEffectivelyTaken(lesson)) return sum;
    return sum + getLessonSlotWeight(lesson);
  }, 0);
}

/**
 * Single source of truth for "package progress" across every UI surface
 * (Admin Packages table, Student profile Packages tab, Package detail modal).
 *
 * Definition of "used":
 *   - lessons linked to this package via package_id
 *   - AND whose effective status is `completed` or `no_show` and is not
 *     future-dated. Scheduled / future lessons NEVER count as used.
 *   - Playing Lesson / Campo / Field Lesson count as 2 slots (existing weight).
 *
 * Falls back to (stored_used + stored_remaining) for `size` only when the
 * package row has package_size = 0 (legacy imports).
 */
export function computePackageProgress(
  pkg: {
    id: string;
    package_size?: number | null;
    classes_used?: number | null;
    classes_remaining?: number | null;
  },
  lessons: any[],
) {
  const linked = (lessons || []).filter((l) => l && l.package_id === pkg.id);
  const used = getWeightedLessonCount(linked, true);
  const rawSize = pkg.package_size || 0;
  const size =
    rawSize > 0
      ? rawSize
      : (pkg.classes_used || 0) + (pkg.classes_remaining || 0);
  const remaining = Math.max(0, size - used);
  const pct = size > 0 ? Math.min(100, Math.round((used / size) * 100)) : 0;
  return { used, remaining, size, pct };
}

export function buildWeightedLessonNumberMap(
  lessons: any[],
  options: { groupByPackage?: boolean; completedOnly?: boolean } = {},
) {
  const { groupByPackage = false, completedOnly = false } = options;
  const map = new Map<string, number>();
  const eligible = lessons.filter((lesson) => {
    if (!lesson?.id) return false;
    if (completedOnly && !isEffectivelyTaken(lesson)) return false;
    if (groupByPackage && !lesson.package_id) return false;
    return true;
  });

  const groups = new Map<string, any[]>();
  for (const lesson of eligible) {
    const key = groupByPackage ? lesson.package_id : '__all__';
    const group = groups.get(key) || [];
    group.push(lesson);
    groups.set(key, group);
  }

  groups.forEach((group) => {
    group.sort((a, b) => getLessonSortKey(a).localeCompare(getLessonSortKey(b)));
    let runningSlot = 1;
    for (const lesson of group) {
      map.set(lesson.id, runningSlot);
      runningSlot += getLessonSlotWeight(lesson);
    }
  });

  return map;
}
/**
 * SINGLE SOURCE OF TRUTH for package lesson counts.
 *
 * total     = package size (falls back to stored used+remaining only when
 *             package_size is 0 — legacy imports).
 * used      = lessons linked to this package whose effective status is
 *             `completed` or `no_show` (Playing Lesson / Campo counts as 2 slots).
 * scheduled = lessons linked to this package still scheduled in the future.
 * remaining = max(0, total − used)              → shown to the user.
 * budget    = max(0, total − used − scheduled)  → linking capacity only.
 * overbooked= max(0, used + scheduled − total).
 *
 * All lessons linked via package_id are counted regardless of which member
 * took them (shared packages), deduplicated by lesson id.
 * The stored `classes_used` / `classes_remaining` columns are NEVER read here.
 */
export function computePackageCounts(
  pkg: {
    id: string;
    package_size?: number | null;
    classes_used?: number | null;
    classes_remaining?: number | null;
  },
  lessons: any[],
) {
  const byId = new Map<string, any>();
  (lessons || []).forEach((l) => {
    if (!l?.id || l.package_id !== pkg.id) return;
    if (!byId.has(l.id)) byId.set(l.id, l);
  });
  const linked = Array.from(byId.values());

  const todayStr = new Date().toISOString().slice(0, 10);
  let used = 0;
  let scheduled = 0;
  for (const l of linked) {
    const status = effectiveLessonStatus(l);
    const weight = getLessonSlotWeight(l);
    if (status === 'completed' || status === 'no_show') used += weight;
    else if (status === 'scheduled' && String(l.lesson_date || '') >= todayStr) scheduled += weight;
  }

  const rawSize = pkg.package_size || 0;
  const total = rawSize > 0 ? rawSize : (pkg.classes_used || 0) + (pkg.classes_remaining || 0);
  /** Shown to the user; drives the Completed badge and is_active. */
  const remaining = Math.max(0, total - used);
  /** Internal only: can a NEW lesson still be linked to this package? */
  const budget = Math.max(0, total - used - scheduled);
  const overbooked = Math.max(0, used + scheduled - total);
  const pct = total > 0 ? Math.min(100, Math.round(((used + scheduled) / total) * 100)) : 0;

  return { total, used, scheduled, remaining, budget, overbooked, pct, linkedCount: linked.length };
}
