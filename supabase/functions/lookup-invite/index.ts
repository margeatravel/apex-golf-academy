import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
    if (!code || code.length < 4 || code.length > 32) {
      return json({ valid: false, error: "Invalid code" }, 400);
    }

    // Use service role: this is a public read (no JWT) and we only return safe fields.
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite } = await service
      .from("student_invites")
      .select("id, status, expires_at, inviter_id, inviter_is_coach, is_reusable, assigned_coach_id")
      .eq("code", code)
      .maybeSingle();

    if (!invite) return json({ valid: false, reason: "not_found" });
    if (!invite.is_reusable && invite.status !== "pending") return json({ valid: false, reason: invite.status });
    if (new Date(invite.expires_at) < new Date()) return json({ valid: false, reason: "expired" });

    const assignedCoachId = (invite as any).assigned_coach_id as string | null;
    const coachProfileId = assignedCoachId || (invite.inviter_is_coach ? invite.inviter_id : null);
    const profileId = coachProfileId || invite.inviter_id;

    const { data: profile } = await service
      .from("profiles")
      .select("full_name, email")
      .eq("id", profileId)
      .maybeSingle();

    return json({
      valid: true,
      inviter_name: profile?.full_name || profile?.email?.split("@")[0] || "A friend",
      inviter_is_coach: !!coachProfileId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ valid: false, error: message }, 500);
  }
});