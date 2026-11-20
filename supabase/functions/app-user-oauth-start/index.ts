import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildAuthUrl } from "../_shared/googleCalendarDirect.ts";

// OAuth 2.0 directo contra Google (sin Connector Gateway de Lovable).
// Construye la URL de autorización y devuelve también el `state` generado,
// para que el frontend lo guarde en sessionStorage y la página de retorno
// lo verifique (protección CSRF). GoogleCalendarConnect ignora el campo
// `state` extra; la verificación vive en GoogleCalendarReturn.tsx.

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

    if (!Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_OAUTH_CLIENT_ID is not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { origin } = await req.json();
    if (typeof origin !== "string" || !/^https?:\/\//.test(origin)) {
      return new Response(JSON.stringify({ error: "Invalid origin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const returnUrl = new URL("/oauth/google-calendar/return", origin).toString();

    const state = crypto.randomUUID();
    const authorizationUrl = buildAuthUrl(returnUrl, state);
    return new Response(JSON.stringify({ authorizationUrl, state }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("app-user-oauth-start failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "OAuth start failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
