import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getStudentEmailSettings, shouldSend, bccList, t, formatLessonType } from "../_shared/student-email-settings.ts";

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

function fmtLessonDateTime(dateStr: string, timeStr: string) {
  const t = timeStr && timeStr.length >= 5 ? timeStr : "12:00";
  const iso = `${dateStr}T${t.length === 5 ? t + ":00" : t}-05:00`;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Cancun",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cancun",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
  return { date, time };
}

function reminderEmailHtml(lang: "es" | "en", name: string, lessonDate: string, lessonTime: string, lessonType: string, durationMin: number) {
  const { date, time } = fmtLessonDateTime(lessonDate, lessonTime);
  const greeting = lang === "es" ? `Hola ${name},` : `Hi ${name},`;
  const durLabel = lang === "es" ? "min" : "min";
  return brandedEmail({
    preheader: lang === "es" ? `Recordatorio: tu clase de hoy con tu Coach a las ${time}` : `Reminder: your lesson today with your Coach at ${time}`,
    icon: "⛳",
    title: t(lang, "reminder_title"),
    subtitle: t(lang, "reminder_subtitle"),
    greeting,
    intro: t(lang, "reminder_intro"),
    detailsHtml:
      cardRow(t(lang, "date"), date) +
      cardRow(t(lang, "time"), time) +
      cardRow(t(lang, "type"), formatLessonType(lang, lessonType)) +
      cardRow(t(lang, "duration"), `${durationMin} ${durLabel}`) +
      cardRow(t(lang, "coach"), t(lang, "santi")) +
      cardRow(t(lang, "location"), t(lang, "academy")),
    ctaText: t(lang, "view_lessons"),
    ctaHref: `${APP_URL}/lessons`,
    closingHtml: t(lang, "reminder_close"),
  });
}

function todayInCancun(): string {
  // Cancun is UTC-5 year-round (no DST). Format YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cancun",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  // Authorization: accept the service role key (manual/admin calls) or the
  // internal cron token stored in public.internal_cron_tokens (pg_cron).
  const authHeader = req.headers.get("Authorization") || "";
  let authorized = authHeader === `Bearer ${serviceKey}`;
  if (!authorized && authHeader.startsWith("Bearer ")) {
    const presented = authHeader.slice(7).trim();
    if (presented) {
      const authClient = createClient(supabaseUrl, serviceKey);
      const { data: tokenRow } = await authClient
        .from("internal_cron_tokens")
        .select("token")
        .eq("name", "daily_lesson_reminders")
        .maybeSingle();
      if (tokenRow?.token && tokenRow.token === presented) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }


  if (!resendApiKey) {
    return new Response(JSON.stringify({ success: false, error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const today = todayInCancun();

  // Gate via student email settings
  const settings = await getStudentEmailSettings(admin);
  if (!shouldSend(settings, "lesson_reminder")) {
    return new Response(JSON.stringify({ success: true, skipped: "disabled", today, sent: 0 }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  const lang = settings.language;

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ lesson_id: string; error: string }> = [];

  try {
    // Fetch today's pending lessons
    const { data: lessons, error: lessonsErr } = await admin
      .from("lessons")
      .select("id, student_id, package_id, lesson_date, lesson_time, lesson_type, duration_minutes, status, skipped, reminder_sent_at, invitee_email, invitee_name")
      .eq("lesson_date", today)
      .eq("status", "scheduled")
      .eq("skipped", false)
      .is("reminder_sent_at", null);

    if (lessonsErr) throw lessonsErr;

    for (const lesson of lessons || []) {
      try {
        // Resolve recipient(s): student + parents
        const recipients: string[] = [];
        let displayName = lesson.invitee_name || "there";

        // If this lesson is tied to a package, the package's owner (billing /
        // main holder) is the primary recipient — even if the attending
        // student differs (e.g. a family member training on someone else's
        // package).
        let recipientUserId: string | null = lesson.student_id || null;
        if (lesson.package_id) {
          const { data: pkg } = await admin
            .from("class_packages")
            .select("user_id")
            .eq("id", lesson.package_id)
            .maybeSingle();
          if (pkg?.user_id) recipientUserId = pkg.user_id;
        }

        if (recipientUserId) {
          const { data: profile } = await admin
            .from("profiles")
            .select("email, full_name")
            .eq("id", recipientUserId)
            .maybeSingle();

          if (profile?.email) recipients.push(profile.email);
          if (profile?.full_name) displayName = profile.full_name.split(" ")[0];

          // Family-link parents
          const { data: links } = await admin
            .from("family_links")
            .select("parent_user_id")
            .eq("child_user_id", recipientUserId);

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
        } else if (lesson.invitee_email) {
          recipients.push(lesson.invitee_email);
        }

        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const subject = t(lang, "subj_reminder");
        const html = reminderEmailHtml(
          lang,
          displayName,
          lesson.lesson_date,
          String(lesson.lesson_time),
          lesson.lesson_type,
          lesson.duration_minutes ?? 60,
        );

        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            reply_to: REPLY_TO,
            to: recipients,
            bcc: bccList(settings, "lesson_reminder"),
            subject,
            html,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.message || "Resend send failed");

        // Mark sent
        await admin
          .from("lessons")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", lesson.id);

        // Audit log
        try {
          await admin.from("email_send_log").insert({
            message_id: data?.id || crypto.randomUUID(),
            template_name: "lesson_daily_reminder",
            recipient_email: recipients.join(","),
            status: "sent",
            metadata: { subject, lesson_id: lesson.id, lesson_date: lesson.lesson_date },
          });
        } catch (_) { /* non-blocking */ }

        sent++;
      } catch (e: any) {
        errors.push({ lesson_id: lesson.id, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, today, sent, skipped, errors }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-daily-lesson-reminders error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});