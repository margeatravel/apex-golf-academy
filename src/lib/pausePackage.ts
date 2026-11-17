import { supabase } from '@/integrations/supabase/client';
import { rebalanceStudentLessons, rebalanceAndRegenerate } from '@/lib/rebalanceStudentLessons';


/**
 * Pause / resume a package.
 *
 * A PAUSED package never receives new lessons and its remaining classes stop
 * counting, so it ends up with 0 scheduled lessons. History is untouched:
 * completed / no_show / cancelled lessons, revenue and stats never change, and
 * `no_package_intentional` slots are never auto-linked.
 *
 * The re-linking is delegated to the central rebalancer
 * (lib/rebalanceStudentLessons.ts), the single source of truth for how many
 * future lessons a student may hold.
 */
export async function pausePackage(pkg: { id: string; user_id?: string | null }) {
  const { error: pauseErr } = await supabase
    .from('class_packages')
    .update({ is_paused: true, updated_at: new Date().toISOString() })
    .eq('id', pkg.id);
  if (pauseErr) throw pauseErr;

  const studentId = pkg.user_id || '';
  if (!studentId) return { moved: 0, deleted: 0 };
  return rebalanceStudentLessons(studentId);
}

export async function resumePackage(pkg: { id: string; user_id?: string | null }) {
  const { error } = await supabase
    .from('class_packages')
    .update({ is_paused: false, updated_at: new Date().toISOString() })
    .eq('id', pkg.id);
  if (error) throw error;

  const studentId = pkg.user_id || '';
  if (!studentId) return { moved: 0, deleted: 0 };
  // Resuming frees capacity again → rebalance and recreate what now fits.
  return rebalanceAndRegenerate(studentId);
}
