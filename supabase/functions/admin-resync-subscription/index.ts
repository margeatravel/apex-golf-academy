import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: any) =>
  console.log(`[ADMIN-RESYNC-SUB] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

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
    const { subscription_id, subscription_ids } = body as {
      subscription_id?: string;
      subscription_ids?: string[];
    };
    const ids = subscription_ids?.length
      ? subscription_ids
      : subscription_id ? [subscription_id] : [];
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: "subscription_id(s) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: subErr } = await admin
      .from("subscriptions")
      .select("id, stripe_subscription_id, student_id")
      .in("id", ids);
    if (subErr) throw subErr;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: any[] = [];

    for (const sub of subs || []) {
      if (!sub.stripe_subscription_id) {
        results.push({ id: sub.id, skipped: "no_stripe_id" });
        continue;
      }
      try {
        const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const item: any = s.items?.data?.[0];
        const periodEnd = item?.current_period_end ?? (s as any).current_period_end ?? null;
        const periodStart = item?.current_period_start ?? (s as any).current_period_start ?? null;
        const paused = !!(s as any).pause_collection;
        const updates: Record<string, any> = {
          status: s.status,
          cancel_at_period_end: s.cancel_at_period_end ?? false,
          canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          paused_at: paused ? new Date().toISOString() : null,
          is_active: s.status === "active" || s.status === "trialing",
          last_synced_at: new Date().toISOString(),
        };
        await admin.from("subscriptions").update(updates).eq("id", sub.id);
        results.push({ id: sub.id, ok: true, status: s.status });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log("resync failed", { id: sub.id, msg });
        // If Stripe returns "No such subscription", reflect that locally.
        if (msg.toLowerCase().includes("no such subscription")) {
          await admin.from("subscriptions").update({
            status: "canceled",
            is_active: false,
            last_synced_at: new Date().toISOString(),
          }).eq("id", sub.id);
        }
        results.push({ id: sub.id, error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});