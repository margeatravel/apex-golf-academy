import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FamilyTarget {
  id: string;
  name: string;
  isSelf: boolean;
  isManaged: boolean;
  relationship: string | null;
}

/**
 * Upload destinations for a given student: the student themself plus every
 * account linked to them through family_links (children with or without their
 * own account, partner, parents). Used by the coach upload flows so a video
 * can be filed under the right family member.
 */
export function useFamilyTargets(studentId?: string | null) {
  return useQuery({
    queryKey: ['family-targets', studentId],
    enabled: !!studentId,
    staleTime: 30_000,
    queryFn: async (): Promise<FamilyTarget[]> => {
      if (!studentId) return [];

      const { data: self } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', studentId)
        .maybeSingle();

      const selfTarget: FamilyTarget = {
        id: studentId,
        name: (self as any)?.full_name || (self as any)?.email || 'Alumno',
        isSelf: true,
        isManaged: false,
        relationship: null,
      };

      const { data: links } = await supabase
        .from('family_links')
        .select('parent_user_id, child_user_id, relationship')
        .or(`parent_user_id.eq.${studentId},child_user_id.eq.${studentId}`);

      const others = new Map<string, string | null>();
      for (const l of links || []) {
        const other = l.parent_user_id === studentId ? l.child_user_id : l.parent_user_id;
        if (other && other !== studentId && !others.has(other)) {
          others.set(other, (l as any).relationship ?? null);
        }
      }
      if (others.size === 0) return [selfTarget];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_managed')
        .in('id', Array.from(others.keys()));

      const rest: FamilyTarget[] = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email || 'Familiar',
        isSelf: false,
        isManaged: p.is_managed === true,
        relationship: others.get(p.id) ?? null,
      }));
      rest.sort((a, b) => a.name.localeCompare(b.name));

      return [selfTarget, ...rest];
    },
  });
}
