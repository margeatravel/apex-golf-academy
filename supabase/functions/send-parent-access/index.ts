import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getStudentEmailSettings, shouldSend, bccList } from "../_shared/student-email-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "Margea Golf Academy <admin@margeagolfacademy.com>";
const APP_URL = "https://margeagolfacademy.com";
const RESEND_API_URL = "https://api.resend.com/emails";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function emailValid(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function buildEmailHtml(opts: {
  studentName: string;
  inviterName: string;
  actionLink: string;
  relLabel: string;
  relLower: string;
}): string {
  const { studentName, inviterName, actionLink, relLabel, relLower } = opts;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0d1f18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1f18;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(255,255,255,0.04);border:1px solid rgba(240,192,64,0.2);border-radius:16px;padding:32px;">
        <tr><td align="center" style="padding-bottom:20px;">
          <div style="width:56px;height:56px;border-radius:14px;background:#0d1f18;border:2px solid #F0C040;color:#F0C040;font-weight:800;font-size:28px;line-height:52px;text-align:center;">A</div>
        </td></tr>
        <tr><td style="color:#F4ECD8;font-size:22px;font-weight:700;text-align:center;padding-bottom:8px;">
          Eres ${relLabel} de ${studentName} en Margea Golf Academy
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.75);font-size:15px;line-height:1.5;text-align:center;padding-bottom:24px;">
          ${inviterName} te agregó como <strong style="color:#F4ECD8;">${relLower}</strong> de <strong style="color:#F4ECD8;">${studentName}</strong> en Margea Golf Academy.
          Podrás ver sus videos, lecciones, paquetes y avance — y reservar o pagar a su nombre.
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${actionLink}" style="display:inline-block;background:#F0C040;color:#0d1f18;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Entrar a la cuenta</a>
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.5);font-size:12px;line-height:1.5;text-align:center;">
          Este link te inicia sesión automáticamente. No lo compartas — quien lo abra entrará a la cuenta.
          Si no esperabas este correo, puedes ignorarlo.
        </td></tr>
      </table>
      <div style="color:rgba(244,236,216,0.35);font-size:11px;text-align:center;padding-top:16px;">Margea Golf Academy · ${APP_URL}</div>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const anonClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const studentId = String(body.studentId || "").trim();
    const parentEmail = String(body.parentEmail || "").trim().toLowerCase();
    const redirectOrigin = String(body.redirectOrigin || APP_URL).replace(/\/$/, "");
    const rawRel = String(body.relationship || "").trim().toLowerCase();
    const relationship: "papa" | "mama" | "tutor" | null =
      rawRel === "papa" || rawRel === "mama" || rawRel === "tutor" ? rawRel : null;
    const relLabel =
      relationship === "papa" ? "Papá"
      : relationship === "mama" ? "Mamá"
      : relationship === "tutor" ? "Tutor"
      : "Familiar";
    const relLower =
      relationship === "papa" ? "papá"
      : relationship === "mama" ? "mamá"
      : relationship === "tutor" ? "tutor"
      : "familiar";

    if (!studentId || !parentEmail) {
      return json({ error: "studentId and parentEmail required" }, 400);
    }
    if (!emailValid(parentEmail)) {
      return json({ error: "Invalid parent email" }, 400);
    }

    // Authorization: caller is admin OR caller is the student
    const service = createClient(SUPABASE_URL, SERVICE);
    const _settings = await getStudentEmailSettings(service);
    if (!shouldSend(_settings, "parent_access")) {
      return json({ ok: false, skipped: "disabled" }, 200);
    }
    const { data: roleRow } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin && caller.id !== studentId) {
      return json({ error: "Not authorized" }, 403);
    }

    // Look up student & inviter
    const { data: student } = await service
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", studentId)
      .maybeSingle();
    if (!student?.email) {
      return json({ error: "Student has no email on file" }, 400);
    }

    const { data: inviterProfile } = await service
      .from("profiles")
      .select("full_name, email")
      .eq("id", caller.id)
      .maybeSingle();
    const inviterName =
      inviterProfile?.full_name || inviterProfile?.email || "Tu coach";
    const studentName = student.full_name || student.email;

    // Insert grant first so we can include id in redirect
    const { data: grant, error: grantErr } = await service
      .from("parent_access_grants")
      .insert({
        student_id: studentId,
        parent_email: parentEmail,
        created_by: caller.id,
        relationship,
      })
      .select("id")
      .single();
    if (grantErr || !grant) {
      return json({ error: grantErr?.message || "Could not create grant" }, 500);
    }

    // Generate magic link that signs in as the STUDENT user
    const redirectTo = `${redirectOrigin}/auth/callback?parent=1&grant=${grant.id}`;
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: student.email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: linkErr?.message || "Could not generate link" }, 500);
    }
    const actionLink = linkData.properties.action_link;

    // Send email via Resend
    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not configured" }, 500);
    }
    const html = buildEmailHtml({ studentName, inviterName, actionLink, relLabel, relLower });
    const subject = `Acceso de ${relLabel} a la cuenta de ${studentName} en Margea Golf Academy`;

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [parentEmail],
        bcc: bccList(_settings, "parent_access"),
        subject,
        html,
      }),
    });
    const resendJson = await resendRes.json().catch(() => ({}));

    // Best-effort send log
    try {
      await service.from("email_send_log").insert({
        template_name: "parent_access_invite",
        recipient_email: parentEmail,
        status: resendRes.ok ? "sent" : "failed",
        message_id: resendJson?.id ?? null,
        error_message: resendRes.ok ? null : JSON.stringify(resendJson).slice(0, 500),
        metadata: { student_id: studentId, grant_id: grant.id, inviter_id: caller.id },
      });
    } catch (_) {}

    if (!resendRes.ok) {
      return json({ error: "Email send failed", detail: resendJson }, 502);
    }

    return json({ ok: true, grant_id: grant.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});