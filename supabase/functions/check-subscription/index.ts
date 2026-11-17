import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { grantsSubscriptionAccess } from "../_shared/subscriptionAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("Authorization header found");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getClaims(token);
    if (userError || !userData?.claims?.sub) {
      return new Response(JSON.stringify({ error: `Authentication error: ${userError?.message || 'Invalid token'}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const userId = userData.claims.sub;
    const userEmail = userData.claims.email as string | undefined;
    if (!userEmail) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId, email: userEmail });

    // Check for manual override first
    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('manual_plan_override, override_expires_at')
      .eq('id', userId)
      .single();

    if (profileData?.manual_plan_override) {
      const now = new Date();
      const expiresAt = profileData.override_expires_at ? new Date(profileData.override_expires_at) : null;
      
      // If no expiry or not yet expired, use manual override
      if (!expiresAt || expiresAt > now) {
        logStep("Manual override active", { 
          planTier: profileData.manual_plan_override,
          expiresAt: profileData.override_expires_at
        });
        return new Response(JSON.stringify({
          subscribed: profileData.manual_plan_override !== 'free',
          product_id: null,
          subscription_end: profileData.override_expires_at,
          plan_tier: profileData.manual_plan_override === 'free' ? null : profileData.manual_plan_override,
          manual_override: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, user has no subscription");
      return new Response(JSON.stringify({ 
        subscribed: false,
        product_id: null,
        subscription_end: null,
        plan_tier: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });

    const entitledSubscription = subscriptions.data.find(sub => grantsSubscriptionAccess(sub.status));
    const hasActiveSub = Boolean(entitledSubscription);
    let productId = null;
    let subscriptionEnd = null;
    let planTier = null;

    // Product ID to plan tier mapping (loaded dynamically from billing_plans)
    const { data: billingPlans } = await supabaseClient
      .from('billing_plans')
      .select('stripe_product_id, name, tier_key')
      .eq('plan_type', 'subscription')
      .eq('is_active', true);

    const productToPlan: Record<string, string> = {};
    for (const bp of billingPlans || []) {
      if (bp.stripe_product_id) {
        productToPlan[bp.stripe_product_id] = bp.tier_key || String(bp.name).toLowerCase();
      }
    }

    if (entitledSubscription) {
      const subscription = entitledSubscription;
      // Stripe API 2025-08-27+: current_period_end moved to subscription items
      const item = subscription.items.data[0];
      const periodEndUnix = (item as any)?.current_period_end ?? (subscription as any)?.current_period_end;
      subscriptionEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
      productId = item.price.product as string;
      planTier = productToPlan[productId] || null;
      logStep("Active subscription found", { 
        subscriptionId: subscription.id, 
        endDate: subscriptionEnd,
        productId,
        planTier
      });
    } else {
      logStep("No active subscription found");
    }

    // Sync profile.plan_tier with the live Stripe truth so the dashboard,
    // header pill, and PlanSelectionPage all stay aligned. This prevents the
    // case where a user marked themselves as "member" locally while a paid
    // Stripe subscription is still active (or vice versa).
    try {
      const desiredTier = hasActiveSub ? (planTier ?? null) : null;
      const { data: currentProfile } = await supabaseClient
        .from('profiles')
        .select('plan_tier')
        .eq('id', userId)
        .maybeSingle();
      const currentTier = currentProfile?.plan_tier ?? null;

      if (entitledSubscription && desiredTier) {
        // Active Stripe sub but profile is out of sync — fix it.
        const { error: syncError } = await supabaseClient
          .from('profiles')
          .update({
            plan_tier: desiredTier,
            subscription_status: entitledSubscription.status,
            current_period_end: subscriptionEnd,
          })
          .eq('id', userId);
        if (syncError) throw syncError;
        logStep("Synced profile.plan_tier to live Stripe tier", { from: currentTier, to: desiredTier });
      } else if (!hasActiveSub && (currentTier === 'scratch' || currentTier === 'pro' || currentTier === 'apex' || currentTier === 'elite')) {
        // No active Stripe sub but profile thinks it has paid tier — drop to member.
        await supabaseClient
          .from('profiles')
          .update({
            plan_tier: 'member',
            subscription_status: 'inactive',
          })
          .eq('id', userId);
        logStep("Cleared stale paid plan_tier (no active Stripe sub)", { from: currentTier });
      }
    } catch (syncErr) {
      logStep("Profile sync warning (non-fatal)", { error: String(syncErr) });
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
      plan_tier: planTier
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
