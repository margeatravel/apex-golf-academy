import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolvePlanColor, usePlanColors, type PlanTierKey } from '@/hooks/usePlanColors';

export type PlanOption = { tier: string; label: string; color: string };

function normalizeTier(row: any): string | null {
  const raw = String(row?.tier_key || row?.name || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'free' || raw === 'gratis' || raw === 'member') return 'member';
  if (raw === 'family' || raw === 'familiar') return 'family';
  if (raw === 'scratch') return 'scratch';
  if (raw === 'pro') return 'pro';
  if (raw === 'apex' || raw === 'apex level') return 'apex';
  return null;
}

/**
 * Plan options for admin pickers (manual plan override, badges).
 * Single source of truth = billing_plans, so new plans (e.g. Familiar) show up
 * automatically instead of being hardcoded in the UI.
 */
export function usePlanOptions(): PlanOption[] {
  const colors = usePlanColors();
  const { data } = useQuery({
    queryKey: ['plan-options'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, tier_key, is_active, plan_type, sort_order, price_amount')
        .in('plan_type', ['subscription', 'internal']);
      if (error) throw error;
      return data || [];
    },
  });

  const seen = new Set<string>();
  const options: PlanOption[] = [];
  for (const row of (data || []) as any[]) {
    if (row.is_active === false) continue;
    const tier = normalizeTier(row);
    if (!tier || seen.has(tier)) continue;
    seen.add(tier);
    options.push({
      tier,
      label: String(row.name || tier),
      color: resolvePlanColor(colors, tier as PlanTierKey),
    });
  }

  if (options.length === 0) {
    return [
      { tier: 'member', label: 'Free', color: colors.member },
      { tier: 'family', label: 'Familiar', color: colors.family },
      { tier: 'scratch', label: 'Scratch', color: colors.scratch },
      { tier: 'pro', label: 'Pro', color: colors.pro },
      { tier: 'apex', label: 'Apex', color: colors.apex },
    ];
  }

  const order = ['member', 'family', 'scratch', 'pro', 'apex'];
  return options.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
}
