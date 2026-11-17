import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://apexgolf.com.mx";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "SC Golf Academy <admin@apexgolf.com.mx>";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => alphabet[v % alphabet.length]).join("");
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml(inviterName: string, inviteUrl: string, isCoach: boolean) {
  const intro = isCoach
    ? `<strong>${escapeHtml(inviterName)}</strong>, your Coach at SC Golf Academy, has invited you to join the app.`
    : `<strong>${escapeHtml(inviterName)}</strong> invited you to join SC Golf Academy.`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#0e2410;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#4a7c59;font-weight:700;">SC Golf Academy</td></tr>
        <tr><td style="padding-top:8px;font-size:24px;font-weight:700;color:#0e2410;">You've been invited ⛳</td></tr>
        <tr><td style="padding-top:16px;font-size:15px;line-height:1.5;color:#3a3a3a;">${intro}</td></tr>
        <tr><td style="padding-top:8px;font-size:14px;line-height:1.5;color:#5a5a5a;">Track your progress, book lessons, watch swing videos, and access pro tips — all in one place.</td></tr>
        <tr><td align="center" style="padding:28px 0;">
          <a href="${inviteUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Accept invitation →</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#888;">Or copy this link into your browser:</td></tr>
        <tr><td style="font-size:12px;color:#4a7c59;word-break:break-all;padding-top:4px;">${inviteUrl}</td></tr>
        <tr><td style="padding-top:24px;font-size:11px;color:#999;">This invitation expires in 30 days. If you weren't expecting this email, you can safely ignore it.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("create-invite auth failed:", claimsErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }
    const user = {
      id: claimsData.claims.sub as string,
      email: claimsData.claims.email as string | undefined,
    };

    const body = await req.json().catch(() => ({}));
    const recipientEmail: string | null = (body?.recipient_email ?? "").trim().toLowerCase() || null;
    const recipientName: string | null = (body?.recipient_name ?? "").trim() || null;
    // 'coach_code'   = reusable code that links new students to this coach.
    // 'access_link'  = reusable, admin-issued code. Optionally assigns new
    //                  students to a *specific* coach (assign_coach_id) or
    //                  to nobody. Lets the owner give app access to students
    //                  who train with another coach (or no one).
    // 'friend_invite' (default) = one-shot referral, just records `referred_by`.
    let purpose: "coach_code" | "friend_invite" | "access_link" =
      body?.purpose === "coach_code"
        ? "coach_code"
        : body?.purpose === "access_link"
        ? "access_link"
        : "friend_invite";
    const rawAssignCoachId: string | null =
      typeof body?.assign_coach_id === "string" && body.assign_coach_id.trim()
        ? body.assign_coach_id.trim()
        : null;
    const sendEmail: boolean = !!recipientEmail;

    // Eligibility check via RPC
    const { data: eligible, error: eligErr } = await supabase.rpc("can_create_invite", { _user_id: user.id });
    if (eligErr) return json({ error: eligErr.message }, 400);
    if (!eligible) return json({ error: "Only coach or subscribed members can send invites." }, 403);

    // Determine if inviter is coach — both the platform owner (admin) and
    // partner coaches (coach role) each get their own stable, personal
    // coach code via the same reuse-or-create path below.
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "coach"])
      .maybeSingle();
    const inviterIsCoach = !!roleRow;

    // A coach always has ONE stable, reusable code — whether they share it
    // from the coach menu or the generic "Invite a friend" modal. So when a
    // coach generates a code (no specific email recipient), always return
    // their reusable coach code instead of minting a one-shot friend invite.
    // EXCEPTION: if the caller explicitly asked for an `access_link`, do NOT
    // collapse it back into the coach code — those are two different codes
    // that grant two different kinds of access.
    if (inviterIsCoach && !recipientEmail && purpose !== "access_link") {
      purpose = "coach_code";
    }

    // Coach codes are reusable and can only be requested by an admin/coach.
    if (purpose === "coach_code" && !inviterIsCoach) {
      return json({ error: "Only coaches can mint a coach code." }, 403);
    }

    // Access links are admin-only. They're reusable signup-gating links that
    // optionally pre-assign students to a chosen coach (which can be a
    // different person than the admin generating the link).
    let assignedCoachId: string | null = null;
    if (purpose === "access_link") {
      if (!inviterIsCoach) {
        return json({ error: "Only admins can create access links." }, 403);
      }
      if (rawAssignCoachId) {
        const { data: targetRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", rawAssignCoachId)
          .in("role", ["admin", "coach"])
          .maybeSingle();
        if (!targetRole) {
          return json({ error: "Selected coach is not a valid coach account." }, 400);
        }
        assignedCoachId = rawAssignCoachId;
      }
    }

    // Access/member codes are also stable per owner + assignment target. This
    // prevents the member code from being regenerated or confused with the
    // personal coach code on repeat opens.
    if (purpose === "access_link") {
      let existingAccessQuery = supabase
        .from("student_invites")
        .select("*")
        .eq("inviter_id", user.id)
        .eq("is_reusable", true)
        .eq("inviter_is_coach", false);
      existingAccessQuery = assignedCoachId
        ? existingAccessQuery.eq("assigned_coach_id", assignedCoachId)
        : existingAccessQuery.is("assigned_coach_id", null);
      const { data: existingAccessInvite } = await existingAccessQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingAccessInvite) {
        if (existingAccessInvite.status !== "pending") {
          await supabase
            .from("student_invites")
            .update({ status: "pending", expires_at: "infinity" })
            .eq("id", existingAccessInvite.id);
          existingAccessInvite.status = "pending";
        }
        return json({
          success: true,
          invite: existingAccessInvite,
          invite_url: `${APP_URL}/auth?ref=${existingAccessInvite.code}`,
          code: existingAccessInvite.code,
        });
      }
    }

    // For coach codes, reuse the existing reusable code if one already exists
    // so the same coach has a single stable code to share.
    if (purpose === "coach_code") {
      const { data: existingCoachInvite } = await supabase
        .from("student_invites")
        .select("*")
        .eq("inviter_id", user.id)
        .eq("is_reusable", true)
        // Scope strictly to the personal coach code so we never return an
        // access link (which is also reusable but assigns a different coach
        // — or no coach — and gives different access).
        .eq("inviter_is_coach", true)
        .is("assigned_coach_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingCoachInvite) {
        // Coach codes are permanent — make sure status/expiry stay valid
        // even if the row was previously marked expired by an old policy.
        if (
          existingCoachInvite.status !== "pending" ||
          new Date(existingCoachInvite.expires_at).getTime() < Date.now() + 365 * 24 * 60 * 60 * 1000
        ) {
          await supabase
            .from("student_invites")
            .update({ status: "pending", expires_at: "infinity" })
            .eq("id", existingCoachInvite.id);
          existingCoachInvite.status = "pending";
        }
        return json({
          success: true,
          invite: existingCoachInvite,
          code: existingCoachInvite.code,
        });
      }
    }

    // Generate unique code
    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode(8);
      const { data: existing } = await supabase
        .from("student_invites")
        .select("id")
        .eq("code", candidate)
        .maybeSingle();
      if (!existing) { code = candidate; break; }
    }
    if (!code) return json({ error: "Could not generate invite code" }, 500);

    const { data: invite, error: insertErr } = await supabase
      .from("student_invites")
      .insert({
        code,
        inviter_id: user.id,
        // Keep code types explicit: only personal coach codes set this true.
        // Access/member codes must stay false even when they optionally assign
        // to a coach, because they grant different access from the coach code.
        inviter_is_coach: purpose === "coach_code" ? true : false,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        is_reusable: purpose === "coach_code" || purpose === "access_link",
        assigned_coach_id: assignedCoachId,
        // Coach codes & access links never expire.
        ...(purpose === "coach_code" || purpose === "access_link"
          ? { expires_at: "infinity" }
          : {}),
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 400);

    // Use the `?ref=` param that Auth.tsx actually reads.
    const inviteUrl = `${APP_URL}/auth?ref=${code}`;

    // Send email if recipient provided
    if (sendEmail && RESEND_API_KEY) {
      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const inviterName = inviterProfile?.full_name || inviterProfile?.email || "A friend";

      const html = buildEmailHtml(inviterName, inviteUrl, inviterIsCoach);
      const subject = inviterIsCoach
        ? `Your coach ${inviterName} invited you to SC Golf Academy`
        : `${inviterName} invited you to SC Golf Academy`;

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: [recipientEmail],
            subject,
            html,
            reply_to: "admin@apexgolf.com.mx",
            bcc: ["admin@apexgolf.com.mx"],
          }),
        });
        if (!r.ok) {
          const errText = await r.text();
          console.error("Resend error", r.status, errText);
        }
      } catch (e) {
        console.error("Email send failed", e);
      }
    }

    return json({ success: true, invite, invite_url: inviteUrl, code });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});