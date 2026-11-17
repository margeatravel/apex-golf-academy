import { supabase } from '@/integrations/supabase/client';

/**
 * Counts items attached to a class_packages row before deletion.
 * Used by the confirm UI so admins always see what they're about to remove.
 */
export async function getPackageAttachments(packageId: string): Promise<{
  lessons: number;
  payments: number;
  members: number;
}> {
  const [lessonsRes, paymentsRes, membersRes] = await Promise.all([
    supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('package_id', packageId),
    supabase.from('package_payments').select('id', { count: 'exact', head: true }).eq('package_id', packageId),
    supabase.from('package_members').select('id', { count: 'exact', head: true }).eq('package_id', packageId),
  ]);
  return {
    lessons: lessonsRes.count ?? 0,
    payments: paymentsRes.count ?? 0,
    members: membersRes.count ?? 0,
  };
}

/**
 * Hard-delete a class_package after detaching attached lessons.
 * Order matters: detach lessons (so we don't lose lesson history),
 * then drop dependent payments/members, then the package itself.
 * Throws on the first error so the caller can surface error.message.
 */
export async function deletePackageCascade(packageId: string): Promise<void> {
  // 1) Detach lessons (keep them; just unlink from this package)
  {
    const { error } = await supabase
      .from('lessons')
      .update({ package_id: null })
      .eq('package_id', packageId);
    if (error) throw new Error(`Could not detach lessons: ${error.message}`);
  }
  // 2) Delete package payments
  {
    const { error } = await supabase
      .from('package_payments')
      .delete()
      .eq('package_id', packageId);
    if (error) throw new Error(`Could not delete package payments: ${error.message}`);
  }
  // 3) Delete package members (shared-access rows)
  {
    const { error } = await supabase
      .from('package_members')
      .delete()
      .eq('package_id', packageId);
    if (error) throw new Error(`Could not delete package members: ${error.message}`);
  }
  // 4) Delete the package
  {
    const { error } = await supabase
      .from('class_packages')
      .delete()
      .eq('id', packageId);
    if (error) throw new Error(`Could not delete package: ${error.message}`);
  }
}