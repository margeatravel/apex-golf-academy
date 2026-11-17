export function hasRemainingLessons(pkg: { classes_remaining?: number | null }) {
  return (pkg.classes_remaining ?? 0) > 0;
}

export function packageDisplayState(pkg: { package_size?: number | null; classes_remaining?: number | null }) {
  // Strict rule: if there are remaining lessons, the package is active —
  // never display as "completed" regardless of any other field.
  if (hasRemainingLessons(pkg)) return 'active';
  if ((pkg.package_size ?? 0) <= 0) return 'pending-size';
  return 'completed';
}

/**
 * Returns the package that should be drawn from for the NEXT lesson, following
 * the same FIFO rule the `book-lesson` edge function and the
 * `process_lesson_completion` DB function use: oldest active package
 * (by `created_at`) with at least one remaining lesson.
 *
 * Accepts a "remaining" override key so callers that have cross-member usage
 * totals (e.g. AdminStudentDetail's `_totalLessonsRemaining`) get the right
 * answer — otherwise we fall back to `classes_remaining`.
 */
export function getCurrentPackage<T extends {
  id: string;
  is_active?: boolean | null;
  is_paused?: boolean | null;
  is_archived?: boolean | null;
  classes_remaining?: number | null;
  created_at?: string | null;
  _totalLessonsRemaining?: number | null;
}>(packages: T[] | null | undefined): T | null {
  if (!packages || packages.length === 0) return null;
  const eligible = packages.filter((p) => {
    if (p.is_active !== true) return false;
    // Paused or archived packages never receive new lessons, so they are
    // never "En uso".
    if ((p as any).is_paused === true) return false;
    if ((p as any).is_archived === true) return false;
    // Draft packages (pending review) never receive lessons, so they are
    // never "En uso" either.
    if ((p as any).ar_status === 'draft') return false;
    const remaining = p._totalLessonsRemaining ?? p.classes_remaining ?? 0;
    return remaining > 0;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const ad = new Date(a.created_at || 0).getTime();
    const bd = new Date(b.created_at || 0).getTime();
    if (ad !== bd) return ad - bd; // oldest first (FIFO)
    // Deterministic tie-breaker so a newer package can never leapfrog an
    // older one with the same timestamp.
    return (a.id || '').localeCompare(b.id || '');
  });
  return eligible[0];
}

export function getCurrentPackageId(packages: Parameters<typeof getCurrentPackage>[0]): string | null {
  const p = getCurrentPackage(packages as any);
  return p?.id ?? null;
}
