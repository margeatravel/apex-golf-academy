import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: any) =>
  console.log(`[ADMIN-CANCEL-SUB] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = claimsRes.claims.sub;

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    const { data: isStaff } = await admin.rpc("has_role", { _user_id: uid, _role: "staff" });
    const privileged = !!isAdmin || !!isStaff;

    const body = await req.json().catch(() => ({}));
    let { subscription_id, student_id, cancel_immediately } = body as {
      subscription_id?: string;
      student_id?: string;
      cancel_immediately?: boolean;
    };

    if (!privileged) {
      // Self-service: the caller may only ever cancel their own subscription,
      // always at period end. Client-sent identifiers are ignored.
      subscription_id = undefined;
      student_id = uid;
      cancel_immediately = false;
    }

    if (!subscription_id && !student_id) {
      return new Response(JSON.stringify({ error: "subscription_id or student_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Resolve subscription row (tolerant: id first, then any row for the student)
    const findByStudent = async (activeOnly: boolean) => {
      if (!student_id) return null;
      let q = admin.from("subscriptions").select("*").eq("student_id", student_id);
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    };

    let sub: any = null;
    if (subscription_id) {
      const { data, error } = await admin.from("subscriptions").select("*").eq("id", subscription_id).maybeSingle();
      if (error) throw error;
      sub = data;
    }
    if (!sub) sub = await findByStudent(true);
    if (!sub) sub = await findByStudent(false);

    if (!sub) {
      log("No subscription row found", { subscription_id, student_id });
      return new Response(JSON.stringify({ error: "Subscription not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sub.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "Subscription has no Stripe ID" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let stripeSub: Stripe.Subscription | null = null;
    let alreadyMissing = false;
    try {
      if (cancel_immediately) {
        log("Canceling immediately", { id: sub.stripe_subscription_id });
        stripeSub = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } else {
        log("Canceling at period end", { id: sub.stripe_subscription_id });
        stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      }
    } catch (stripeError) {
      const error = stripeError as { code?: string; statusCode?: number; message?: string };
      if (error.code !== "resource_missing" && error.statusCode !== 404) throw stripeError;

      // Stripe is authoritative: a missing remote subscription is already canceled.
      // Reconcile our stale local row instead of turning an idempotent admin action
      // into a 500 response.
      alreadyMissing = true;
      log("Stripe subscription already missing; reconciling locally", {
        id: sub.stripe_subscription_id,
      });
    }

    // Sync local row immediately; webhook will reconcile authoritatively.
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      status: stripeSub?.status ?? "canceled",
      cancel_at_period_end: stripeSub?.cancel_at_period_end ?? false,
      canceled_at: stripeSub?.canceled_at
        ? new Date(stripeSub.canceled_at * 1000).toISOString()
        : alreadyMissing ? now : null,
      is_active: stripeSub
        ? stripeSub.status === "active" || stripeSub.status === "trialing"
        : false,
      // Clear paused state on cancel — a canceled sub should never also display "Paused".
      paused_at: null,
      last_synced_at: now,
    };
    const { error: updateError } = await admin.from("subscriptions").update(updates).eq("id", sub.id);
    if (updateError) throw updateError;

    if ((cancel_immediately || alreadyMissing) && sub.student_id) {
      // Drop paid tier on the profile so access stops now.
      const { error: profileError } = await admin.from("profiles").update({
        plan_tier: "member",
        subscription_status: "canceled",
      }).eq("id", sub.student_id);
      if (profileError) throw profileError;
    }

    return new Response(JSON.stringify({
      success: true,
      already_canceled: alreadyMissing,
      status: stripeSub?.status ?? "canceled",
      cancel_at_period_end: stripeSub?.cancel_at_period_end ?? false,
      current_period_end: (stripeSub as any)?.current_period_end
        ? new Date((stripeSub as any).current_period_end * 1000).toISOString()
        : null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});