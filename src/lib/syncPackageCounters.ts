import { supabase } from '@/integrations/supabase/client';
import { computePackageCounts } from '@/lib/lessonPackageUsage';

/**
 * Additive reconciliation of the PERSISTED class_packages counters
 * (classes_used / classes_remaining / is_active) against the runtime formula
 * used everywhere in the UI (computePackageCounts: used = completed/no_show
 * lessons linked via package_id, remaining = total − used).
 *
 * The formula and the deduction behaviour are unchanged — this only makes sure
 * the stored columns end up equal to the computed ones after a lesson is
 * created with a package_id, so the "edit + save the package" workaround is no
 * longer needed for other screens that still read the stored columns.
 */
export async function syncPersistedPackageCounters(packageId: string) {
  if (!packageId) return;
  try {
    const [{ data: pkg }, { data: lessons }] = await Promise.all([
      supabase
        .from('class_packages')
        .select('id, package_size, classes_used, classes_remaining')
        .eq('id', packageId)
        .maybeSingle(),
      supabase
        .from('lessons')
        .select('id, package_id, status, lesson_date, lesson_type')
        .eq('package_id', packageId),
    ]);
    if (!pkg) return;

    const counts = computePackageCounts(pkg as any, (lessons || []) as any[]);
    if (
      (pkg as any).classes_used === counts.used &&
      (pkg as any).classes_remaining === counts.remaining
    ) {
      return;
    }

    await supabase
      .from('class_packages')
      .update({
        classes_used: counts.used,
        classes_remaining: counts.remaining,
        is_active: counts.remaining > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', packageId);
  } catch (err) {
    // Non-blocking: the UI already reads the runtime count.
    console.warn('[syncPersistedPackageCounters] failed', err);
  }
}
