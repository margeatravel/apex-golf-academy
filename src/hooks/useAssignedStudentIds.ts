import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the set of student ids that the current viewer is allowed to see.
 *
 * - Owner (role === 'admin' without a coach preview active): `isOwner = true`
 *   and `studentIds = null` — meaning "no client-side filter, show everything".
 * - Non-owner coach (real coach account OR admin previewing a coach):
 *   `isOwner = false` and `studentIds` is the array of profile ids whose
 *   `assigned_coach_id` equals the effective coach id. An empty array means
 *   the coach has no assigned students yet and every downstream list must
 *   render empty.
 */
export function useAssignedStudentIds() {
  const { effectiveIsAdmin, effectiveCoachId } = useAuth();
  const isOwner = effectiveIsAdmin;

  const q = useQuery({
    queryKey: ['assigned-student-ids', effectiveCoachId ?? 'none'],
    queryFn: async () => {
      if (!effectiveCoachId) return [] as string[];
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('assigned_coach_id', effectiveCoachId);
      if (error) return [] as string[];
      return (data ?? []).map((r: any) => r.id as string);
    },
    enabled: !isOwner && !!effectiveCoachId,
    staleTime: 60_000,
  });

  return {
    isOwner,
    /** null when owner (unfiltered); otherwise the coach's assigned student ids. */
    studentIds: isOwner ? null : (q.data ?? []),
    isLoading: !isOwner && q.isLoading,
  };
}