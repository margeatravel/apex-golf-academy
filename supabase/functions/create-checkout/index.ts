import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// ── Courtesy (Stripe trial) campaign ─────────────────────────────────────
// Editable cut-off date for the promotion (UTC).
const COURTESY_CAMPAIGN_END = new Date("2026-10-31T06:00:00Z");

// Same tier resolution used by stripe-webhook/index.ts (upsertSubscription):
// product id first, then price id.
const PRICE_TO_TIER: Record<string, string> = {
  "price_1Sinw0Rw8gEMe8Y711w64DoY": "scratch",
  "price_1SinwJRw8gEMe8Y7CVutBkBd": "pro",
};
const PRODUCT_TO_TIER: Record<string, string> = {
  "prod_TgAGZ9Sdt68lo1": "scratch",
  "prod_TgAGrGYvHwWyMC": "pro",
};

const COURTESY_DAYS_BY_TIER: Record<string, number> = {
  pro: 60,
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = await req.json();
    const { priceId, mode, metadata, quantity, currency, productName, item, packageSize, coachId } = body;
    const rawQty = Number(quantity);
    if (quantity !== undefined && (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 9)) {
      return new Response(JSON.stringify({ error: "Invalid quantity. Must be an integer between 1 and 9." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const lineQuantity = Number.isInteger(rawQty) ? Math.max(1, Math.min(9, rawQty)) : 1;
    logStep("Payload received", { priceId, mode, metadata, quantity: lineQuantity, currency, productName, item, packageSize, coachId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ── Server-side price resolution (never trust client amounts) ────────
    // When the client asks for a catalog item ("individual" / "package"),
    // the authoritative amount comes from coach_lesson_pricing in the DB and
    // the Pro discount eligibility is derived from the user's own records.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const SANTIAGO_COACH_ID = "13480fb4-e4d2-423c-b035-c65846b061fc";
    let serverAmount: number | null = null;
    let serverPriceId: string | null = null;
    let serverProductName: string | null = null;

    if (item === "individual" || item === "package") {
      // Resolve the coach: explicit coachId, else the student's assigned coach.
      const { data: profile } = await admin
        .from("profiles")
        .select("assigned_coach_id, plan_tier, manual_plan_override, override_expires_at")
        .eq("id", user.id)
        .maybeSingle();

      const resolvedCoachId = String(coachId || profile?.assigned_coach_id || SANTIAGO_COACH_ID);

      const loadPricing = async (cid: string) => {
        const { data } = await admin
          .from("coach_lesson_pricing")
          .select("pricing")
          .eq("coach_id", cid)
          .maybeSingle();
        const p = (data as any)?.pricing;
        return p && Object.keys(p).length > 0 ? p : null;
      };

      let pricing = await loadPricing(resolvedCoachId);
      if (!pricing && resolvedCoachId !== SANTIAGO_COACH_ID) pricing = await loadPricing(SANTIAGO_COACH_ID);
      if (!pricing) {
        const { data: legacy } = await admin
          .from("academy_settings")
          .select("value")
          .eq("key", "lesson_pricing")
          .maybeSingle();
        pricing = (legacy as any)?.value ?? null;
      }
      if (!pricing) {
        return new Response(JSON.stringify({ error: "No pricing configured for this coach. Ask your coach to set prices in Admin → Pricing." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // ── Pro eligibility: server-side only ──
      const overrideActive =
        profile?.manual_plan_override === "pro" &&
        (!profile?.override_expires_at || new Date(profile.override_expires_at) > new Date());
      let isPro = overrideActive;
      if (!isPro) {
        const { data: sub } = await admin
          .from("subscriptions")
          .select("plan_tier, is_active, status, current_period_end")
          .eq("student_id", user.id)
          .eq("is_active", true)
          .order("current_period_end", { ascending: false })
          .limit(1)
          .maybeSingle();
        isPro =
          !!sub &&
          String((sub as any).plan_tier || "").toLowerCase() === "pro" &&
          ["active", "trialing", "past_due"].includes(String((sub as any).status || "active").toLowerCase());
      }
      logStep("Pro eligibility resolved", { isPro, resolvedCoachId });

      if (item === "individual") {
        const base = Number(pricing.individual_price);
        const pro = Number(pricing.pro_individual_price);
        const useProPrice = isPro && Number.isFinite(pro) && pro > 0;
        serverAmount = useProPrice ? pro : base;
        serverPriceId = useProPrice
          ? pricing.pro_individual_price_id || pricing.individual_price_id || null
          : pricing.individual_price_id || null;
        serverProductName = useProPrice ? "Individual Lesson (Pro)" : "Individual Lesson";
      } else {
        const size = Number(packageSize);
        const pkg = Array.isArray(pricing.packages)
          ? pricing.packages.find((p: any) => Number(p.lessons) === size)
          : null;
        if (!pkg) {
          return new Response(JSON.stringify({ error: `No pricing configured for a ${packageSize}-lesson package.` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }
        const base = Number(pkg.price);
        const pro = Number(pkg.pro_price);
        const useProPrice = isPro && Number.isFinite(pro) && pro > 0;
        serverAmount = useProPrice ? pro : base;
        serverPriceId = useProPrice ? pkg.pro_price_id || pkg.price_id || null : pkg.price_id || null;
        serverProductName = `${size}-Lesson Package${useProPrice ? " (Pro)" : ""}`;
      }

      if (!Number.isFinite(serverAmount) || (serverAmount as number) <= 0) {
        return new Response(JSON.stringify({ error: "Invalid price configured for this item. Ask your coach to review Admin → Pricing." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      logStep("Server-resolved price", { item, packageSize, serverAmount, serverPriceId });
    }

    const effectivePriceId = serverAmount !== null ? serverPriceId : priceId;

    // ── Resolve the price ────────────────────────────────────────────────
    // Legacy/seeded pricing rows may still carry placeholder ids such as
    // "price_demo_pkg10" that do not exist in Stripe (Stripe replies
    // "No such price: ..."). When that happens — or when no priceId is sent —
    // fall back to a real, reusable Stripe product+price resolved by
    // lookup_key so purchases stay trackable in the Stripe dashboard.
    const isPlaceholder = !effectivePriceId || String(effectivePriceId).startsWith("price_demo_");
    let resolvedPriceId: string | null = isPlaceholder ? null : String(effectivePriceId);

    if (isPlaceholder) {
      const cur = String(currency || "mxn").toLowerCase();
      // Amount is ALWAYS server-derived; a client-sent amount is ignored.
      const pesos = Number(serverAmount);
      if (!Number.isFinite(pesos) || pesos <= 0) {
        return new Response(
          JSON.stringify({
            error:
              "This product is not connected to Stripe yet (placeholder price id). Ask your coach to set a real Stripe price in Admin → Pricing.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
      const unitAmount = Math.round(pesos * 100);
      const name = String(serverProductName || productName || effectivePriceId || "Margea Golf Academy Lesson").slice(0, 120);
      const lookupKey = `apex_${(effectivePriceId || name)
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")}_${unitAmount}_${cur}`.slice(0, 200);

      const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, active: true });
      if (existing.data.length > 0) {
        resolvedPriceId = existing.data[0].id;
        logStep("Reused price by lookup_key", { lookupKey, priceId: resolvedPriceId });
      } else {
        const product = await stripe.products.create({ name, metadata: { source: "apex_pricing", lookup_key: lookupKey } });
        const created = await stripe.prices.create({
          product: product.id,
          currency: cur,
          unit_amount: unitAmount,
          lookup_key: lookupKey,
          ...(mode === "payment" ? {} : { recurring: { interval: "month" } }),
        });
        resolvedPriceId = created.id;
        logStep("Created new Stripe price", { lookupKey, priceId: resolvedPriceId, unitAmount, cur });
      }
    }
    
    // Check if customer already exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    const origin = req.headers.get("origin") || "https://www.margeagolfacademy.com";
    const checkoutMode = mode === "payment" ? "payment" : "subscription";
    
    // Always include student identification metadata
    const sessionMetadata = {
      student_id: user.id,
      student_email: user.email,
      student_name: user.user_metadata?.full_name || user.email,
      ...(metadata || {}),
    };

    const sessionParams: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: resolvedPriceId, quantity: lineQuantity, ...(checkoutMode === "payment" ? { adjustable_quantity: { enabled: false } } : {}) }],
      mode: checkoutMode,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?payment=canceled`,
      metadata: { ...sessionMetadata, quantity: String(lineQuantity) },
    };

    // ── Courtesy trial (additive) ────────────────────────────────────────
    // Only for subscription checkouts, accounts that never paid and have no
    // active/trialing subscription, and while the campaign is running.
    if (checkoutMode === "subscription" && new Date() < COURTESY_CAMPAIGN_END) {
      try {
        const { data: activeSub } = await admin
          .from("subscriptions")
          .select("status, is_active")
          .eq("student_id", user.id)
          .in("status", ["active", "trialing"])
          .limit(1)
          .maybeSingle();

        const { count: paymentCount } = await admin
          .from("stripe_payments")
          .select("id", { count: "exact", head: true })
          .eq("student_id", user.id);

        const eligible = !activeSub && !(paymentCount && paymentCount > 0);
        logStep("Courtesy eligibility", { eligible, hasActiveSub: !!activeSub, paymentCount });

        if (eligible && resolvedPriceId) {
          // Resolve tier exactly like stripe-webhook upsertSubscription does:
          // product id map first, then price id map, then billing_plans.
          let productId: string | null = null;
          try {
            const price = await stripe.prices.retrieve(String(resolvedPriceId));
            productId = typeof price.product === "string" ? price.product : (price.product as any)?.id ?? null;
          } catch (_) { /* ignore */ }

          let tier: string | null =
            (productId ? PRODUCT_TO_TIER[productId] : null) || PRICE_TO_TIER[String(resolvedPriceId)] || null;

          if (!tier) {
            const { data: bp } = await admin
              .from("billing_plans")
              .select("tier_key, name")
              .or(
                [
                  productId ? `stripe_product_id.eq.${productId}` : null,
                  `stripe_price_id.eq.${resolvedPriceId}`,
                ].filter(Boolean).join(","),
              )
              .limit(1)
              .maybeSingle();
            tier = String((bp as any)?.tier_key || (bp as any)?.name || "").toLowerCase() || null;
          }

          const days = tier ? COURTESY_DAYS_BY_TIER[tier] : undefined;
          if (days) {
            sessionParams.payment_method_collection = "always";
            sessionParams.subscription_data = {
              ...(sessionParams.subscription_data || {}),
              trial_period_days: days,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
            };
            logStep("Courtesy trial applied", { tier, days });
          } else {
            logStep("Courtesy trial skipped (tier not mapped)", { tier, productId });
          }
        }
      } catch (err) {
        logStep("Courtesy trial check failed (continuing without trial)", { error: String(err) });
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);


    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
