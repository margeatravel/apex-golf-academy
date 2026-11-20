import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getStoredTokens, revokeConnection } from "../_shared/googleCalendarDirect.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Sign in required" }, 401);

    // Sin fila guardada (o fila vieja que ya no sirve): nada que revocar.
    const stored = await getStoredTokens(user.id);
    if (!stored) return json({ ok: true, alreadyDisconnected: true });

    // Revoca en Google (best effort) y borra la fila guardada.
    await revokeConnection(user.id);
    return json({ ok: true });
  } catch (error) {
    console.error("google-calendar-disconnect failed:", error);
    return json({ error: error instanceof Error ? error.message : "Disconnect failed" }, 500);
  }
});
