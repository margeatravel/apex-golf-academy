import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[MANAGE-MY-SUB] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Stripe 2025+ moved current_period_end onto the subscription item. */
function periodEndUnix(sub: any): number | null {
  return sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end ?? null;
}

/**
 * Student self-service subscription actions (cancel / reactivate).
 * The subscription is always resolved from the caller's JWT — client-sent ids are ignored.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

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
    if (claimsErr || !claimsRes?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const uid = claimsRes.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = (body as any)?.action as "cancel" | "reactivate";

    if (!["cancel", "reactivate"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const { data: subs, error: subErr } = await admin
      .from("subscriptions")
      .select("*")
      .eq("student_id", uid)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (subErr) throw subErr;
    const sub = subs?.[0];
    if (!sub) return json({ error: "Subscription not found" }, 404);
    if (!sub.stripe_subscription_id) return json({ error: "Subscription has no Stripe ID" }, 400);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let updated: any;
    const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };

    if (action === "cancel") {
      updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      patch.cancel_at_period_end = !!updated.cancel_at_period_end;
      patch.cancel_at = updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null;
      log("Cancel scheduled", { cancel_at: patch.cancel_at });
    } else {
      updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
        cancel_at: "" as any,
      });
      patch.cancel_at_period_end = false;
      patch.cancel_at = null;
      log("Reactivated");
    }

    const endUnix = periodEndUnix(updated);
    patch.status = updated.status;
    if (endUnix) patch.current_period_end = new Date(endUnix * 1000).toISOString();

    await admin.from("subscriptions").update(patch).eq("id", sub.id);

    return json({
      success: true,
      status: updated.status,
      cancel_at: patch.cancel_at ?? sub.cancel_at ?? null,
      current_period_end: patch.current_period_end ?? sub.current_period_end ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return json({ error: msg }, 500);
  }
});
