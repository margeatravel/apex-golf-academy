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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userRes } = await anon.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const code = (body?.code ?? "").trim().toUpperCase();
    if (!code) return json({ error: "Missing code" }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite } = await service
      .from("student_invites")
      .select("id, status, expires_at, inviter_id, inviter_is_coach, is_reusable, assigned_coach_id")
      .eq("code", code)
      .maybeSingle();

    if (!invite) return json({ error: "Invite not found" }, 404);
    // Reusable codes (coach codes) are valid even after they've been redeemed by others.
    if (!invite.is_reusable && invite.status !== "pending") {
      return json({ error: `Invite is ${invite.status}` }, 400);
    }
    if (new Date(invite.expires_at) < new Date()) {
      await service.from("student_invites").update({ status: "expired" }).eq("id", invite.id);
      return json({ error: "Invite expired" }, 400);
    }
    if (invite.inviter_id === user.id) {
      return json({ error: "You cannot accept your own invite", code: "self_invite" }, 400);
    }

    // Decide which coach (if any) to attach the new student to.
    //  1. Explicit `assigned_coach_id` (admin-issued access links) wins.
    //  2. Otherwise legacy `inviter_is_coach` codes assign to the inviter.
    //  3. Else no coach is assigned — student can use LinkCoachCard later.
    let assignedCoachId: string | null = null;
    const candidateCoachId: string | null =
      (invite as any).assigned_coach_id ||
      (invite.inviter_is_coach ? invite.inviter_id : null);
    if (candidateCoachId) {
      // Accept both the owner (admin) and partner coaches (coach role) as
      // valid assignable coaches. Previously only admin was accepted, which
      // silently dropped the assignment for coach-role invite codes.
      const { data: roleRow } = await service
        .from("user_roles")
        .select("role")
        .eq("user_id", candidateCoachId)
        .in("role", ["admin", "coach"])
        .maybeSingle();
      if (roleRow) assignedCoachId = candidateCoachId;
    }

    const profileUpdate: Record<string, unknown> = { referred_by: invite.inviter_id };
    if (assignedCoachId) profileUpdate.assigned_coach_id = assignedCoachId;

    const { error: profErr } = await service
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);
    if (profErr) return json({ error: profErr.message }, 400);

    if (invite.is_reusable) {
      // Audit-only: log the redemption, leave invite as `pending` for future students.
      // Use upsert with ignoreDuplicates so re-pasting the same code is idempotent.
      await service
        .from("invite_redemptions")
        .upsert(
          { invite_id: invite.id, accepted_by: user.id },
          { onConflict: "invite_id,accepted_by", ignoreDuplicates: true }
        );
    } else {
      await service
        .from("student_invites")
        .update({
          status: "accepted",
          accepted_by: user.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);
    }

    // Look up inviter name so the UI can confirm "Linked to Coach X".
    let inviterName: string | null = null;
    const { data: inviterProfile } = await service
      .from("profiles")
      .select("full_name, email")
      .eq("id", invite.inviter_id)
      .maybeSingle();
    if (inviterProfile) {
      inviterName = inviterProfile.full_name || inviterProfile.email?.split("@")[0] || null;
    }

    return json({
      success: true,
      assigned_coach_id: assignedCoachId,
      inviter_is_coach: invite.inviter_is_coach,
      inviter_name: inviterName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});