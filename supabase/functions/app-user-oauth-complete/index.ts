import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { exchangeCode, saveTokens } from "../_shared/googleCalendarDirect.ts";

// OAuth 2.0 directo contra Google (sin Connector Gateway de Lovable).
// Canjea el `code` del redirect por el token set y lo guarda cifrado
// (AES-GCM) en app_user_connections vía saveTokens. El `origin` opcional
// reconstruye la misma redirect_uri que usó app-user-oauth-start; si no
// viene, se usa la URL de producción.

const PRODUCTION_ORIGIN = "https://www.margeagolfacademy.com";

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
    if (!user) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, origin } = await req.json();
    if (typeof code !== "string" || !code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const redirectOrigin = typeof origin === "string" && /^https?:\/\//.test(origin)
      ? origin
      : PRODUCTION_ORIGIN;
    const redirectUri = new URL("/oauth/google-calendar/return", redirectOrigin).toString();

    const tokens = await exchangeCode(code, redirectUri);
    await saveTokens(user.id, tokens);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("app-user-oauth-complete failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "OAuth completion failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
