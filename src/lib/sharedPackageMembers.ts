import { supabase } from '@/integrations/supabase/client';

export interface PackageMemberOption {
  id: string;
  fullName: string;
  isOwner: boolean;
}

/**
 * Members of a package: the owner first, then the shared members, each with
 * their display name. Used by the "¿Quién toma la clase?" pickers (booking
 * and recurring slots). Returns [] when the package is not shared.
 */
export async function fetchPackageMemberOptions(packageId: string): Promise<PackageMemberOption[]> {
  const [{ data: pkg }, { data: members }] = await Promise.all([
    supabase.from('class_packages').select('id, user_id').eq('id', packageId).maybeSingle(),
    supabase.from('package_members').select('package_id, student_id').eq('package_id', packageId),
  ]);
  if (!pkg) return [];
  const ids: { id: string; isOwner: boolean }[] = [{ id: (pkg as any).user_id, isOwner: true }];
  const seen = new Set<string>([(pkg as any).user_id]);
  for (const m of (members ?? []) as any[]) {
    if (!seen.has(m.student_id)) {
      seen.add(m.student_id);
      ids.push({ id: m.student_id, isOwner: false });
    }
  }
  if (ids.length === 0) return [];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids.map((x) => x.id));
  const nameById = new Map<string, string>();
  (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name || p.email || ''));
  return ids.map((x) => ({
    id: x.id,
    fullName: nameById.get(x.id) || '',
    isOwner: x.isOwner,
  }));
}

export const firstNameOf = (fullName: string) => (fullName || '').trim().split(/\s+/)[0] || '';
