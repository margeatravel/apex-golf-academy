import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, hasApexAiAccess, isInTrial } from '@/contexts/AuthContext';

/** Map an effective plan tier to the billing_plans row name (lowercased). */
function planRowName(tier: string | null | undefined): string {
  switch (String(tier || 'free')) {
    case 'scratch': return 'scratch';
    case 'pro': return 'pro';
    case 'apex': return 'apex level';
    case 'family': return 'familiar';
    default: return 'gratis';
  }
}

/**
 * Single source of truth for Margea AI access on the client.
 * Reads the per-plan `apex_ai_enabled` flag from billing_plans (the same field
 * the admin plan editor writes, and the same field the server RPC
 * `has_apex_ai_access` reads) and combines it with the paid grace window.
 * While the flag is loading it falls back to the legacy tier helper so nothing
 * flashes open for tiers that never had access.
 */
export function useApexAiAccess(): boolean {
  const { effectivePlan, graceUntil, graceTier, trialEndsAt } = useAuth();

  const { data: flags } = useQuery({
    queryKey: ['apex-ai-plan-flags'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, apex_ai_enabled')
        .in('plan_type', ['subscription', 'internal']);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const row of data || []) {
        map[String((row as any).name || '').trim().toLowerCase()] = (row as any).apex_ai_enabled !== false;
      }
      return map;
    },
  });

  const graceActive = !!graceUntil && new Date(graceUntil) > new Date();
  if (graceActive) return true;
  // Active free trial = full portal access.
  if (isInTrial(trialEndsAt)) return true;
  if (!flags) return hasApexAiAccess(effectivePlan, graceUntil, graceTier, trialEndsAt);
  return flags[planRowName(effectivePlan)] === true;
}
