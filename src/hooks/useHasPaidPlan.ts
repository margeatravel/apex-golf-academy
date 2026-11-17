import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isInTrial } from '@/contexts/AuthContext';

function normalize(name: string | null | undefined): string | null {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'free' || key === 'member' || key === 'gratis') return 'member';
  if (key === 'family' || key === 'familiar') return 'family';
  if (key === 'apex' || key === 'apex level' || key === 'tour level' || key === 'tour') return 'apex';
  return key;
}

/**
 * Presentation-only gate: is the viewer on a PAID plan?
 * "Paid" is read from billing_plans (price_amount > 0) — never hardcoded.
 * Free / no plan resolves to false.
 */
export function useHasPaidPlan() {
  const { effectivePlan, trialEndsAt } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['paid-plan-tiers'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, tier_key, price_amount, plan_type, is_active')
        .in('plan_type', ['subscription', 'internal']);
      if (error) throw error;
      return data || [];
    },
  });

  const tier = normalize(effectivePlan);
  const paidTiers = new Set(
    (data || [])
      .filter((r: any) => r.is_active !== false && Number(r.price_amount) > 0)
      .map((r: any) => normalize(r.tier_key) || normalize(r.name))
      .filter(Boolean) as string[],
  );

  // An active free trial unlocks the whole portal, so it counts as paid for
  // presentation gates (never for billing).
  if (isInTrial(trialEndsAt)) return { hasPaidPlan: true, loading: false };

  return { hasPaidPlan: !!tier && paidTiers.has(tier), loading: isLoading };
}
