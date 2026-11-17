import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStudentEmailSettings, bccList } from "../_shared/student-email-settings.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "SC Golf Academy <admin@apexgolf.com.mx>";
const REPLY_TO = "admin@apexgolf.com.mx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  student_id?: string;
  email: string;
  name?: string;
  time?: string; // "HH:MM"
  date?: string; // "YYYY-MM-DD" (per-recipient, for multi-day blocks)
}


function fmtDateEs(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00-05:00`).toLocaleDateString("es-MX", {
    timeZone: "America/Cancun",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtTime12(t?: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh || "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm ?? "00"} ${ampm}`;
}

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface BrandedEmailOpts {
  preheader?: string;
  icon: string;
  title: string;
  subtitle?: string;
  greeting?: string;
  intro?: string;
  detailsHtml?: string;
  bodyHtml?: string;
  ctaText?: string;
  ctaHref?: string;
  closingHtml?: string;
}

function brandedEmail(opts: BrandedEmailOpts): string {
  const {
    preheader = "", icon, title, subtitle = "", greeting = "", intro = "",
    detailsHtml = "", bodyHtml = "", ctaText, ctaHref, closingHtml = "",
  } = opts;

  const cta = ctaText && ctaHref
    ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;">
      <tr><td align="center">
        <a href="${ctaHref}" style="display:inline-block;background:#EF9F27;color:#0e2410;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:.2px;font-family:Arial,Helvetica,sans-serif;">
          ${escapeHtml(ctaText)} →
        </a>
      </td></tr>
    </table>`
    : "";

  const detailsCard = detailsHtml
    ? `<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(239,159,39,0.18);border-radius:12px;padding:22px 22px;margin:22px 0;">${detailsHtml}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>SC Golf Academy</title>
</head>
<body style="margin:0;padding:0;background-color:#0e2410;font-family:Arial,Helvetica,sans-serif;color:#f5f0e8;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0e2410;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0e2410;padding:32px 16px;">
  <tr><td align="center">
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
        ${bodyHtml}
        ${cta}
        ${closingHtml ? `<p style="margin:18px 0 0;color:rgba(245,240,232,0.85);font-size:14px;line-height:1.7;">${closingHtml}</p>` : ""}
      </td></tr>
      <tr><td style="background:#0d2410;padding:22px 32px;text-align:center;border-top:1px solid rgba(239,159,39,0.18);">
        <p style="margin:0;color:rgba(245,240,232,0.55);font-size:12px;line-height:1.6;">
          SC Golf Academy · <a href="mailto:admin@apexgolf.com.mx" style="color:#EF9F27;text-decoration:none;">admin@apexgolf.com.mx</a>
        </p>
        <p style="margin:6px 0 0;color:rgba(245,240,232,0.35);font-size:11px;">© ${new Date().getFullYear()} SC Golf Academy</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const cardRow = (label: string, value: string) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
    <tr>
      <td style="color:rgba(245,240,232,0.55);font-size:12px;text-transform:uppercase;letter-spacing:.6px;padding:4px 0;">${escapeHtml(label)}</td>
      <td align="right" style="color:#f5f0e8;font-size:14px;font-weight:600;padding:4px 0;">${value}</td>
    </tr>
  </table>`;

function buildHtml(name: string, dateLabel: string, timeLabel: string, note?: string) {
  const noteHtml = note
    ? `<div style="margin:18px 0;padding:14px 16px;background:rgba(239,159,39,0.08);border-left:3px solid #EF9F27;border-radius:8px;">
        <p style="margin:0 0 4px;color:#EF9F27;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">Nota de tu Coach</p>
        <p style="margin:0;color:#f5f0e8;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(note)}</p>
      </div>`
    : "";
  return brandedEmail({
    preheader: `Tu clase del ${dateLabel} queda cancelada`,
    icon: "📅",
    title: "Cambio en tu clase",
    subtitle: "Tu Coach tuvo que cancelar las clases de ese día",
    greeting: `Hola ${name},`,
    intro: "Te informamos que la siguiente clase queda cancelada porque tu Coach tuvo que cancelar las clases de ese día.",
    detailsHtml:
      cardRow("Fecha", escapeHtml(dateLabel)) +
      (timeLabel ? cardRow("Hora", escapeHtml(timeLabel)) : "") +
      cardRow("Coach", "Santi"),
    bodyHtml: noteHtml,
    ctaText: "Ver mis clases",
    ctaHref: "https://apexgolf.com.mx/lessons",
    closingHtml: "Por favor contacta a tu Coach para reagendar tu clase. Gracias por tu comprensión.",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const { blockDate, recipients, note } = (await req.json()) as {
      blockDate?: string;
      recipients?: Recipient[];
      note?: string;
    };

    if (!blockDate || !/^\d{4}-\d{2}-\d{2}$/.test(blockDate)) {
      return new Response(JSON.stringify({ error: "blockDate (YYYY-MM-DD) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const list = (recipients ?? []).filter((r) => r && ((typeof r.email === "string" && r.email.includes("@")) || typeof r.student_id === "string"));
    if (list.length === 0) {
      return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const settings = await getStudentEmailSettings(admin);
    const bcc = bccList(settings, "blocked_date" as any);

    const cleanNote = typeof note === "string" ? note.trim().slice(0, 1000) : "";

    let sent = 0;
    const failures: string[] = [];

    // Parents (family_links) also receive the notice for their children.
    const studentIds = [...new Set(list.map((r) => r.student_id).filter(Boolean))] as string[];
    const parentsByChild = new Map<string, string[]>();
    if (studentIds.length) {
      const { data: links } = await admin.from("family_links").select("parent_user_id, child_user_id").in("child_user_id", studentIds);
      const pids = [...new Set((links ?? []).map((l: any) => l.parent_user_id))];
      const { data: parents } = pids.length ? await admin.from("profiles").select("id, email").in("id", pids) : { data: [] };
      const emailById = new Map((parents ?? []).map((p: any) => [p.id, p.email]));
      for (const l of links ?? []) {
        const e = emailById.get((l as any).parent_user_id);
        if (!e || String(e).endsWith("@placeholder.sc")) continue;
        const arr = parentsByChild.get((l as any).child_user_id) ?? [];
        if (!arr.includes(e)) arr.push(e);
        parentsByChild.set((l as any).child_user_id, arr);
      }
    }

    for (const r of list) {
      const to = [r.email, ...(r.student_id ? parentsByChild.get(r.student_id) ?? [] : [])]
        .filter((e, i, a) => typeof e === "string" && e.includes("@") && !e.endsWith("@placeholder.sc") && a.indexOf(e) === i);
      if (to.length === 0) continue;
      const rDate = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : blockDate;
      const dateLabel = fmtDateEs(rDate);
      const subject = `Cambio en tu clase — ${dateLabel}`;
      const html = buildHtml(r.name?.trim() || "alumno", dateLabel, fmtTime12(r.time), cleanNote || undefined);
      try {
        const response = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, bcc, subject, html }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "Resend error");
        sent++;
        await admin.from("email_send_log").insert({
          message_id: data?.id || crypto.randomUUID(),
          template_name: "blocked_date_notice",
          recipient_email: to.join(", "),
          status: "sent",
          metadata: { subject, blockDate, time: r.time ?? null },
        });
      } catch (e) {
        console.error("notify-blocked-date send failed", r.email, e);
        failures.push(r.email);
        await admin.from("email_send_log").insert({
          message_id: crypto.randomUUID(),
          template_name: "blocked_date_notice",
          recipient_email: r.email,
          status: "failed",
          error_message: (e as Error)?.message ?? "unknown",
          metadata: { subject, blockDate },
        });
      }
    }

    return new Response(JSON.stringify({ sent, failed: failures.length, failures }), {
      status: failures.length && sent === 0 ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-blocked-date error", e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
