// Server-side mirror of the portal's "is the viewer on a paid plan?" gate.
// Paid tiers are read from billing_plans (price_amount > 0) — never hardcoded.
// An active free trial counts as paid for access gates (never for billing).

export function normalizeTier(name: string | null | undefined): string | null {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  if (key === "free" || key === "member" || key === "gratis") return "member";
  if (key === "family" || key === "familiar") return "family";
  if (key === "apex" || key === "apex level" || key === "tour level" || key === "tour") return "apex";
  return key;
}

// deno-lint-ignore no-explicit-any
export async function hasPaidAccess(service: any, userId: string): Promise<boolean> {
  const { data: profile } = await service
    .from("profiles")
    .select("plan_tier, manual_plan_override, override_expires_at, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return false;

  const now = Date.now();
  if (profile.trial_ends_at && new Date(profile.trial_ends_at).getTime() > now) return true;

  const overrideActive =
    profile.manual_plan_override &&
    (!profile.override_expires_at || new Date(profile.override_expires_at).getTime() > now);
  const tier = normalizeTier(
    overrideActive ? profile.manual_plan_override : profile.plan_tier,
  );
  if (!tier) return false;

  const { data: plans } = await service
    .from("billing_plans")
    .select("name, tier_key, price_amount, plan_type, is_active")
    .in("plan_type", ["subscription", "internal"]);

  const paid = new Set(
    (plans || [])
      // deno-lint-ignore no-explicit-any
      .filter((r: any) => r.is_active !== false && Number(r.price_amount) > 0)
      // deno-lint-ignore no-explicit-any
      .map((r: any) => normalizeTier(r.tier_key) || normalizeTier(r.name))
      .filter(Boolean) as string[],
  );

  return paid.has(tier);
}
