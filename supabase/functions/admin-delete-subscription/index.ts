import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
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
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { subscription_id, acknowledge_stripe_canceled } = body as {
      subscription_id?: string;
      acknowledge_stripe_canceled?: boolean;
    };
    if (!subscription_id) {
      return new Response(JSON.stringify({ error: "subscription_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sub, error: subErr } = await admin
      .from("subscriptions")
      .select("id, is_active, stripe_subscription_id, status")
      .eq("id", subscription_id)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) {
      return new Response(JSON.stringify({ error: "Subscription not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sub.is_active && sub.stripe_subscription_id && !acknowledge_stripe_canceled) {
      return new Response(JSON.stringify({
        error: "stripe_still_active",
        message: "This subscription appears active in our DB and has a Stripe ID. Cancel it in Stripe first, or pass acknowledge_stripe_canceled=true to delete the local row anyway.",
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: delErr } = await admin.from("subscriptions").delete().eq("id", subscription_id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});