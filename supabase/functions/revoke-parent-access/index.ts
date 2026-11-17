import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const grantId = String(body.grantId || "").trim();
    if (!grantId) return json({ error: "grantId required" }, 400);

    const service = createClient(SUPABASE_URL, SERVICE);
    const { data: grant } = await service
      .from("parent_access_grants")
      .select("id, student_id")
      .eq("id", grantId)
      .maybeSingle();
    if (!grant) return json({ error: "Grant not found" }, 404);

    const { data: roleRow } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin && caller.id !== grant.student_id) {
      return json({ error: "Not authorized" }, 403);
    }

    const { error } = await service
      .from("parent_access_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", grantId);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});