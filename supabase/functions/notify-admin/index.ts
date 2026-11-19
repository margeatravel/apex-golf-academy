import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_URL = "https://api.resend.com/emails";
const ADMIN_EMAIL = "admin@margeagolfacademy.com";
const FROM = "Margea Golf Academy <admin@margeagolfacademy.com>";
const APP_URL = "https://golfproconnect.lovable.app";
const TZ = "America/Cancun"; // UTC-5, no DST

// ----- Cancún (UTC-5) date/time formatters -----
// Inputs may be ISO strings, "YYYY-MM-DD" date strings, or "HH:MM[:SS]" time strings.
function fmtDateCancun(input?: string): string {
  if (!input) return "";
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Treat plain date as a wall-clock date in Cancún (avoid UTC midnight rollover)
    d = new Date(`${input}T12:00:00-05:00`);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtTimeCancun(input?: string): string {
  if (!input) return "";
  // Plain "HH:MM" or "HH:MM:SS" — render directly as wall-clock time, no TZ conversion needed
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(input)) {
    const [h, m] = input.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDateTimeCancun(input?: string | Date): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return d.toLocaleString("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " (Cancún)";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType =
  | "user_registered"
  | "lesson_booked"
  | "lesson_cancelled"
  | "priority_spot_claimed"
  | "priority_spot_cancelled"
  | "subscription_started"
  | "subscription_cancelled"
  | "payment_received"
  | "video_uploaded_for_analysis"
  | "package_purchased"
  | "recurring_schedule_created";

interface NotifyPayload {
  eventType: EventType;
  studentName?: string;
  studentEmail?: string;
  lessonDate?: string;
  lessonTime?: string;
  lessonType?: string;
  spotDay?: string;
  spotTime?: string;
  planLabel?: string;
  amount?: number | string;
  currency?: string;
  concept?: string;
  packageName?: string;
  notes?: string;
  packageId?: string;
  sessionId?: string;
  // lesson_booked extras
  paidWith?: 'package' | 'card' | 'cash_transfer' | 'membership' | 'unpaid';
  lessonsRemaining?: number | string | null;
  packageSize?: number | string | null;
  lessonStatus?: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | string;
  /** Lesson row id — lets the function resolve package linkage at send time. */
  lessonId?: string;
  /** Resolved server-side: package name + position of this lesson in the package. */
  packageName2?: string;
  packageLessonNumber?: number;
  packageRemaining?: number;

  // recurring_schedule_created
  dayOfWeek?: string;          // e.g. "Monday"
  durationMinutes?: number | string;
  weeksGenerated?: number | string;
}

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtAmount = (amount?: number | string, currency = "MXN") => {
  if (amount == null || amount === "") return "";
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!isFinite(num)) return String(amount);
  return `$${Math.round(num).toLocaleString("en-US")} ${currency.toUpperCase()}`;
};

const cardRow = (label: string, value: string) =>
  value
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 6px;">
         <tr>
           <td style="color:rgba(245,240,232,0.55);font-size:12px;text-transform:uppercase;letter-spacing:.6px;padding:5px 0;">${escapeHtml(label)}</td>
           <td align="right" style="color:#f5f0e8;font-size:14px;font-weight:600;padding:5px 0;">${escapeHtml(value)}</td>
         </tr>
       </table>`
    : "";

interface BuildResult {
  subject: string;
  icon: string;
  title: string;
  subtitle: string;
  detailsHtml: string;
  ctaText?: string;
  ctaHref?: string;
}

function build(p: NotifyPayload): BuildResult {
  const name = p.studentName || "Unknown student";
  const emailSuffix = p.studentEmail ? ` (${p.studentEmail})` : "";

  switch (p.eventType) {
    case "user_registered":
      return {
        subject: `New student registered: ${name}${emailSuffix}`,
        icon: "👋",
        title: "New student registered",
        subtitle: "A new student just signed up for Margea Golf Academy",
        detailsHtml: cardRow("Name", name) + cardRow("Email", p.studentEmail || "—"),
        ctaText: "View Students",
        ctaHref: `${APP_URL}/admin/students`,
      };
    case "lesson_booked":
      {
      const dateLabel = fmtDateCancun(p.lessonDate);
      const timeLabel = fmtTimeCancun(p.lessonTime);
      const remaining = p.lessonsRemaining != null ? Number(p.lessonsRemaining) : null;
      const pkgSize = p.packageSize != null ? Number(p.packageSize) : null;
      let paymentLabel = "";
      let paymentSuffix = "";
      let packageStatusLabel = "";
      switch (p.paidWith) {
        case "package":
          {
          const isFuture = p.lessonStatus === "scheduled";
          // Preferred format (resolved server-side from the lesson's package_id):
          // "Descontada de paquete — 10-Lesson Package · Clase 4 de 10"
          if (p.packageLessonNumber != null && pkgSize != null) {
            const pkgName = p.packageName2 || `${pkgSize}-Lesson Package`;
            paymentLabel = `Descontada de paquete — ${pkgName} · Clase ${p.packageLessonNumber} de ${pkgSize}`;
            const rem = p.packageRemaining != null ? p.packageRemaining : remaining;
            if (rem != null) packageStatusLabel = `Restantes: ${rem} de ${pkgSize}`;
            paymentSuffix = ` · Paquete (${p.packageLessonNumber}/${pkgSize})`;
          } else if (remaining != null && pkgSize != null) {
            paymentLabel = isFuture
              ? `Reserved against package — currently ${remaining}/${pkgSize} left (will deduct when lesson is completed)`
              : `Deducted from package — ${remaining}/${pkgSize} lessons left${remaining <= 2 ? " ⚠️ low" : ""}`;
            paymentSuffix = isFuture
              ? ` · Pkg reserved (${remaining}/${pkgSize})`
              : ` · Pkg ${remaining}/${pkgSize} left`;
          } else {
            paymentLabel = isFuture ? "Reserved against package" : "Deducted from package";
            paymentSuffix = " · Package";
          }
          break;
          }

        case "cash_transfer":
          paymentLabel = "⚠️ PENDING — student will pay CASH or TRANSFER at the lesson";
          paymentSuffix = " · Cash/Transfer pending";
          break;
        case "card":
          paymentLabel = "Pending — paying online with card (Stripe)";
          paymentSuffix = " · Card pending";
          break;
        case "membership":
          paymentLabel = "Covered by Apex membership";
          paymentSuffix = " · Apex membership";
          break;
        case "unpaid":
          paymentLabel = "⚠️ No payment recorded — student has no package and no Apex membership";
          paymentSuffix = " · Unpaid";
          break;
      }
      return {
        subject: `New lesson booked: ${name} · ${dateLabel} · ${timeLabel} · ${p.lessonType || ""}${paymentSuffix}`.trim(),
        icon: "📅",
        title: "New lesson booked",
        subtitle: `${name} just scheduled a lesson`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Date", dateLabel || "—") +
          cardRow("Time", timeLabel || "—") +
          cardRow("Type", p.lessonType || "—") +
          cardRow("Payment", paymentLabel) +
          cardRow("Paquete", packageStatusLabel) +
          cardRow("Notes", p.notes || ""),
        ctaText: "View Lessons",
        ctaHref: `${APP_URL}/admin/lessons`,
      };
      }
    case "lesson_cancelled":
      {
      const dateLabel = fmtDateCancun(p.lessonDate);
      const timeLabel = fmtTimeCancun(p.lessonTime);
      return {
        subject: `Lesson cancelled: ${name} · ${dateLabel} · ${timeLabel}`.trim(),
        icon: "❌",
        title: "Lesson cancelled by student",
        subtitle: `${name} cancelled an upcoming lesson — the slot is now open`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Date", dateLabel || "—") +
          cardRow("Time", timeLabel || "—") +
          cardRow("Type", p.lessonType || "—") +
          cardRow("Status", "Slot released — credit returned to student's package"),
        ctaText: "View Lessons",
        ctaHref: `${APP_URL}/admin/lessons`,
      };
      }
    case "priority_spot_claimed":
      {
      const timeLabel = fmtTimeCancun(p.spotTime);
      return {
        subject: `Priority Spot claimed: ${name} · ${p.spotDay || ""} · ${timeLabel}`.trim(),
        icon: "📌",
        title: "Priority Spot claimed",
        subtitle: `${name} claimed a recurring weekly time`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Day", p.spotDay || "—") +
          cardRow("Time", timeLabel || "—"),
        ctaText: "View Schedule",
        ctaHref: `${APP_URL}/admin/fixed-schedule`,
      };
      }
    case "priority_spot_cancelled":
      {
      const timeLabel = fmtTimeCancun(p.spotTime);
      const dayTime = `${p.spotDay || "—"} · ${timeLabel || "—"}`;
      return {
        subject: `Priority Spot cancelled: ${name} (${dayTime})`,
        icon: "🚫",
        title: "Priority Spot cancelled",
        subtitle: `${name} cancelled their Priority Spot (${dayTime})`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Day", p.spotDay || "—") +
          cardRow("Time", timeLabel || "—") +
          cardRow("Status", "Spot released — now open for other students"),
        ctaText: "View Schedule",
        ctaHref: `${APP_URL}/admin/fixed-schedule`,
      };
      }
    case "subscription_started": {
      const plan = (p.planLabel || "membership").toString();
      const planTitle = plan.charAt(0).toUpperCase() + plan.slice(1);
      const dateStr = new Date().toLocaleDateString("en-US", { timeZone: TZ, year: "numeric", month: "short", day: "numeric" });
      return {
        subject: `New subscription: ${name} signed up for ${planTitle} · ${dateStr}`,
        icon: plan.toLowerCase() === "pro" ? "👑" : "🎉",
        title: "New subscription",
        subtitle: `${name} just started a ${planTitle} membership`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Plan", planTitle) +
          cardRow("Date", dateStr) +
          cardRow("Amount", p.amount ? fmtAmount(p.amount, p.currency) : ""),
        ctaText: "View Subscribers",
        ctaHref: `${APP_URL}/admin/subscribers`,
      };
    }
    case "subscription_cancelled": {
      const plan = (p.planLabel || "membership").toString();
      const planTitle = plan.charAt(0).toUpperCase() + plan.slice(1);
      return {
        subject: `Subscription cancelled: ${name} cancelled ${planTitle}`,
        icon: "⚠️",
        title: "Subscription cancelled",
        subtitle: `${name} cancelled their ${planTitle} membership`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Plan cancelled", planTitle),
        ctaText: "View Subscribers",
        ctaHref: `${APP_URL}/admin/subscribers`,
      };
    }
    case "payment_received":
      return {
        subject: `Payment received: ${name} · ${fmtAmount(p.amount, p.currency)} · ${p.concept || ""}`.trim(),
        icon: "💰",
        title: "Payment received",
        subtitle: `${name} just made a payment`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Amount", fmtAmount(p.amount, p.currency)) +
          cardRow("For", p.concept || "—"),
        ctaText: "View Revenue",
        ctaHref: `${APP_URL}/admin/revenue`,
      };
    case "video_uploaded_for_analysis":
      return {
        subject: `New video upload: ${name} submitted a video for coach review`,
        icon: "🎬",
        title: "New video for review",
        subtitle: `${name} just submitted a video`,
        detailsHtml: cardRow("Student", name) + cardRow("Email", p.studentEmail || "") + cardRow("Status", "Awaiting review"),
        ctaText: "Review Video",
        ctaHref: `${APP_URL}/admin/analysis-requests`,
      };
    case "package_purchased":
      return {
        subject: `Package purchased: ${name} bought ${p.packageName || "a package"}`,
        icon: "🎟️",
        title: "Package purchased",
        subtitle: `${name} just purchased a lesson package`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Package", p.packageName || "—") +
          cardRow("Amount", p.amount ? fmtAmount(p.amount, p.currency) : ""),
        ctaText: "View Packages",
        ctaHref: `${APP_URL}/admin/packages`,
      };
    case "recurring_schedule_created": {
      const timeLabel = fmtTimeCancun(p.spotTime || p.lessonTime);
      const day = p.dayOfWeek || p.spotDay || "—";
      const duration = p.durationMinutes ? `${p.durationMinutes} min` : "—";
      const lessonType = p.lessonType || "Range";
      const weeks = p.weeksGenerated != null ? `${p.weeksGenerated} weeks generated` : "";
      return {
        subject: `Recurring schedule created: ${name} · ${day} · ${timeLabel} · ${duration} · ${lessonType}${weeks ? " · " + weeks : ""}`,
        icon: "🔁",
        title: "Recurring schedule created",
        subtitle: `${name} now has a weekly recurring lesson`,
        detailsHtml:
          cardRow("Student", name) +
          cardRow("Email", p.studentEmail || "") +
          cardRow("Day", day) +
          cardRow("Time", timeLabel || "—") +
          cardRow("Duration", duration) +
          cardRow("Type", lessonType) +
          (weeks ? cardRow("Generated", weeks) : ""),
        ctaText: "View Schedule",
        ctaHref: `${APP_URL}/admin/recurring-schedules`,
      };
    }
  }
}

function renderHtml(b: BuildResult, notes?: string): string {
  const cta = b.ctaText && b.ctaHref
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;">
         <tr><td align="center">
           <a href="${b.ctaHref}" style="display:inline-block;background:#EF9F27;color:#0e2410;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
             ${escapeHtml(b.ctaText)} →
           </a>
         </td></tr>
       </table>`
    : "";

  const notesBlock = notes
    ? `<div style="margin-top:16px;padding:14px 16px;background:rgba(239,159,39,0.08);border-left:3px solid #EF9F27;border-radius:8px;">
         <p style="margin:0 0 6px;color:#EF9F27;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Notes</p>
         <p style="margin:0;color:#f5f0e8;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(notes)}</p>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${escapeHtml(b.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#0e2410;font-family:Arial,Helvetica,sans-serif;color:#f5f0e8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0e2410;">${escapeHtml(b.subtitle)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0e2410;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#1a2e1c;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <tr><td style="background:linear-gradient(135deg,#1a3a1c 0%,#0d2410 100%);padding:30px 32px;text-align:center;border-bottom:1px solid rgba(239,159,39,0.25);">
        <p style="margin:0;color:#EF9F27;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Margea Golf Academy</p>
        <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;">⛳ Admin Notification</h1>
      </td></tr>
      <tr><td style="padding:32px 32px 24px;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:40px;line-height:1;margin-bottom:6px;">${b.icon}</div>
          <h2 style="margin:0;color:#EF9F27;font-size:21px;font-weight:700;letter-spacing:-.2px;">${escapeHtml(b.title)}</h2>
          <p style="margin:6px 0 0;color:rgba(245,240,232,0.65);font-size:14px;">${escapeHtml(b.subtitle)}</p>
        </div>
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(239,159,39,0.18);border-radius:12px;padding:18px 22px;margin:18px 0 4px;">
          ${b.detailsHtml}
        </div>
        ${notesBlock}
        ${cta}
      </td></tr>
      <tr><td style="background:#0d2410;padding:20px 32px;text-align:center;border-top:1px solid rgba(239,159,39,0.18);">
        <p style="margin:0;color:rgba(245,240,232,0.55);font-size:12px;line-height:1.6;">
          Margea Golf Academy · <a href="mailto:${ADMIN_EMAIL}" style="color:#EF9F27;text-decoration:none;">${ADMIN_EMAIL}</a>
        </p>
        <p style="margin:6px 0 0;color:rgba(245,240,232,0.35);font-size:11px;">Sent automatically · ${fmtDateTimeCancun(new Date())}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn("notify-admin: RESEND_API_KEY missing");
    return new Response(JSON.stringify({ success: false, warning: "RESEND_API_KEY not configured" }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const payload = (await req.json()) as NotifyPayload;
    if (!payload?.eventType) {
      return new Response(JSON.stringify({ success: false, error: "Missing eventType" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // For package_purchased: fetch the actual paid amount from the database
    // so the email always reflects the real transaction total (not a per-lesson
    // price or a stale value passed by the caller).
    if (payload.eventType === "package_purchased") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceKey) {
          const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
          let pkg: any = null;

          if (payload.packageId) {
            const { data } = await admin
              .from("class_packages")
              .select("price, amount_paid, package_size, package_name")
              .eq("id", payload.packageId)
              .maybeSingle();
            pkg = data;
          } else if (payload.sessionId) {
            // Fallback: look up the most recent package created from this Stripe session
            const { data } = await admin
              .from("package_payments")
              .select("amount, package_id, class_packages(price, amount_paid, package_size, package_name)")
              .ilike("notes", `%${payload.sessionId}%`)
              .order("payment_date", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.class_packages) {
              pkg = data.class_packages;
            }
          }

          if (pkg) {
            const total = Number(pkg.amount_paid) > 0 ? Number(pkg.amount_paid) : Number(pkg.price);
            if (isFinite(total) && total > 0) {
              payload.amount = total;
            }
            if (!payload.packageName && pkg.package_name) {
              payload.packageName = pkg.package_name;
            }
          }
        }
      } catch (e) {
        console.warn("notify-admin: failed to fetch package price from DB", String(e));
      }
    }

    // ROOT-CAUSE FIX (timing): the DB trigger fires AFTER INSERT and can miss a
    // package_id written by a later UPDATE. Re-read the lesson at send time and
    // compute the package position with the SAME formula as computePackageCounts
    // (used = completed/no_show, Playing Lesson/Campo = 2 slots), never the
    // persisted classes_remaining column.
    if (payload.eventType === "lesson_booked") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceKey) {
          const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

          let lesson: any = null;
          if (payload.lessonId) {
            const { data } = await admin
              .from("lessons")
              .select("id, package_id, status, lesson_type, lesson_date")
              .eq("id", payload.lessonId)
              .maybeSingle();
            lesson = data;
          }

          const packageId = lesson?.package_id || payload.packageId || null;
          if (packageId) {
            const [{ data: pkg }, { data: linked }] = await Promise.all([
              admin.from("class_packages").select("package_size, package_name, classes_used, classes_remaining").eq("id", packageId).maybeSingle(),
              admin.from("lessons").select("id, status, lesson_type").eq("package_id", packageId),
            ]);
            const weight = (t?: string | null) =>
              ["Campo", "Playing Lesson", "Field Lesson"].includes(t || "") ? 2 : 1;
            const used = (linked ?? []).reduce(
              (sum: number, l: any) =>
                l.status === "completed" || l.status === "no_show" ? sum + weight(l.lesson_type) : sum,
              0,
            );
            const rawSize = Number(pkg?.package_size || 0);
            const total = rawSize > 0
              ? rawSize
              : Number(pkg?.classes_used || 0) + Number(pkg?.classes_remaining || 0);

            const thisWeight = weight(lesson?.lesson_type || payload.lessonType);
            const thisCounted = lesson
              ? lesson.status === "completed" || lesson.status === "no_show"
              : false;
            const position = thisCounted ? used : used + thisWeight;

            payload.paidWith = "package";
            payload.packageSize = total;
            payload.packageName2 = pkg?.package_name || null as any;
            payload.packageLessonNumber = Math.min(position, total || position);
            payload.packageRemaining = Math.max(0, total - used);
            payload.lessonsRemaining = payload.packageRemaining;
          }
        }
      } catch (e) {
        console.warn("notify-admin: failed to resolve lesson package linkage", String(e));
      }
    }

    const built = build(payload);
    const html = renderHtml(built, payload.notes);

    // Insert in-app notification for all admin users
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
        // Get all admin user IDs
        const { data: adminRoles } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if (adminRoles && adminRoles.length > 0) {
          // Build metadata so the in-app notification detail card shows all relevant info
          const meta: Record<string, unknown> = {};
          if (payload.studentName) meta.student_name = payload.studentName;
          if (payload.studentEmail) meta.student_email = payload.studentEmail;
          if (payload.lessonDate) meta.lesson_date = payload.lessonDate;
          if (payload.lessonTime) meta.lesson_time = payload.lessonTime;
          if (payload.lessonType) meta.lesson_type = payload.lessonType;
          if (payload.amount != null) meta.amount = String(payload.amount);
          if (payload.currency) meta.currency = payload.currency;
          if (payload.packageName) meta.package_name = payload.packageName;
          if (payload.packageId) meta.package_id = payload.packageId;
          if (payload.concept) meta.concept = payload.concept;
          if (payload.planLabel) meta.plan_label = payload.planLabel;
          if (payload.paidWith) meta.paid_with = payload.paidWith;
          if (payload.lessonsRemaining != null) meta.lessons_remaining = String(payload.lessonsRemaining);
          if (payload.packageSize != null) meta.package_size = String(payload.packageSize);

          const notifRows = adminRoles.map((r: any) => ({
            user_id: r.user_id,
            title: built.title,
            message: built.subtitle,
            type: payload.eventType,
            link: built.ctaHref?.replace(APP_URL, "") || null,
            metadata: Object.keys(meta).length > 0 ? meta : null,
          }));
          const { error: notifErr } = await admin.from("notifications").insert(notifRows);
          if (notifErr) console.warn("notify-admin: failed to insert in-app notification", notifErr);
        }
      }
    } catch (e) {
      console.warn("notify-admin: in-app notification error", String(e));
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        reply_to: ADMIN_EMAIL,
        to: [ADMIN_EMAIL],
        subject: built.subject,
        html,
        bcc: ["admin@margeagolfacademy.com"],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("notify-admin: Resend error", data);
      return new Response(JSON.stringify({ success: false, error: data?.message || "Resend send failed", data }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`notify-admin: sent ${payload.eventType} to ${ADMIN_EMAIL}`);
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("notify-admin: error", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
