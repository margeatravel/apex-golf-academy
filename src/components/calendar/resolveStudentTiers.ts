import { supabase } from '@/integrations/supabase/client';

export type PaidTier = 'scratch' | 'pro' | 'apex';

export interface StudentTierResolution {
  paidIds: Set<string>;
  tierById: Map<string, PaidTier>;
  hasPaidSub: (sid: string | null | undefined) => boolean;
  tierOf: (sid: string | null | undefined) => PaidTier | null;
}

/**
 * Resolves the effective paid tier (scratch/pro/apex) for a set of students,
 * preferring active/trialing Stripe subscriptions and falling back to manual
 * plan overrides / plan_tier on the profile (used when an admin sets a tier
 * without a Stripe subscription row).
 */
export async function resolveStudentTiers(
  studentIds: string[],
): Promise<StudentTierResolution> {
  const paidIds = new Set<string>();
  const tierById = new Map<string, PaidTier>();

  const ids = Array.from(new Set(studentIds.filter(Boolean)));
  if (ids.length === 0) {
    return {
      paidIds,
      tierById,
      hasPaidSub: () => false,
      tierOf: () => null,
    };
  }

  // 1) Stripe-backed subscriptions
  const { data: paidSubs = [] } = await supabase
    .from('subscriptions')
    .select('student_id, plan_tier, status')
    .in('status', ['active', 'trialing'])
    .in('plan_tier', ['scratch', 'pro', 'apex'])
    .in('student_id', ids);
  (paidSubs || []).forEach((s: any) => {
    if (!s.student_id || !s.plan_tier) return;
    paidIds.add(s.student_id);
    if (!tierById.has(s.student_id)) tierById.set(s.student_id, s.plan_tier);
  });

  // 2) Profile plan_tier + manual override fallback
  const { data: profiles = [] } = await supabase
    .from('profiles')
    .select('id, plan_tier, manual_plan_override, override_expires_at')
    .in('id', ids);
  const now = Date.now();
  (profiles || []).forEach((p: any) => {
    // Mirror getEffectivePlan: a non-expired manual override ALWAYS wins
    // over plan_tier, even when the override is 'free' / 'member'.
    let effective: PaidTier | null = null;
    const override = p.manual_plan_override as
      | PaidTier
      | 'free'
      | 'member'
      | null;
    const overrideActive =
      !!override &&
      (!p.override_expires_at ||
        new Date(p.override_expires_at).getTime() > now);
    if (overrideActive) {
      if (override === 'scratch' || override === 'pro' || override === 'apex') {
        effective = override;
      }
      // else: override forces free/member → no paid tier badge
    } else {
      const t = p.plan_tier as PaidTier | 'free' | 'member' | null;
      if (t === 'scratch' || t === 'pro' || t === 'apex') effective = t;
    }
    if (effective) {
      paidIds.add(p.id);
      if (!tierById.has(p.id)) tierById.set(p.id, effective);
    }
    // If override forced a non-paid tier, also strip any Stripe-derived tier
    // we may have added from the subscriptions query so the badge disappears.
    if (overrideActive && !effective) {
      paidIds.delete(p.id);
      tierById.delete(p.id);
    }
  });

  return {
    paidIds,
    tierById,
    hasPaidSub: (sid) => !!sid && paidIds.has(sid),
    tierOf: (sid) => (sid && tierById.get(sid)) || null,
  };
}