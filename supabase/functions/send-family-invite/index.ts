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

type Lang = "es" | "en";

// Convention (same as accept-family-request): the sender picks the relationship
// of the INVITED person relative to the sender.
function relLabel(rel: string, lang: Lang): string {
  const map: Record<string, { es: string; en: string }> = {
    papa: { es: "papá", en: "father" },
    mama: { es: "mamá", en: "mother" },
    hijo: { es: "hijo", en: "child" },
    pareja: { es: "pareja", en: "partner" },
  };
  return (map[rel] ?? { es: "familiar", en: "family member" })[lang];
}

function buildEmail(opts: {
  inviterName: string;
  inviteeName: string;
  rel: string;
  link: string;
  lang: Lang;
}) {
  const { inviterName, inviteeName, rel, link, lang } = opts;
  const r = relLabel(rel, lang);
  const subject =
    lang === "en"
      ? `${inviterName} invited you to link as family on Margea Golf Academy`
      : `${inviterName} te invitó a vincularte como familia en Margea Golf Academy`;
  const title =
    lang === "en" ? "You have a family invitation" : "Tienes una invitación familiar";
  const body =
    lang === "en"
      ? `${inviterName} invited you to link your Margea Golf Academy account as their <strong style="color:#F4ECD8;">${r}</strong>. Open the app to accept or decline.`
      : `${inviterName} te invitó a vincular tu cuenta de Margea Golf Academy como su <strong style="color:#F4ECD8;">${r}</strong>. Entra a la app para aceptar o rechazar.`;
  const cta = lang === "en" ? "View invitation" : "Ver invitación";
  const foot =
    lang === "en"
      ? "Nothing is shared until you accept. If you weren't expecting this email, you can ignore it."
      : "No se comparte nada hasta que aceptes. Si no esperabas este correo, puedes ignorarlo.";
  const hi = lang === "en" ? `Hi ${inviteeName},` : `Hola ${inviteeName},`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0d1f18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1f18;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(255,255,255,0.04);border:1px solid rgba(240,192,64,0.2);border-radius:16px;padding:32px;">
        <tr><td align="center" style="padding-bottom:20px;">
          <div style="width:56px;height:56px;border-radius:14px;background:#0d1f18;border:2px solid #F0C040;color:#F0C040;font-weight:800;font-size:28px;line-height:52px;text-align:center;">A</div>
        </td></tr>
        <tr><td style="color:#F4ECD8;font-size:22px;font-weight:700;text-align:center;padding-bottom:8px;">${title}</td></tr>
        <tr><td style="color:rgba(244,236,216,0.75);font-size:15px;line-height:1.5;text-align:center;padding-bottom:8px;">${hi}</td></tr>
        <tr><td style="color:rgba(244,236,216,0.75);font-size:15px;line-height:1.5;text-align:center;padding-bottom:24px;">${body}</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${link}" style="display:inline-block;background:#F0C040;color:#0d1f18;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">${cta}</a>
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.5);font-size:12px;line-height:1.5;text-align:center;">${foot}</td></tr>
      </table>
      <div style="color:rgba(244,236,216,0.35);font-size:11px;text-align:center;padding-top:16px;">Margea Golf Academy · ${APP_URL}</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
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
    const requestId = String(body.requestId || "").trim();
    const redirectOrigin = String(body.redirectOrigin || APP_URL).replace(/\/$/, "");
    if (!requestId) return json({ error: "requestId required" }, 400);

    const service = createClient(SUPABASE_URL, SERVICE);

    const settings = await getStudentEmailSettings(service);
    if (!shouldSend(settings, "family_invite")) {
      return json({ ok: false, skipped: "disabled" }, 200);
    }

    const { data: reqRow } = await service
      .from("family_link_requests")
      .select("id, from_user_id, to_user_id, relationship, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) return json({ error: "Request not found" }, 404);
    if (reqRow.from_user_id !== caller.id) return json({ error: "Not authorized" }, 403);
    if (reqRow.status !== "pending") return json({ ok: false, skipped: "not_pending" }, 200);

    const { data: people } = await service
      .from("profiles")
      .select("id, email, full_name")
      .in("id", [reqRow.from_user_id, reqRow.to_user_id]);
    const inviter = people?.find((p: any) => p.id === reqRow.from_user_id);
    const invitee = people?.find((p: any) => p.id === reqRow.to_user_id);
    if (!invitee?.email) return json({ ok: false, skipped: "no_email" }, 200);

    const lang = settings.language;
    const { subject, html } = buildEmail({
      inviterName: inviter?.full_name || inviter?.email || "Margea Golf Academy",
      inviteeName: invitee.full_name || invitee.email,
      rel: reqRow.relationship,
      link: `${redirectOrigin}/family`,
      lang,
    });

    if (!RESEND_API_KEY) return json({ ok: false, skipped: "no_api_key" }, 200);

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [invitee.email], bcc: bccList(settings, "family_invite"), subject, html }),
    });
    const resendJson = await resendRes.json().catch(() => ({}));

    try {
      await service.from("email_send_log").insert({
        template_name: "family_invite",
        recipient_email: invitee.email,
        status: resendRes.ok ? "sent" : "failed",
        message_id: resendJson?.id ?? null,
        error_message: resendRes.ok ? null : JSON.stringify(resendJson).slice(0, 500),
        metadata: { request_id: requestId, from_user_id: reqRow.from_user_id, to_user_id: reqRow.to_user_id },
      });
    } catch (_) { /* best effort */ }

    if (!resendRes.ok) return json({ ok: false, error: "send_failed" }, 200);
    return json({ ok: true, id: resendJson?.id ?? null });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 200);
  }
});
