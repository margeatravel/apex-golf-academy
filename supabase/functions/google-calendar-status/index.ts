import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { appUserReconnectRequired, callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { GOOGLE_CALENDAR_SCOPES } from "../_shared/appUserScopes.ts";

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
    if (!connectionAPIKey) return json({ connected: false });

    // Read the user's primary calendar summary as a lightweight probe.
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/calendar/v3/users/me/calendarList?maxResults=10",
      requiredScopes: GOOGLE_CALENDAR_SCOPES,
    });
    if (await appUserReconnectRequired(res)) {
      return json({ connected: false, reconnectRequired: true });
    }
    if (!res.ok) {
      const body = await res.text();
      console.error(`Google Calendar probe failed [${res.status}]: ${body}`);
      return json({ error: "Provider request failed", status: res.status, details: body }, res.status);
    }
    const list = await res.json();
    const calendars = (list.items ?? []).map((c: { id?: string; summary?: string; primary?: boolean }) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
    }));
    const primary = calendars.find((c: { primary: boolean }) => c.primary);
    return json({ connected: true, calendarName: primary?.summary ?? calendars[0]?.summary ?? null });
  } catch (error) {
    console.error("google-calendar-status failed:", error);
    return json({ error: error instanceof Error ? error.message : "Status check failed" }, 500);
  }
});
