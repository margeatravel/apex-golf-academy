import { supabase } from '@/integrations/supabase/client';
import { rebalanceStudentLessons, rebalanceAndRegenerate } from '@/lib/rebalanceStudentLessons';

/**
 * Archive / unarchive a package.
 *
 * An ARCHIVED package behaves like a paused one for the rotation (it never
 * receives new lessons) and is additionally hidden from the student portal,
 * together with its lessons. Nothing about its history changes: completed /
 * no_show / cancelled lessons, revenue, SC points and stats keep counting.
 *
 * A package can only be archived when it has no FUTURE `scheduled` lessons.
 */
export class PackageHasScheduledLessonsError extends Error {
  constructor() {
    super('Este paquete tiene clases agendadas. Muévelas o cancélalas antes de archivar.');
    this.name = 'PackageHasScheduledLessonsError';
  }
}

export async function packageFutureScheduledCount(packageId: string): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)
    .eq('status', 'scheduled')
    .gte('lesson_date', todayStr);
  if (error) throw error;
  return count ?? 0;
}

export async function archivePackage(pkg: { id: string; user_id?: string | null }) {
  const pending = await packageFutureScheduledCount(pkg.id);
  if (pending > 0) throw new PackageHasScheduledLessonsError();

  const { error } = await supabase
    .from('class_packages')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', pkg.id);
  if (error) throw error;

  if (pkg.user_id) await rebalanceStudentLessons(pkg.user_id);
}

export async function unarchivePackage(pkg: { id: string; user_id?: string | null }) {
  const { error } = await supabase
    .from('class_packages')
    .update({
      is_archived: false,
      archived_at: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', pkg.id);
  if (error) throw error;

  // Unarchiving frees capacity again → rebalance and recreate what now fits.
  if (pkg.user_id) await rebalanceAndRegenerate(pkg.user_id);
}

/** True when the package must be hidden from the student portal. */
export function isHiddenFromStudent(p: { is_paused?: boolean | null; is_archived?: boolean | null } | null | undefined) {
  return !!p && (p.is_paused === true || (p as any).is_archived === true);
}

/**
 * Ids of the packages that must be hidden from the student portal
 * (paused or archived). Used to also hide their lessons.
 */
export async function fetchHiddenPackageIds(): Promise<string[]> {
  const { data } = await supabase
    .from('class_packages')
    .select('id, is_paused, is_archived')
    .or('is_paused.eq.true,is_archived.eq.true');
  return ((data ?? []) as any[]).map((p) => p.id);
}
