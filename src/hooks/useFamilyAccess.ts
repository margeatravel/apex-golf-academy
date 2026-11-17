import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHasPaidPlan } from './useHasPaidPlan';

/**
 * Family page gate.
 *
 * Being linked by the coach does NOT grant access: the Family section opens
 * only when the viewer pays (or is in trial) or when one of their linked
 * relatives is on a paid plan. Inviting always requires the viewer's own plan.
 */
export function useFamilyAccess() {
  const { user } = useAuth();
  const { hasPaidPlan, loading: paidLoading } = useHasPaidPlan();

  const { data, isLoading } = useQuery({
    queryKey: ['family-access-status', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('family_access_status');
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      return {
        linkedCount: Number(row?.linked_count ?? 0),
        hasPaidRelative: !!row?.has_paid_relative,
      };
    },
  });

  const linkedCount = data?.linkedCount ?? 0;
  const hasPaidRelative = data?.hasPaidRelative ?? false;

  return {
    canInvite: hasPaidPlan,
    canUseFamily: hasPaidPlan || hasPaidRelative,
    linkedCount,
    loading: paidLoading || (!!user?.id && isLoading),
  };
}
