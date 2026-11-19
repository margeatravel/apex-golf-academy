import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStudentEmailSettings, shouldSend, bccList, t, shortDate } from "../_shared/student-email-settings.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const APP_URL = "https://margeagolfacademy.com";
const FROM = "SC Golf Academy <admin@margeagolfacademy.com>";
const REPLY_TO = "admin@margeagolfacademy.com";
const BCC_COACH = "Castilla.santi@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// shortDate now imported from shared helper

const cardRow = (label: string, value: string) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
    <tr>
      <td style="color:rgba(245,240,232,0.55);font-size:12px;text-transform:uppercase;letter-spacing:.6px;padding:4px 0;">${escapeHtml(label)}</td>
      <td align="right" style="color:#f5f0e8;font-size:14px;font-weight:600;padding:4px 0;">${escapeHtml(value)}</td>
    </tr>
  </table>`;

function brandedEmail(opts: {
  preheader?: string; icon: string; title: string; subtitle?: string;
  greeting?: string; intro?: string; detailsHtml?: string;
  ctaText?: string; ctaHref?: string; closingHtml?: string;
}): string {
  const { preheader = "", icon, title, subtitle = "", greeting = "", intro = "", detailsHtml = "", ctaText, ctaHref, closingHtml = "" } = opts;
  const cta = ctaText && ctaHref
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center"><a href="${ctaHref}" style="display:inline-block;background:#EF9F27;color:#0e2410;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:.2px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(ctaText)} →</a></td></tr></table>`
    : "";
  const detailsCard = detailsHtml
    ? `<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(239,159,39,0.18);border-radius:12px;padding:22px;margin:22px 0;">${detailsHtml}</div>`
    : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>SC Golf Academy</title></head>
<body style="margin:0;padding:0;background-color:#0e2410;font-family:Arial,Helvetica,sans-serif;color:#f5f0e8;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0e2410;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0e2410;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#1a2e1c;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
    <tr><td style="background:linear-gradient(135deg,#1a3a1c 0%,#0d2410 100%);padding:34px 32px;text-align:center;border-bottom:1px solid rgba(239,159,39,0.25);">
      <p style="margin:0;color:#EF9F27;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">SC Golf Academy</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-.3px;">⛳ Elevate Your Game</h1>
    </td></tr>
    <tr><td style="padding:36px 32px 28px;">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="font-size:44px;line-height:1;margin-bottom:8px;">${icon}</div>
        <h2 style="margin:0;color:#EF9F27;font-size:22px;font-weight:700;letter-spacing:-.2px;">${escapeHtml(title)}</h2>
        ${subtitle ? `<p style="margin:6px 0 0;color:rgba(245,240,232,0.65);font-size:14px;">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${greeting ? `<p style="margin:0 0 14px;color:#f5f0e8;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>` : ""}
      ${intro ? `<p style="margin:0 0 18px;color:#f5f0e8;font-size:15px;line-height:1.7;">${intro}</p>` : ""}
      ${detailsCard}
      ${cta}
      ${closingHtml ? `<p style="margin:18px 0 0;color:rgba(245,240,232,0.85);font-size:14px;line-height:1.7;">${closingHtml}</p>` : ""}
    </td></tr>
    <tr><td style="background:#0d2410;padding:22px 32px;text-align:center;border-top:1px solid rgba(239,159,39,0.18);">
      <p style="margin:0;color:rgba(245,240,232,0.55);font-size:12px;line-height:1.6;">SC Golf Academy · <a href="mailto:admin@margeagolfacademy.com" style="color:#EF9F27;text-decoration:none;">admin@margeagolfacademy.com</a></p>
      <p style="margin:6px 0 0;color:rgba(245,240,232,0.35);font-size:11px;">© ${new Date().getFullYear()} SC Golf Academy</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return new Response(JSON.stringify({ success: false, error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const packageId: string | undefined = body?.package_id;
  const force: boolean = !!body?.force;
  if (!packageId) {
    return new Response(JSON.stringify({ error: "package_id required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // Gate via student email settings (force overrides)
    const settings = await getStudentEmailSettings(admin);
    if (!force && !shouldSend(settings, "package_completed")) {
      return new Response(JSON.stringify({ success: true, skipped: "disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const lang = settings.language;

    // Idempotency: skip if already sent
    if (!force) {
      const { data: existing } = await admin
        .from("email_send_log")
        .select("id")
        .eq("template_name", "package_completed")
        .eq("status", "sent")
        .filter("metadata->>package_id", "eq", packageId)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Fetch package
    const { data: pkg, error: pkgErr } = await admin
      .from("class_packages")
      .select("id, user_id, package_size, classes_used, classes_remaining")
      .eq("id", packageId)
      .maybeSingle();
    if (pkgErr || !pkg) throw new Error(pkgErr?.message || "Package not found");

    // Fetch student profile
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", pkg.user_id)
      .maybeSingle();

    const recipients: string[] = [];
    if (profile?.email) recipients.push(profile.email);

    // Parent recipients
    const { data: links } = await admin
      .from("family_links")
      .select("parent_user_id")
      .eq("child_user_id", pkg.user_id);
    if (links && links.length > 0) {
      const parentIds = links.map((l: any) => l.parent_user_id);
      const { data: parents } = await admin
        .from("profiles")
        .select("email")
        .in("id", parentIds);
      for (const p of parents || []) {
        if (p.email && !recipients.includes(p.email)) recipients.push(p.email);
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "no_recipients" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch lessons of this package (first + last completed)
    const { data: lessons } = await admin
      .from("lessons")
      .select("id, lesson_start_at, lesson_date, lesson_time, status")
      .eq("package_id", packageId)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    const completed = (lessons || []).filter((l: any) => l.status === "completed");
    const list = completed.length > 0 ? completed : (lessons || []);

    const buildIso = (l: any) =>
      l.lesson_start_at || (l.lesson_date ? `${l.lesson_date}T${(l.lesson_time || "12:00:00").slice(0,8)}-05:00` : null);

    const firstIso = list.length > 0 ? buildIso(list[0]) : null;
    const lastIso = list.length > 0 ? buildIso(list[list.length - 1]) : null;

    const packageName = firstIso ? `${t(lang, "pkg_name_prefix")} ${shortDate(lang, firstIso)}` : t(lang, "your_package");
    const displayName = profile?.full_name ? profile.full_name.split(" ")[0] : "alumno";
    const totalClases = pkg.package_size ?? completed.length;

    const subject = t(lang, "subj_package_completed");
    const greeting = lang === "es" ? `Hola ${displayName},` : `Hi ${displayName},`;
    const introHtml = `${t(lang, "pkg_done_intro_pre")} <b>${escapeHtml(packageName)}</b>${t(lang, "pkg_done_intro_post")}`;
    const html = brandedEmail({
      preheader: lang === "es" ? `Completaste ${packageName}. ¡Gracias por entrenar con nosotros!` : `You completed ${packageName}. Thanks for training with us!`,
      icon: "🏆",
      title: t(lang, "pkg_done_title"),
      subtitle: packageName,
      greeting,
      intro: introHtml,
      detailsHtml:
        cardRow(t(lang, "pkg_done_pkg_label"), packageName) +
        cardRow(t(lang, "pkg_done_total"), String(totalClases)) +
        cardRow(t(lang, "pkg_done_first"), shortDate(lang, firstIso)) +
        cardRow(t(lang, "pkg_done_last"), shortDate(lang, lastIso)) +
        cardRow(t(lang, "coach"), t(lang, "santi")),
      ctaText: t(lang, "view_lessons"),
      ctaHref: `${APP_URL}/lessons`,
      closingHtml: t(lang, "pkg_done_close"),
    });

    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, reply_to: REPLY_TO, to: recipients, bcc: bccList(settings, "package_completed"), subject, html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message || "Resend send failed");

    try {
      await admin.from("email_send_log").insert({
        message_id: data?.id || crypto.randomUUID(),
        template_name: "package_completed",
        recipient_email: recipients.join(","),
        status: "sent",
        metadata: { subject, package_id: packageId, user_id: pkg.user_id, first_lesson_at: firstIso, last_lesson_at: lastIso },
      });
    } catch (_) { /* non-blocking */ }

    return new Response(JSON.stringify({ success: true, recipients, packageName }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-package-completed-email error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});