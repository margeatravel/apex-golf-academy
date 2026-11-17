import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlanTierKey = 'free' | 'member' | 'family' | 'scratch' | 'pro' | 'apex';

// Fallback colors used until billing_plans loads (or if a tier row is missing).
// These match the historically hardcoded accents so nothing regresses visually.
const FALLBACK: Record<PlanTierKey, string> = {
  free: '#9CA3AF',
  member: '#9CA3AF',
  family: '#F97316',
  scratch: '#4A7C59',
  pro: '#D9AA42',
  apex: '#3887FF',
};

function normalizeName(name: string | null | undefined): PlanTierKey | null {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'free' || key === 'member') return 'member';
  if (key === 'family' || key === 'familiar') return 'family';
  if (key === 'scratch') return 'scratch';
  if (key === 'pro') return 'pro';
  if (key === 'apex' || key === 'apex level' || key === 'tour level' || key === 'tour') return 'apex';
  return null;
}

/**
 * Single source of truth for plan accent colors. Reads billing_plans.color and
 * exposes a tier -> hex map with safe fallbacks so consumers never render blank.
 * All UI that shows a plan accent (pricing card, tier badges, dashboard chips)
 * should read from here, not from hardcoded literals.
 */
export function usePlanColors() {
  const { data } = useQuery({
    queryKey: ['plan-colors'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, tier_key, color, is_active')
        .in('plan_type', ['subscription', 'internal']);
      if (error) throw error;
      return data || [];
    },
  });

  const map: Record<PlanTierKey, string> = { ...FALLBACK };
  for (const row of data || []) {
    const tier = normalizeName((row as any).tier_key) || normalizeName((row as any).name);
    const c = (row as any).color;
    if (tier && typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) {
      map[tier] = c;
      if (tier === 'member') map.free = c;
    }
  }
  return map;
}

export function resolvePlanColor(map: Record<PlanTierKey, string>, tier: string | null | undefined): string {
  const norm = normalizeName(tier);
  return (norm && map[norm]) || FALLBACK.member;
}