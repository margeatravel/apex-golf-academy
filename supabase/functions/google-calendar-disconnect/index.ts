import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { disconnectAppUser } from "../_shared/appUserConnector.ts";
import { deleteConnectionKeyForUser, getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

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

    const connectionAPIKey = await getConnectionKeyForUser(user.id, CONNECTOR_ID);
    if (!connectionAPIKey) return json({ ok: true, alreadyDisconnected: true });

    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
    });
    await deleteConnectionKeyForUser(user.id, CONNECTOR_ID);
    return json({ ok: true });
  } catch (error) {
    console.error("google-calendar-disconnect failed:", error);
    return json({ error: error instanceof Error ? error.message : "Disconnect failed" }, 500);
  }
});
