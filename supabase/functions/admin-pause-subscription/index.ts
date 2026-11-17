import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: any) =>
  console.log(`[ADMIN-PAUSE-SUB] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

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
    if (!isAdmin && !isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { subscription_id, student_id, action, resumes_at } = body as {
      subscription_id?: string;
      student_id?: string;
      action: "pause" | "resume";
      resumes_at?: string;
    };

    if (action !== "pause" && action !== "resume") {
      return new Response(JSON.stringify({ error: "action must be pause or resume" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subscription_id && !student_id) {
      return new Response(JSON.stringify({ error: "subscription_id or student_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = admin.from("subscriptions").select("*");
    if (subscription_id) query = query.eq("id", subscription_id);
    else query = query.eq("student_id", student_id!).eq("is_active", true).order("created_at", { ascending: false }).limit(1);
    const { data: subs, error: subErr } = await query;
    if (subErr) throw subErr;
    const sub = subs?.[0];
    if (!sub) {
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

    let stripeSub;
    if (action === "pause") {
      log("Pausing subscription", { id: sub.stripe_subscription_id });
      const pause: any = { behavior: "mark_uncollectible" };
      if (resumes_at) pause.resumes_at = Math.floor(new Date(resumes_at).getTime() / 1000);
      stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: pause,
      });
    } else {
      log("Resuming subscription", { id: sub.stripe_subscription_id });
      stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: "" as any,
      });
    }

    const paused = !!(stripeSub as any).pause_collection;
    await admin.from("subscriptions").update({
      status: stripeSub.status,
      paused_at: paused ? new Date().toISOString() : null,
      last_synced_at: new Date().toISOString(),
    }).eq("id", sub.id);

    return new Response(JSON.stringify({
      success: true,
      paused,
      status: stripeSub.status,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});