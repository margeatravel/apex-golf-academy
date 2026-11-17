import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const SENDER_DOMAIN = "apexgolf.com.mx";
const FROM_ADDRESS = "SC Golf Academy <admin@apexgolf.com.mx>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: must be an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing auth" }, 401);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    if (!RESEND_API_KEY) {
      return json({
        configured: false,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        error: "RESEND_API_KEY is not configured",
      });
    }

    // List domains and find the one we use
    const listRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const listJson = await listRes.json();
    if (!listRes.ok) {
      return json({
        configured: true,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        error: listJson?.message || "Failed to list Resend domains",
      });
    }

    const domains: any[] = Array.isArray(listJson?.data)
      ? listJson.data
      : Array.isArray(listJson)
      ? listJson
      : [];

    const match = domains.find(
      (d) => (d?.name ?? "").toLowerCase() === SENDER_DOMAIN.toLowerCase(),
    );

    if (!match) {
      return json({
        configured: true,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        found: false,
        domains: domains.map((d) => ({ name: d.name, status: d.status })),
      });
    }

    // Fetch full record (records come back here)
    const detailRes = await fetch(
      `https://api.resend.com/domains/${match.id}`,
      { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } },
    );
    const detail = await detailRes.json();

    return json({
      configured: true,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      found: true,
      domain: {
        id: detail?.id ?? match.id,
        name: detail?.name ?? match.name,
        status: detail?.status ?? match.status,
        region: detail?.region ?? match.region,
        created_at: detail?.created_at ?? match.created_at,
        records: detail?.records ?? [],
      },
    });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}