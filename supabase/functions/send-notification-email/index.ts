import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  getStudentEmailSettings,
  shouldSend,
  bccList,
  t,
  formatLessonType,
  type Lang,
  type StudentEmailTemplateKey,
} from "../_shared/student-email-settings.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const APP_URL = "https://golfproconnect.lovable.app";
const FROM = "SC Golf Academy <admin@margeagolfacademy.com>";
const REPLY_TO = "admin@margeagolfacademy.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  studentName: string;
  videoTitle?: string;
  uploadedBy?: 'coach' | 'student';
  notificationType?:
    | 'video_uploaded'
    | 'student_upload'
    | 'feedback_added'
    | 'welcome'
    | 'package_added'
    | 'subscription_confirmed'
    | 'priority_spot_claimed'
    | 'analysis_submitted'
    | 'lesson_booked'
    | 'lesson_skipped'
    | 'lesson_cancelled';
  feedbackPreview?: string;
  packageSize?: number;
  lessonsRemaining?: number;
  planLabel?: string;
  renewalDate?: string;
  spotDay?: string;
  spotTime?: string;
  lessonDate?: string;
  lessonTime?: string;
  lessonType?: string;
  lessonDurationMinutes?: number;
}

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface BrandedEmailOpts {
  preheader?: string;
  icon: string;            // emoji
  title: string;           // gold heading
  subtitle?: string;       // small line under title
  greeting?: string;       // e.g. "Hi Sam,"
  intro?: string;          // first paragraph
  detailsHtml?: string;    // inner HTML for the card (use cardRow / bigStat helpers)
  bodyHtml?: string;       // additional paragraphs/sections after the card
  ctaText?: string;
  ctaHref?: string;
  closingHtml?: string;    // last paragraph
}

function brandedEmail(opts: BrandedEmailOpts): string {
  const {
    preheader = "",
    icon,
    title,
    subtitle = "",
    greeting = "",
    intro = "",
    detailsHtml = "",
    bodyHtml = "",
    ctaText,
    ctaHref,
    closingHtml = "",
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
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1a3a1c 0%,#0d2410 100%);padding:34px 32px;text-align:center;border-bottom:1px solid rgba(239,159,39,0.25);">
        <p style="margin:0;color:#EF9F27;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">SC Golf Academy</p>
        <h1 style="margin:6px 0 0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-.3px;">⛳ Elevate Your Game</h1>
      </td></tr>

      <!-- Body -->
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

      <!-- Footer -->
      <tr><td style="background:#0d2410;padding:22px 32px;text-align:center;border-top:1px solid rgba(239,159,39,0.18);">
        <p style="margin:0;color:rgba(245,240,232,0.55);font-size:12px;line-height:1.6;">
          SC Golf Academy · <a href="mailto:admin@margeagolfacademy.com" style="color:#EF9F27;text-decoration:none;">admin@margeagolfacademy.com</a>
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

const bigStat = (label: string, value: string, sub = "") => `
  <div style="text-align:center;">
    <p style="margin:0 0 6px;color:#EF9F27;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</p>
    <p style="margin:0;color:#ffffff;font-size:30px;font-weight:700;letter-spacing:-.5px;">${escapeHtml(value)}</p>
    ${sub ? `<p style="margin:4px 0 0;color:rgba(245,240,232,0.6);font-size:13px;">${escapeHtml(sub)}</p>` : ""}
  </div>`;

// ========== Email content per type ==========

const welcomeEmail = (lang: Lang, name: string) =>
  brandedEmail({
    preheader: lang === "es"
      ? "Bienvenido a SC Golf Academy — vamos a elevar tu juego."
      : "Welcome to SC Golf Academy — let's elevate your game.",
    icon: "🏌️",
    title: t(lang, "welcome_title"),
    subtitle: t(lang, "welcome_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: t(lang, "welcome_intro"),
    detailsHtml: `
      <p style="margin:0 0 12px;color:#EF9F27;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">${escapeHtml(t(lang, "welcome_get_started"))}</p>
      <ul style="margin:0;padding-left:18px;color:#f5f0e8;font-size:14px;line-height:1.9;">
        <li>${t(lang, "welcome_li_book")}</li>
        <li>${t(lang, "welcome_li_pro")}</li>
        <li>${t(lang, "welcome_li_video")}</li>
        <li>${t(lang, "welcome_li_stats")}</li>
      </ul>`,
    ctaText: t(lang, "go_dashboard"),
    ctaHref: `${APP_URL}/dashboard`,
    closingHtml: t(lang, "welcome_close"),
  });

const videoUploadedEmail = (lang: Lang, name: string, videoTitle: string, isCoach: boolean) =>
  brandedEmail({
    preheader: isCoach ? t(lang, "vid_coach_subtitle") : t(lang, "vid_self_subtitle"),
    icon: "🎬",
    title: isCoach ? t(lang, "vid_coach_title") : t(lang, "vid_self_title"),
    subtitle: isCoach ? t(lang, "vid_coach_subtitle") : t(lang, "vid_self_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: isCoach ? t(lang, "vid_coach_intro") : t(lang, "vid_self_intro"),
    detailsHtml: cardRow(t(lang, "video"), escapeHtml(videoTitle || (lang === "es" ? "Nuevo video" : "New video"))) + cardRow(t(lang, "status"), t(lang, "ready")),
    ctaText: t(lang, "watch_video"),
    ctaHref: `${APP_URL}/videos`,
  });

const studentUploadEmail = (name: string, videoTitle: string) =>
  // sent to coach — stays English
  brandedEmail({
    preheader: `New video from ${name}`,
    icon: "📤",
    title: "New Video to Review",
    subtitle: "A student submitted a video for analysis",
    greeting: "Hi Coach,",
    intro: `<strong style="color:#EF9F27;">${escapeHtml(name)}</strong> uploaded a new video for your review and feedback.`,
    detailsHtml: cardRow("Student", escapeHtml(name)) + cardRow("Video", escapeHtml(videoTitle || "Video submission")) + cardRow("Status", "Awaiting review"),
    ctaText: "Review Video",
    ctaHref: `${APP_URL}/admin/analysis-requests`,
  });

const analysisSubmittedEmail = (lang: Lang, name: string, videoTitle: string) =>
  brandedEmail({
    preheader: t(lang, "an_title"),
    icon: "🎯",
    title: t(lang, "an_title"),
    subtitle: t(lang, "an_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: t(lang, "an_intro"),
    detailsHtml:
      cardRow(t(lang, "video"), escapeHtml(videoTitle || (lang === "es" ? "Video de swing" : "Swing video"))) +
      cardRow(t(lang, "status"), t(lang, "awaiting_review")) +
      cardRow(t(lang, "expected_response"), t(lang, "within_1_day")),
    ctaText: t(lang, "view_videos"),
    ctaHref: `${APP_URL}/videos`,
    closingHtml: t(lang, "an_close"),
  });

const feedbackEmail = (lang: Lang, name: string, videoTitle: string, preview: string) =>
  brandedEmail({
    preheader: t(lang, "subj_feedback"),
    icon: "💬",
    title: t(lang, "fb_title"),
    subtitle: t(lang, "fb_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: `${t(lang, "fb_intro_pre")}${videoTitle ? ` <strong style="color:#EF9F27;">"${escapeHtml(videoTitle)}"</strong>` : ""} ${t(lang, "fb_intro_post")}`,
    detailsHtml: preview
      ? `<p style="margin:0 0 8px;color:#EF9F27;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(t(lang, "fb_preview_label"))}</p>
         <p style="margin:0;color:#f5f0e8;font-size:14px;line-height:1.7;font-style:italic;">"${escapeHtml(preview.substring(0, 220))}${preview.length > 220 ? "…" : ""}"</p>`
      : "",
    ctaText: t(lang, "view_feedback"),
    ctaHref: `${APP_URL}/videos`,
    closingHtml: t(lang, "fb_close"),
  });

const packageAddedEmail = (lang: Lang, name: string, size: number, remaining: number) =>
  brandedEmail({
    preheader: lang === "es" ? `Paquete de ${size} clases agregado a tu cuenta` : `${size}-lesson package added to your account`,
    icon: "🎟️",
    title: t(lang, "pkg_added_title"),
    subtitle: t(lang, "pkg_added_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: lang === "es"
      ? `${t(lang, "pkg_added_intro_pre")} <strong style="color:#EF9F27;">${size} ${t(lang, "pkg_added_intro_post")}</strong>`
      : `${t(lang, "pkg_added_intro_pre")} <strong style="color:#EF9F27;">${size}-lesson package</strong> ${t(lang, "pkg_added_intro_post")}`,
    detailsHtml: bigStat(t(lang, "lessons_available"), String(remaining), t(lang, "ready_to_book")),
    ctaText: t(lang, "view_lessons"),
    ctaHref: `${APP_URL}/lessons`,
    closingHtml: t(lang, "pkg_added_close"),
  });

const subscriptionConfirmedEmail = (lang: Lang, name: string, planLabel: string, renewalDate?: string) => {
  const isPro = planLabel.toLowerCase() === "pro";
  const planTitle = planLabel.charAt(0).toUpperCase() + planLabel.slice(1);
  const details = bigStat(t(lang, "active_plan"), planTitle, renewalDate ? `${t(lang, "next_renewal")}: ${renewalDate}` : "");
  const perks = `
    <p style="margin:18px 0 10px;color:#EF9F27;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">${escapeHtml(t(lang, "sub_what"))}</p>
    <ul style="margin:0;padding-left:18px;color:#f5f0e8;font-size:14px;line-height:1.9;">
      <li>${t(lang, "sub_li_pro")}</li>
      <li>${t(lang, "sub_li_feedback")}</li>
      <li>${t(lang, "sub_li_priority")}</li>
      ${isPro ? `<li>${t(lang, "sub_li_pro_perks")}</li>` : ""}
    </ul>`;
  return brandedEmail({
    preheader: lang === "es" ? `Tu membresía ${planTitle} está activa` : `Your ${planTitle} membership is active`,
    icon: isPro ? "👑" : "🎉",
    title: lang === "es" ? `¡Tu membresía ${planTitle} está activa!` : `Your ${planTitle} membership is active!`,
    subtitle: lang === "es" ? `Bienvenido al nivel ${planTitle} de SC Golf Academy` : `Welcome to the SC Golf Academy ${planTitle} tier`,
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: `${t(lang, "sub_intro_pre")} <strong style="color:#EF9F27;">${planTitle}</strong> ${t(lang, "sub_intro_post")}`,
    detailsHtml: details,
    bodyHtml: `<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(239,159,39,0.18);border-radius:12px;padding:18px 22px;margin:8px 0 0;">${perks}</div>`,
    ctaText: t(lang, "explore_pro"),
    ctaHref: `${APP_URL}/pro-zone`,
    closingHtml: t(lang, "sub_close"),
  });
};

const prioritySpotEmail = (lang: Lang, name: string, day: string, time: string) =>
  brandedEmail({
    preheader: lang === "es" ? `Tu horario fijo semanal está confirmado: ${day} ${time}` : `Your weekly Priority Spot is locked in: ${day} ${time}`,
    icon: "📌",
    title: t(lang, "spot_title"),
    subtitle: t(lang, "spot_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: t(lang, "spot_intro"),
    detailsHtml: `
      <p style="margin:0 0 6px;color:#EF9F27;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:center;">${escapeHtml(t(lang, "your_recurring"))}</p>
      <p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-.3px;text-align:center;">${escapeHtml(day)}</p>
      <p style="margin:6px 0 0;color:#EF9F27;font-size:20px;font-weight:600;text-align:center;">${escapeHtml(time)}</p>`,
    bodyHtml: `<p style="margin:0 0 8px;color:#f5f0e8;font-size:14px;line-height:1.7;">${t(lang, "spot_body")}</p>`,
    ctaText: t(lang, "view_lessons"),
    ctaHref: `${APP_URL}/lessons`,
    closingHtml: t(lang, "spot_close"),
  });

function fmtLessonDateTime(lang: Lang, dateStr?: string, timeStr?: string) {
  if (!dateStr) return { date: "", time: "" };
  const t = timeStr && timeStr.length >= 5 ? timeStr : "12:00";
  const iso = `${dateStr}T${t.length === 5 ? t + ":00" : t}-05:00`;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    timeZone: "America/Cancun",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(d);
  const time = timeStr
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Cancun",
        hour: "numeric", minute: "2-digit", hour12: true,
      }).format(d)
    : "";
  return { date, time };
}

const lessonBookedEmail = (
  lang: Lang,
  name: string,
  lessonDate?: string,
  lessonTime?: string,
  lessonType?: string,
  remaining?: number | null,
) => {
  const { date, time } = fmtLessonDateTime(lang, lessonDate, lessonTime);
  const remainingLine =
    typeof remaining === "number"
      ? cardRow(t(lang, "remaining_package"), `${remaining} ${remaining === 1 ? (lang === "es" ? "clase" : "lesson") : (lang === "es" ? "clases" : "lessons")}`)
      : "";
  return brandedEmail({
    preheader: lang === "es"
      ? `Tu clase con tu Coach está confirmada${date ? ` para ${date}` : ""}`
      : `Your lesson with your Coach is confirmed${date ? ` for ${date}` : ""}`,
    icon: "✅",
    title: t(lang, "booked_title"),
    subtitle: t(lang, "booked_subtitle"),
    greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
    intro: t(lang, "booked_intro"),
    detailsHtml:
      cardRow(t(lang, "date"), date || "—") +
      cardRow(t(lang, "time"), time || "—") +
      cardRow(t(lang, "type"), formatLessonType(lang, lessonType)) +
      cardRow(t(lang, "coach"), t(lang, "santi")) +
      cardRow(t(lang, "location"), t(lang, "academy")) +
      remainingLine,
    ctaText: t(lang, "view_lessons"),
    ctaHref: `${APP_URL}/lessons`,
    closingHtml: t(lang, "booked_close"),
  });
};

// ===== iCalendar (.ics) builder for lesson_booked emails =====
// Lessons store time as Cancun-local (UTC-5, no DST). We convert to UTC for the
// ICS DTSTART/DTEND values. Apple/Google/Outlook all import this reliably.
function pad2(n: number) { return String(n).padStart(2, "0"); }
function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}
function escIcs(s: string): string {
  return String(s).replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
}
function buildLessonIcs(opts: {
  lessonDate: string; // YYYY-MM-DD
  lessonTime: string; // HH:MM[:SS]
  durationMinutes: number;
  lessonType?: string | null;
  studentName?: string | null;
}): string {
  const time = opts.lessonTime.length === 5 ? `${opts.lessonTime}:00` : opts.lessonTime.slice(0, 8);
  const startIso = `${opts.lessonDate}T${time}-05:00`; // Cancun
  const startMs = new Date(startIso).getTime();
  const endMs = startMs + opts.durationMinutes * 60_000;
  const dtStart = toIcsUtc(new Date(startMs));
  const dtEnd = toIcsUtc(new Date(endMs));
  const dtStamp = toIcsUtc(new Date());
  // Stable UID — same lesson date+time produces the same UID so future
  // update/cancel emails can replace this event in the user's calendar.
  const uid = `apex-lesson-${opts.lessonDate}-${time.replace(/:/g, "")}@margeagolfacademy.com`;
  const typeSuffix = opts.lessonType ? ` (${opts.lessonType})` : "";
  const summary = `Lesson with your Coach · Apex Golf Academy${typeSuffix}`;
  const description =
    `Lesson type: ${opts.lessonType ?? "Lesson"}\\n` +
    `Duration: ${opts.durationMinutes} minutes\\n\\n` +
    `See you on the range!`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Apex Golf Academy//Lesson Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escIcs(summary)}`,
    `DESCRIPTION:${escIcs(description)}`,
    `LOCATION:${escIcs("Apex Golf Academy")}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lesson reminder",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lesson reminder",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
function b64encode(s: string): string {
  // Deno: btoa works on Latin-1 strings
  return btoa(unescape(encodeURIComponent(s)));
}

serve(async (req: Request): Promise<Response> => {
  // (.ics helpers defined below as module-level functions)
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured");
    return new Response(JSON.stringify({ success: false, warning: "Email provider not configured" }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Service-role client for logging to email_send_log
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const {
      to, studentName, videoTitle, uploadedBy, notificationType,
      feedbackPreview, packageSize, lessonsRemaining,
      planLabel, renewalDate, spotDay, spotTime,
      lessonDate, lessonTime, lessonType, lessonDurationMinutes,
    }: EmailRequest = await req.json();

    // Capture for error logging (before any throw)
    const _logTo = to;
    const _logType = notificationType;

    if (!to) {
      return new Response(JSON.stringify({ success: false, warning: "No recipient email" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const name = studentName || "there";
    let subject: string;
    let html: string;

    // Gate via student email settings (student_upload goes to coach — skip gating)
    const settings = await getStudentEmailSettings(admin);
    const lang: Lang = settings.language;
    const typeToKey: Record<string, StudentEmailTemplateKey | null> = {
      welcome: "welcome",
      feedback_added: "feedback_added",
      student_upload: null, // to coach
      package_added: "package_added",
      subscription_confirmed: "subscription_confirmed",
      priority_spot_claimed: "priority_spot_claimed",
      analysis_submitted: "analysis_submitted",
      lesson_booked: "lesson_booked",
      lesson_skipped: "lesson_skipped",
      lesson_cancelled: "lesson_cancelled",
      video_uploaded: "video_uploaded",
    };
    const gateKey = typeToKey[notificationType || "video_uploaded"] ?? "video_uploaded";
    if (gateKey !== null && !shouldSend(settings, gateKey as StudentEmailTemplateKey)) {
      return new Response(JSON.stringify({ success: true, skipped: "disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    switch (notificationType) {
      case "welcome":
        subject = t(lang, "subj_welcome");
        html = welcomeEmail(lang, name);
        break;
      case "feedback_added":
        subject = t(lang, "subj_feedback");
        html = feedbackEmail(lang, name, videoTitle || "", feedbackPreview || "");
        break;
      case "student_upload":
        subject = `New Video from ${name} - Review Needed 📹`;
        html = studentUploadEmail(name, videoTitle || "");
        break;
      case "package_added":
        subject = t(lang, "subj_package_added");
        html = packageAddedEmail(lang, name, packageSize || 0, lessonsRemaining ?? packageSize ?? 0);
        break;
      case "subscription_confirmed": {
        const raw = (planLabel || "membership").toString();
        const label = raw.charAt(0).toUpperCase() + raw.slice(1);
        subject = lang === "es" ? `Tu membresía ${label} está activa 🎉` : `Your ${label} membership is active 🎉`;
        html = subscriptionConfirmedEmail(lang, name, raw, renewalDate);
        break;
      }
      case "priority_spot_claimed":
        subject = t(lang, "subj_priority_spot");
        html = prioritySpotEmail(lang, name, spotDay || (lang === "es" ? "tu día" : "your day"), spotTime || (lang === "es" ? "tu hora" : "your time"));
        break;
      case "analysis_submitted":
        subject = t(lang, "subj_analysis");
        html = analysisSubmittedEmail(lang, name, videoTitle || "");
        break;
      case "lesson_booked":
        subject = t(lang, "subj_lesson_booked");
        html = lessonBookedEmail(lang, name, lessonDate, lessonTime, lessonType, lessonsRemaining ?? null);
        break;
      case "lesson_skipped": {
        const { date, time } = fmtLessonDateTime(lang, lessonDate, lessonTime);
        subject = t(lang, "subj_lesson_skipped");
        html = brandedEmail({
          preheader: lang === "es"
            ? `Tu Coach marcó tu clase ${date || 'semanal'} como saltada`
            : `Your Coach marked your ${date || 'weekly'} lesson as skipped`,
          icon: "⏭",
          title: t(lang, "skipped_title"),
          subtitle: t(lang, "skipped_subtitle"),
          greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
          intro: t(lang, "skipped_intro"),
          detailsHtml:
            cardRow(t(lang, "skipped_date"), date || "—") +
            cardRow(t(lang, "time"), time || "—") +
            cardRow(t(lang, "type"), formatLessonType(lang, lessonType)),
          ctaText: t(lang, "view_lessons"),
          ctaHref: `${APP_URL}/lessons`,
          closingHtml: t(lang, "skipped_close"),
        });
        break;
      }
      case "lesson_cancelled": {
        const { date, time } = fmtLessonDateTime(lang, lessonDate, lessonTime);
        const remainingLine =
          lessonsRemaining != null
            ? cardRow(t(lang, "lessons_remaining"), String(lessonsRemaining))
            : "";
        subject = t(lang, "subj_lesson_cancelled");
        html = brandedEmail({
          preheader: lang === "es"
            ? `Tu clase ${date || 'próxima'} fue cancelada y se devolvió 1 crédito`
            : `Your ${date || 'upcoming'} lesson was cancelled and 1 credit was returned`,
          icon: "❎",
          title: t(lang, "cancelled_title"),
          subtitle: t(lang, "cancelled_subtitle"),
          greeting: lang === "es" ? `Hola ${name},` : `Hi ${name},`,
          intro: t(lang, "cancelled_intro"),
          detailsHtml:
            cardRow(t(lang, "cancelled_date"), date || "—") +
            cardRow(t(lang, "time"), time || "—") +
            cardRow(t(lang, "type"), formatLessonType(lang, lessonType)) +
            remainingLine,
          ctaText: t(lang, "cancelled_cta"),
          ctaHref: `${APP_URL}/lessons`,
          closingHtml: t(lang, "cancelled_close"),
        });
        break;
      }
      default: {
        const isCoach = uploadedBy === "coach";
        subject = isCoach ? t(lang, "subj_video_coach") : t(lang, "subj_video_self");
        html = videoUploadedEmail(lang, name, videoTitle || "", isCoach);
      }
    }

    // Build .ics attachment for lesson_booked confirmation emails so the
    // student can add the event to Google/Apple/Outlook calendar in one tap.
    const attachments: Array<{ filename: string; content: string; content_type?: string }> = [];
    if (notificationType === "lesson_booked" && lessonDate && lessonTime) {
      try {
        const ics = buildLessonIcs({
          lessonDate,
          lessonTime,
          durationMinutes: Number(lessonDurationMinutes) > 0 ? Number(lessonDurationMinutes) : 60,
          lessonType,
          studentName: name,
        });
        attachments.push({
          filename: "lesson.ics",
          content: b64encode(ics),
          content_type: "text/calendar; method=PUBLISH; charset=utf-8",
        });
      } catch (icsErr) {
        console.warn("Failed to build .ics attachment:", icsErr);
      }
    }

    const emailPayload: Record<string, unknown> = {
      from: FROM, reply_to: REPLY_TO, to: [to], subject, html,
      bcc: gateKey ? bccList(settings, gateKey as any) : [],
    };
    if (attachments.length > 0) emailPayload.attachments = attachments;

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Resend error:", data);
      throw new Error(data?.message || "Failed to send email");
    }

    console.log("Email sent:", { to, subject });

    // Log successful send to email_send_log for audit / dashboard
    const messageId = data?.id || crypto.randomUUID();
    try {
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: notificationType || "video_uploaded",
        recipient_email: to,
        status: "sent",
        metadata: { subject, studentName: name },
      });
    } catch (logErr) {
      console.warn("email_send_log insert failed (non-blocking):", logErr);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-notification-email error:", err);

    // Log failure
    admin.from("email_send_log").insert({
      message_id: crypto.randomUUID(),
      template_name: "unknown",
      recipient_email: "unknown",
      status: "failed",
      error_message: err?.message || String(err),
    }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
