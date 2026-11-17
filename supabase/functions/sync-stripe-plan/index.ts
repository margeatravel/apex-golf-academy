import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[SYNC-STRIPE-PLAN] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (claimsError || !callerId) throw new Error("Unauthorized");

    // Admin check
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      const { data: allowed } = await supabaseAdmin.rpc('has_staff_permission', { _user_id: callerId, _scope: 'plans_billing' });
      if (!allowed) throw new Error("Plans & Billing access required");
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const body = await req.json();
    const { action, plan } = body;

    logStep("Request received", { action, planId: plan?.id, planName: plan?.name });

    if (action === "sync") {
      // plan has: id, name, description, price_amount, currency, billing_interval, plan_type, stripe_product_id, stripe_price_id
      if (!plan?.id) throw new Error("Plan ID required");

      let stripeProductId = plan.stripe_product_id;
      let stripePriceId = plan.stripe_price_id;
      let oldPriceId = plan.stripe_price_id;

      // 1. Create or update Stripe product
      if (stripeProductId) {
        logStep("Updating existing Stripe product", { stripeProductId });
        await stripe.products.update(stripeProductId, {
          name: `SC Golf Academy — ${plan.name}`,
          description: plan.description || undefined,
          active: plan.is_active,
        });
      } else {
        logStep("Creating new Stripe product");
        const product = await stripe.products.create({
          name: `SC Golf Academy — ${plan.name}`,
          description: plan.description || undefined,
          metadata: { billing_plan_id: plan.id },
        });
        stripeProductId = product.id;
        logStep("Product created", { stripeProductId });
      }

      // 2. Handle price — only if price_amount > 0 (skip for free/internal plans)
      if (plan.price_amount > 0) {
        // Check if price actually changed
        let priceChanged = true;
        if (oldPriceId) {
          try {
            const existingPrice = await stripe.prices.retrieve(oldPriceId);
            priceChanged = existingPrice.unit_amount !== plan.price_amount ||
              existingPrice.currency !== plan.currency ||
              (plan.billing_interval !== 'one_time' && existingPrice.recurring?.interval !== plan.billing_interval) ||
              (plan.billing_interval === 'one_time' && existingPrice.type === 'recurring');
          } catch {
            priceChanged = true; // price doesn't exist, create new
          }
        }

        if (priceChanged || !oldPriceId) {
          logStep("Creating new Stripe price", { amount: plan.price_amount, currency: plan.currency, interval: plan.billing_interval });

          const priceParams: Stripe.PriceCreateParams = {
            product: stripeProductId,
            unit_amount: plan.price_amount,
            currency: plan.currency,
            metadata: { billing_plan_id: plan.id },
          };

          if (plan.billing_interval && plan.billing_interval !== "one_time") {
            priceParams.recurring = { interval: plan.billing_interval as Stripe.PriceCreateParams.Recurring.Interval };
          }

          const newPrice = await stripe.prices.create(priceParams);
          stripePriceId = newPrice.id;
          logStep("New price created", { stripePriceId });

          // Set as default price on product
          await stripe.products.update(stripeProductId, {
            default_price: stripePriceId,
          });

          // Deactivate old price (does NOT affect existing subscriptions)
          if (oldPriceId && oldPriceId !== stripePriceId) {
            try {
              await stripe.prices.update(oldPriceId, { active: false });
              logStep("Old price deactivated", { oldPriceId });
            } catch (e) {
              logStep("Warning: could not deactivate old price", { oldPriceId, error: String(e) });
            }
          }
        } else {
          logStep("Price unchanged, skipping price creation");
        }
      }

      // 3. Update billing_plans record
      const { error: updateError } = await supabaseAdmin
        .from("billing_plans")
        .update({
          stripe_product_id: stripeProductId,
          stripe_price_id: stripePriceId,
          sync_status: "synced",
          sync_error: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", plan.id);

      if (updateError) throw updateError;

      logStep("Plan synced successfully", { planId: plan.id, stripeProductId, stripePriceId });

      return new Response(JSON.stringify({
        success: true,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep("ERROR", { error: errorMessage });

    // Try to update sync_status to error if we have a plan ID
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.plan?.id) {
        await supabaseAdmin
          .from("billing_plans")
          .update({ sync_status: "error", sync_error: errorMessage })
          .eq("id", body.plan.id);
      }
    } catch {}

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
