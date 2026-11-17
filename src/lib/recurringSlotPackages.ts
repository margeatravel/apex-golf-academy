import { supabase } from '@/integrations/supabase/client';
import { computePackageCounts } from '@/lib/lessonPackageUsage';

/**
 * SINGLE SOURCE OF TRUTH for "which packages can a recurring slot be linked to".
 *
 * Every Recurring Schedules surface (create slot, edit slot, bulk link, auto-link)
 * must use this helper so they all report the SAME number for the same package.
 *
 * Rules:
 *  - only `is_active = true` packages (and ar_status not draft/cancelled)
 *  - the displayed / decision value is `remaining` (total − completed lessons),
 *    computed by computePackageCounts (formula untouched). Scheduled-but-not-
 *    completed lessons are NOT subtracted again: they already live inside
 *    `remaining`. Subtracting them (as `budget` does) double-counted them and
 *    made every student with a projected recurring calendar show "0 left".
 *    `budget` still exists unchanged for buildProjectionBudget.
 *  - counts are computed ONCE PER PACKAGE, never per member: a shared package
 *    consumes one unit per auto-generated lesson even though the lesson shows
 *    up on every member's profile.
 */
export interface LinkablePackage {
  id: string;
  user_id: string;
  package_name: string | null;
  package_size: number;
  is_active: boolean;
  is_paused?: boolean;
  is_archived?: boolean;
  created_at?: string | null;
  ar_status?: string | null;
  /** Shared with someone other than the queried student. */
  __shared?: boolean;
  /** computePackageCounts output (per package, not per member). */
  total: number;
  used: number;
  scheduled: number;
  /** Linking capacity — the value every screen must show and gate on. */
  remaining: number;
  /** Projection-only capacity (total − used − scheduled). Not used for linking. */
  budget: number;
  overbooked: number;
}

const PKG_COLS =
  'id, user_id, package_name, package_size, classes_used, classes_remaining, is_active, is_paused, is_archived, created_at, ar_status';

/**
 * Returns, per student id, the packages that can still take a new recurring
 * lesson (is_active === true AND remaining > 0), sorted FIFO (oldest first).
 */
export async function fetchLinkablePackagesByStudent(
  studentIds: string[],
  opts: { includePackageIds?: string[] } = {},
): Promise<Record<string, LinkablePackage[]>> {
  const ids = Array.from(new Set((studentIds || []).filter(Boolean)));
  if (ids.length === 0) return {};

  const [ownedRes, sharedRes] = await Promise.all([
    supabase.from('class_packages').select(PKG_COLS).in('user_id', ids),
    supabase
      .from('package_members')
      .select(`student_id, package_id, class_packages!inner(${PKG_COLS})`)
      .in('student_id', ids),
  ]);

  if (ownedRes.error) throw ownedRes.error;
  if (sharedRes.error) throw sharedRes.error;

  // studentId -> packageId -> row
  const byStudent = new Map<string, Map<string, any>>();
  const ensure = (sid: string) => {
    if (!byStudent.has(sid)) byStudent.set(sid, new Map());
    return byStudent.get(sid)!;
  };
  for (const p of (ownedRes.data ?? []) as any[]) ensure(p.user_id).set(p.id, p);
  for (const row of (sharedRes.data ?? []) as any[]) {
    const pkg = row.class_packages;
    if (row.student_id && pkg) ensure(row.student_id).set(pkg.id, pkg);
  }

  // Keep an explicitly requested package selectable even if it no longer qualifies.
  const keepIds = new Set(opts.includePackageIds?.filter(Boolean) ?? []);

  const allPkgIds = Array.from(
    new Set(Array.from(byStudent.values()).flatMap((m) => Array.from(m.keys()))),
  );
  let lessons: any[] = [];
  if (allPkgIds.length > 0) {
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id, package_id, status, lesson_date, lesson_type')
      .in('package_id', allPkgIds);
    lessons = (lessonRows ?? []) as any[];
  }

  // Counts computed ONCE per package id, shared across every member.
  const countsById = new Map<string, ReturnType<typeof computePackageCounts>>();

  const out: Record<string, LinkablePackage[]> = {};
  byStudent.forEach((pkgMap, sid) => {
    const list: LinkablePackage[] = [];
    pkgMap.forEach((p, pid) => {
      if (!countsById.has(pid)) countsById.set(pid, computePackageCounts(p, lessons));
      const c = countsById.get(pid)!;
      // Eligibility is driven ONLY by computed remaining (total − completed).
      // A draft / partially-paid package (ar_status) is still linkable, and the
      // stored `is_active` flag is never trusted — it goes stale.
      const arOk = !p.ar_status || p.ar_status !== 'cancelled';
      // A paused or archived package never receives new lessons.
      const eligible =
        p.is_paused !== true && p.is_archived !== true && arOk && c.remaining > 0;
      if (!eligible && !keepIds.has(pid)) return;
      list.push({
        id: p.id,
        user_id: p.user_id,
        package_name: p.package_name ?? null,
        package_size: p.package_size ?? 0,
        is_active: !!p.is_active,
        is_paused: p.is_paused === true,
        is_archived: p.is_archived === true,
        created_at: p.created_at ?? null,
        ar_status: p.ar_status ?? null,
        __shared: p.user_id !== sid,
        total: c.total,
        used: c.used,
        scheduled: c.scheduled,
        remaining: c.remaining,
        budget: c.budget,
        overbooked: c.overbooked,
      });
    });
    list.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    out[sid] = list;
  });

  return out;
}

/** Convenience wrapper for the single-student modals. */
export async function fetchLinkablePackages(
  studentId: string,
  opts: { includePackageId?: string | null } = {},
): Promise<LinkablePackage[]> {
  if (!studentId) return [];
  const grouped = await fetchLinkablePackagesByStudent([studentId], {
    includePackageIds: opts.includePackageId ? [opts.includePackageId] : [],
  });
  return grouped[studentId] ?? [];
}

/** FIFO auto-link pick: oldest active package with remaining > 0. */
export function pickFifoLinkable(list: LinkablePackage[]): LinkablePackage | null {
  return list.find((p) => isLinkable(p)) ?? null;
}

/** True when a slot may be linked to this package. */
export function isLinkable(p: LinkablePackage): boolean {
  // `remaining` (computePackageCounts) is the only gate; `is_active` and a
  // draft/partial ar_status must not hide a package that still has lessons.
  return (
    p.is_paused !== true &&
    p.is_archived !== true &&
    p.ar_status !== 'cancelled' &&
    p.remaining > 0
  );
}

/**
 * Label shown in every package dropdown — same field everywhere (`remaining`),
 * so it matches the Packages tab of the student profile exactly.
 */
export function linkablePackageLabel(p: LinkablePackage): string {
  return `${p.package_name || `${p.package_size}-Lesson`} · ${p.remaining} left${p.__shared ? ' · shared' : ''}`;
}
