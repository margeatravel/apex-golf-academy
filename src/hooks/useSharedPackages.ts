import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shared-package visibility helpers.
 *
 * Rule (single source of truth for the student portal):
 *  - A package the student OWNS (class_packages.user_id) or is a MEMBER of
 *    (package_members.student_id) is fully visible to them, together with every
 *    lesson linked to it via package_id — no matter which member took it.
 *  - Individual (non-shared) packages and their lessons stay private to their
 *    owner.
 *
 * RLS already implements exactly this (`Shared members can view their packages`
 * / `Students can view lessons for shared packages`), so these hooks only widen
 * the client-side filters that were previously owner-only.
 */

/** Package ids where this student is listed as a shared member. */
export function useSharedPackageIds(studentId?: string | null) {
  const { data = [] } = useQuery({
    queryKey: ['my-shared-package-ids', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('package_members')
        .select('package_id')
        .eq('student_id', studentId!);
      return (data ?? []).map((r: any) => r.package_id as string);
    },
  });
  return data as string[];
}

/**
 * For each package id → names of the OTHER people sharing it
 * (owner + members, minus the viewing student). Empty array = not shared.
 */
export function useSharedPackageMemberNames(packageIds: string[], selfId?: string | null) {
  const key = packageIds.slice().sort().join(',');
  const { data } = useQuery({
    queryKey: ['package-shared-members', key, selfId],
    enabled: packageIds.length > 0 && !!selfId,
    queryFn: async () => {
      const [{ data: members }, { data: pkgs }] = await Promise.all([
        supabase.from('package_members').select('package_id, student_id').in('package_id', packageIds),
        supabase.from('class_packages').select('id, user_id').in('id', packageIds),
      ]);
      const byPkg = new Map<string, Set<string>>();
      (pkgs ?? []).forEach((p: any) => byPkg.set(p.id, new Set<string>([p.user_id])));
      (members ?? []).forEach((m: any) => {
        const set = byPkg.get(m.package_id) ?? new Set<string>();
        set.add(m.student_id);
        byPkg.set(m.package_id, set);
      });
      const allIds = Array.from(new Set(Array.from(byPkg.values()).flatMap((s) => Array.from(s))));
      const nameById = new Map<string, string>();
      if (allIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allIds);
        (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name || p.email || ''));
      }
      const out: Record<string, string[]> = {};
      byPkg.forEach((set, pkgId) => {
        out[pkgId] = Array.from(set)
          .filter((id) => id !== selfId)
          .map((id) => nameById.get(id) || '')
          .filter(Boolean);
      });
      return out;
    },
  });
  return (data ?? {}) as Record<string, string[]>;
}

/** "Compartido con Ana y Luis" / "Shared with Ana and Luis". */
export function formatSharedWith(names: string[], es: boolean) {
  if (!names.length) return null;
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${names[names.length - 1]}`;
  return es ? `Compartido con ${joined}` : `Shared with ${joined}`;
}
