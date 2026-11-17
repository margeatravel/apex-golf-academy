import { supabase } from '@/integrations/supabase/client';
import { computePackageCounts } from '@/lib/lessonPackageUsage';

export type PackageWithRemaining = {
  id: string;
  package_name?: string | null;
  package_size: number;
  classes_remaining: number;
  classes_used?: number | null;
  is_active: boolean;
  is_paused?: boolean | null;
  is_archived?: boolean | null;
  user_id?: string | null;
  created_at?: string | null;
  __shared?: boolean;
  /** Effective package size (falls back to used+remaining for legacy imports). */
  size: number;
  /** Displayed value: size − completed lessons. */
  remaining: number;
  /** Linking capacity: size − completed − future scheduled. Drives the selector. */
  budget: number;
  /** Scheduled capacity beyond the package total. */
  overbooked: number;
};

/**
 * Single source of truth for the package dropdowns in the live calendar modals.
 *
 * Counts are enriched through computePackageCounts so every consumer receives
 * the canonical remaining, budget, and overbooked values.
 *
 * Only `is_active = true` packages are returned, plus (optionally) the package
 * the lesson is currently linked to so it stays selectable.
 */
export async function fetchActivePackagesWithRemaining(
  studentId: string,
  opts: { includePackageId?: string | null } = {},
): Promise<PackageWithRemaining[]> {
  const cols = 'id, package_name, package_size, classes_remaining, classes_used, is_active, is_paused, is_archived, user_id, created_at';

  const [ownedRes, sharedRes] = await Promise.all([
    supabase
      .from('class_packages')
      .select(cols)
      .eq('user_id', studentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('package_members')
      .select(`package_id, class_packages!inner(${cols})`)
      .eq('student_id', studentId),
  ]);

  const byId = new Map<string, any>();
  ((ownedRes.data ?? []) as any[]).forEach((p) => byId.set(p.id, p));
  ((sharedRes.data ?? []) as any[])
    .map((row: any) => row.class_packages)
    .filter(Boolean)
    .forEach((p: any) => {
      if (!byId.has(p.id)) byId.set(p.id, { ...p, __shared: p.user_id !== studentId });
    });

  if (opts.includePackageId && !byId.has(opts.includePackageId)) {
    const { data: cur } = await supabase
      .from('class_packages')
      .select(cols)
      .eq('id', opts.includePackageId)
      .maybeSingle();
    if (cur) byId.set((cur as any).id, { ...(cur as any), __shared: (cur as any).user_id !== studentId });
  }

  // Paused OR archived packages never receive new lessons — they are hidden
  // from every selector unless explicitly requested (the lesson's current
  // package).
  const list = Array.from(byId.values()).filter(
    (p: any) =>
      (p.is_paused !== true && p.is_archived !== true) || p.id === opts.includePackageId,
  );
  if (list.length === 0) return [];

  // One query for all lessons linked to these packages (any member).
  const { data: lessonRows } = await supabase
    .from('lessons')
    .select('id, package_id, status, lesson_date, lesson_type')
    .in('package_id', list.map((p) => p.id));

  const lessons = (lessonRows ?? []) as any[];

  return list
    .map((p) => {
      const counts = computePackageCounts(p, lessons);
      return {
        ...p,
        size: counts.total,
        remaining: counts.remaining,
        budget: counts.budget,
        overbooked: counts.overbooked,
      } as PackageWithRemaining;
    })
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

}

/** FIFO default: oldest active package that can still take a new lesson. */
export function pickDefaultPackageId(packages: PackageWithRemaining[]): string | null {
  // Oldest ACTIVE, NON-PAUSED package that still has classes available.
  // `remaining` (total − completed) is the per-package availability; never sum
  // across packages.
  return (
    packages.find(
      (p) => p.is_paused !== true && p.is_archived !== true && (p.remaining ?? 0) > 0,
    )?.id ?? null
  );
}

/** Server-fresh check used before saving a lesson linked to a package. */
export async function packageHasBudget(studentId: string, packageId: string): Promise<boolean> {
  const list = await fetchActivePackagesWithRemaining(studentId, { includePackageId: packageId });
  const p = list.find((x) => x.id === packageId);
  return !!p && p.is_paused !== true && p.is_archived !== true && (p.remaining ?? 0) > 0;
}
