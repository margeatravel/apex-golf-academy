import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Priority spots (Lugar Prioritario) with custom cadence.
 *
 *  action "list"  → weekly / every-2 / every-3 offers for the student's coach.
 *    Windows come from the coach's open spots (fixed_schedule_slots, unclaimed
 *    and available) and from active every-N recurring slots (their off weeks).
 *    A phase (interval m, first date) is offered only if it never lands on the
 *    same week as an overlapping active recurring slot (cadence math matches
 *    generate-recurring-lessons: Mon–Sun weeks from interval_anchor).
 *  action "claim" → re-validates server side, creates one recurring_lesson_slot
 *    per chosen phase (interval_weeks + interval_anchor), marks a weekly claim
 *    on the open spot, and runs generate-recurring-lessons for the student.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEFAULT_COACH_ID = "13480fb4-e4d2-423c-b035-c65846b061fc";
const PAID_TIERS = ["scratch", "pro", "apex"];
const CADENCES = [1, 2, 3];
const LONG_TYPES = new Set(["campo", "playing lesson", "field lesson"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function toMin(t: string): number {
  const [h, m = "0"] = String(t).split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function durOf(r: any): number {
  if (LONG_TYPES.has(String(r.lesson_type ?? "").trim().toLowerCase())) return 120;
  return Number(r.duration_minutes) > 0 ? Number(r.duration_minutes) : 60;
}
function hhmm(t: string): string {
  return String(t).slice(0, 5);
}
function parseUTC(d: string): Date {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const x = parseUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}
function mondayOf(d: string): string {
  const x = parseUTC(d);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return fmt(x);
}
function weeksBetween(a: string, b: string): number {
  return Math.round((parseUTC(mondayOf(b)).getTime() - parseUTC(mondayOf(a)).getTime()) / (7 * 86400000));
}
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
/** Two cadences (n1 from a1, n2 from a2) ever land on the same week? */
function cadencesCollide(n1: number, a1: string | null, n2: number, a2: string | null): boolean {
  const w1 = !a1 || n1 <= 1 ? 1 : n1;
  const w2 = !a2 || n2 <= 1 ? 1 : n2;
  if (w1 === 1 || w2 === 1) return true;
  const g = gcd(w1, w2);
  const diff = weeksBetween(a1!, a2!);
  return ((diff % g) + g) % g === 0;
}
/** Today's date in Cancún (fixed UTC-5). */
function todayCancun(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** First date strictly after today that falls on `weekday` (0=Sun). */
function firstOccurrence(weekday: number): string {
  const tomorrow = addDays(todayCancun(), 1);
  const dow = parseUTC(tomorrow).getUTCDay();
  return addDays(tomorrow, (weekday - dow + 7) % 7);
}

type Offer = { interval: number; phases: string[] };
type Window = {
  key: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string | null;
  fixed_slot_id: string | null;
  source: "open" | "alternating";
  offers: Offer[];
};

// deno-lint-ignore no-explicit-any
async function buildOffers(admin: any, studentId: string) {
  const { data: prof } = await admin.from("profiles").select("assigned_coach_id").eq("id", studentId).maybeSingle();
  const coachId = (prof?.assigned_coach_id as string | null) ?? DEFAULT_COACH_ID;
  const today = todayCancun();

  const [{ data: fixedRaw }, { data: recRaw }] = await Promise.all([
    admin
      .from("fixed_schedule_slots")
      .select("id, day_of_week, start_time, duration_minutes, lesson_type, student_id, is_available, coach_id, specific_date"),
    admin
      .from("recurring_lesson_slots")
      .select("id, student_id, weekday, start_time, duration_minutes, lesson_type, coach_id, interval_weeks, interval_anchor, ends_on")
      .eq("is_active", true),
  ]);
  const sameCoach = (r: any) => (r.coach_id ?? DEFAULT_COACH_ID) === coachId;
  const recurring = (recRaw || []).filter(
    (r: any) => sameCoach(r) && !(r.ends_on && String(r.ends_on).slice(0, 10) < today),
  );

  const windows = new Map<string, Window>();
  for (const f of fixedRaw || []) {
    if (!sameCoach(f) || f.specific_date || f.student_id != null || f.is_available !== true) continue;
    const key = `${f.day_of_week}|${hhmm(f.start_time)}`;
    if (!windows.has(key)) {
      windows.set(key, {
        key, weekday: f.day_of_week, start_time: hhmm(f.start_time), duration_minutes: durOf(f),
        lesson_type: f.lesson_type ?? null, fixed_slot_id: f.id, source: "open", offers: [],
      });
    }
  }
  for (const r of recurring) {
    if (!(Number(r.interval_weeks) > 1) || !r.interval_anchor) continue;
    const key = `${r.weekday}|${hhmm(r.start_time)}`;
    if (!windows.has(key)) {
      windows.set(key, {
        key, weekday: r.weekday, start_time: hhmm(r.start_time), duration_minutes: durOf(r),
        lesson_type: r.lesson_type ?? null, fixed_slot_id: null, source: "alternating", offers: [],
      });
    }
  }

  const mine: Array<{ weekday: number; start_time: string; interval: number; anchor: string | null }> = [];
  for (const r of recurring) {
    if (r.student_id === studentId) {
      mine.push({
        weekday: r.weekday, start_time: hhmm(r.start_time),
        interval: Number(r.interval_weeks) > 1 && r.interval_anchor ? Number(r.interval_weeks) : 1,
        anchor: r.interval_anchor ? String(r.interval_anchor).slice(0, 10) : null,
      });
    }
  }

  for (const w of windows.values()) {
    const s0 = toMin(w.start_time);
    const e0 = s0 + w.duration_minutes;
    const occupants = recurring.filter((r: any) => {
      if (r.weekday !== w.weekday) return false;
      const s = toMin(r.start_time);
      return s < e0 && s0 < s + durOf(r);
    });
    // A student who already holds this time gets no further offers here.
    if (occupants.some((r: any) => r.student_id === studentId)) continue;
    const first = firstOccurrence(w.weekday);
    for (const m of CADENCES) {
      if (w.source === "alternating" && m === 1) continue;
      const phases: string[] = [];
      for (let k = 0; k < m; k++) {
        const cand = addDays(first, 7 * k);
        const clash = occupants.some((r: any) =>
          cadencesCollide(m, m > 1 ? cand : null, Number(r.interval_weeks) || 1,
            r.interval_anchor ? String(r.interval_anchor).slice(0, 10) : null),
        );
        if (!clash) phases.push(cand);
      }
      if (phases.length) w.offers.push({ interval: m, phases });
    }
  }

  const list = [...windows.values()]
    .filter((w) => w.offers.length > 0)
    .sort((a, b) => a.weekday - b.weekday || toMin(a.start_time) - toMin(b.start_time));
  return { coachId, windows: list, mine };
}

/** Next date >= tomorrow on the same cadence phase as `start` (every `n` weeks). */
function rollForward(start: string, n: number): string {
  const tomorrow = addDays(todayCancun(), 1);
  let d = start;
  while (d < tomorrow) d = addDays(d, 7 * Math.max(1, n));
  return d;
}

// deno-lint-ignore no-explicit-any
async function notify(admin: any, userIds: string[], row: Record<string, unknown>) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await admin.from("notifications").insert(ids.map((user_id) => ({ user_id, ...row })));
  } catch (e) {
    console.warn("notification insert failed", e);
  }
}

// deno-lint-ignore no-explicit-any
async function adminIds(admin: any): Promise<string[]> {
  const { data } = await admin.from("user_roles").select("user_id").eq("role", "admin");
  return (data || []).map((a: any) => a.user_id);
}

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Active recurring slots of `coachId` overlapping (weekday, start, duration). */
// deno-lint-ignore no-explicit-any
async function occupantsFor(admin: any, coachId: string, weekday: number, start: string, duration: number) {
  const today = todayCancun();
  const { data } = await admin
    .from("recurring_lesson_slots")
    .select("id, student_id, weekday, start_time, duration_minutes, lesson_type, coach_id, interval_weeks, interval_anchor, ends_on")
    .eq("is_active", true)
    .eq("weekday", weekday);
  const s0 = toMin(start);
  const e0 = s0 + duration;
  return (data || []).filter((r: any) => {
    if ((r.coach_id ?? DEFAULT_COACH_ID) !== coachId) return false;
    if (r.ends_on && String(r.ends_on).slice(0, 10) < today) return false;
    const s = toMin(r.start_time);
    return s < e0 && s0 < s + durOf(r);
  });
}

// ── Email (Resend, same sender as notify-admin / send-notification-email) ──
const FROM = "Margea Golf Academy <admin@margeagolfacademy.com>";
const ADMIN_EMAIL = "admin@margeagolfacademy.com";
const SITE_URL = "https://www.margeagolfacademy.com";

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function dateEs(iso: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${meses[m - 1]} ${y}`;
}

async function sendEmail(to: string[], subject: string, title: string, rows: Array<[string, string]>, cta: { text: string; href: string }, intro = "") {
  const key = Deno.env.get("RESEND_API_KEY");
  const recipients = [...new Set(to.filter((e) => !!e && e.includes("@")).map((e) => e.trim().toLowerCase()))];
  if (!key || !recipients.length) return;
  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:rgba(245,240,232,0.6);font-size:13px;width:110px;">${esc(k)}</td><td style="padding:6px 0;color:#f5f0e8;font-size:14px;font-weight:600;">${esc(v)}</td></tr>`)
    .join("");
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0e2410;font-family:Arial,Helvetica,sans-serif;color:#f5f0e8;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e2410;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#1a2e1c;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;text-align:center;border-bottom:1px solid rgba(239,159,39,0.25);">
<p style="margin:0;color:#EF9F27;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Margea Golf Academy</p>
<h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;">${esc(title)}</h1></td></tr>
<tr><td style="padding:28px 32px;">
${intro ? `<p style="margin:0 0 16px;color:rgba(245,240,232,0.8);font-size:14px;line-height:1.6;">${esc(intro)}</p>` : ""}
<table role="presentation" width="100%" style="background:rgba(255,255,255,0.07);border:1px solid rgba(239,159,39,0.18);border-radius:12px;padding:14px 20px;">${rowsHtml}</table>
<div style="text-align:center;margin-top:24px;"><a href="${cta.href}" style="display:inline-block;background:#EF9F27;color:#000;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;font-size:14px;">${esc(cta.text)}</a></div>
</td></tr>
<tr><td style="padding:18px 32px;text-align:center;border-top:1px solid rgba(239,159,39,0.18);color:rgba(245,240,232,0.5);font-size:12px;">Margea Golf Academy · ${ADMIN_EMAIL}</td></tr>
</table></td></tr></table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, reply_to: ADMIN_EMAIL, to: recipients, subject, html }),
    });
    if (!res.ok) console.error("priority-spots email failed", await res.text());
  } catch (e) {
    console.warn("priority-spots email error", e);
  }
}

/** Owner inbox + the request's coach (when it isn't the owner). */
// deno-lint-ignore no-explicit-any
async function coachEmails(admin: any, coachId: string | null): Promise<string[]> {
  const out = [ADMIN_EMAIL];
  if (coachId && coachId !== DEFAULT_COACH_ID) {
    const { data } = await admin.from("profiles").select("email").eq("id", coachId).maybeSingle();
    if (data?.email) out.push(data.email);
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
    const callerId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = (await req.json().catch(() => ({}))) as any;
    const action = body?.action ?? "list";

    if (action === "list") {
      // Coaches/admins may list for a student they are previewing.
      let studentId = callerId;
      if (body?.studentId && body.studentId !== callerId) {
        const { data: roleRow } = await admin
          .from("user_roles").select("role").eq("user_id", callerId).in("role", ["admin", "coach"]).maybeSingle();
        if (roleRow) studentId = String(body.studentId);
      }
      const { windows, mine } = await buildOffers(admin, studentId);
      const { data: requests } = await admin
        .from("priority_spot_requests")
        .select("id, weekday, start_time, interval_weeks, start_date, status, created_at")
        .eq("student_id", studentId)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false })
        .limit(10);
      return json({ windows, mine, requests: requests || [] });
    }

    // ── Student: request a spot that isn't offered (day/time/cadence). ──
    if (action === "request") {
      const studentId = callerId;
      const { data: planRow } = await admin.rpc("get_effective_plan", { _user_id: studentId });
      if (!PAID_TIERS.includes(String(planRow ?? "free"))) {
        return json({ error: "plan_required", message: "A Scratch, Pro or Apex Level membership is required for a priority spot." }, 403);
      }
      const startDate = String(body?.start_date ?? "").slice(0, 10);
      const startTime = hhmm(String(body?.start_time ?? ""));
      const interval = Number(body?.interval);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(startTime) || !CADENCES.includes(interval)) {
        return json({ error: "invalid_request", message: "Invalid date, time or frequency." }, 400);
      }
      if (startDate <= todayCancun()) {
        return json({ error: "invalid_request", message: "Pick a start date from tomorrow on." }, 400);
      }
      const { data: prof } = await admin.from("profiles").select("assigned_coach_id, full_name, email").eq("id", studentId).maybeSingle();
      const coachId = (prof?.assigned_coach_id as string | null) ?? DEFAULT_COACH_ID;
      const weekday = parseUTC(startDate).getUTCDay();
      const { count } = await admin
        .from("priority_spot_requests").select("id", { count: "exact", head: true })
        .eq("student_id", studentId).eq("status", "pending");
      if ((count ?? 0) >= 3) {
        return json({ error: "too_many", message: "You already have 3 pending requests." }, 409);
      }
      const { data: reqRow, error: reqErr } = await admin
        .from("priority_spot_requests")
        .insert({
          student_id: studentId, coach_id: coachId, weekday, start_time: startTime,
          duration_minutes: 60, lesson_type: "Range", interval_weeks: interval, start_date: startDate,
          notes: body?.notes ? String(body.notes).slice(0, 500) : null,
        })
        .select("id")
        .single();
      if (reqErr) return json({ error: "request_failed", message: reqErr.message }, 500);
      const name = prof?.full_name || prof?.email || "A student";
      const cad = interval === 1 ? "weekly" : `every ${interval} weeks`;
      await notify(admin, [coachId, ...(await adminIds(admin))], {
        type: "priority_spot_request",
        title: "Priority spot request",
        message: `${name} requested ${DAYS_EN[weekday]} ${startTime} (${cad}, from ${startDate}).`,
        link: "/admin/fixed-schedule",
        metadata: { request_id: reqRow.id, student_id: studentId },
      });
      const cadEsReq = interval === 1 ? "Semanal" : `Cada ${interval} semanas`;
      const reqRows: Array<[string, string]> = [
        ["Alumno", name], ["Día", DAYS_ES[weekday]], ["Hora", time12(startTime)],
        ["Frecuencia", cadEsReq], ["Desde", dateEs(startDate)],
      ];
      if (body?.notes) reqRows.push(["Nota", String(body.notes).slice(0, 500)]);
      await Promise.all([
        sendEmail(await coachEmails(admin, coachId), `Solicitud de horario: ${name} · ${DAYS_ES[weekday]} ${time12(startTime)}`,
          "Nueva solicitud de horario", reqRows, { text: "Revisar solicitud", href: `${SITE_URL}/admin/fixed-schedule` },
          `${name} pidió un horario prioritario. Apruébalo o recházalo desde la app.`),
        sendEmail([prof?.email ?? ""], `Recibimos tu solicitud: ${DAYS_ES[weekday]} ${time12(startTime)}`,
          "Solicitud enviada", reqRows.filter(([k]) => k !== "Alumno"), { text: "Ver mis horarios", href: `${SITE_URL}/lessons/fixed-schedule` },
          "Tu Coach revisará tu solicitud y te avisaremos por correo y en la app."),
      ]);
      return json({ ok: true, id: reqRow.id });
    }

    // ── Student: cancel own pending request. ──
    if (action === "cancel_request") {
      await admin.from("priority_spot_requests")
        .update({ status: "cancelled", decided_at: new Date().toISOString() })
        .eq("id", String(body?.id ?? "")).eq("student_id", callerId).eq("status", "pending");
      return json({ ok: true });
    }

    // ── Coach/admin: list requests. ──
    if (action === "requests" || action === "decide") {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
      const isAdmin = (roles || []).some((r: any) => r.role === "admin");
      const isCoach = (roles || []).some((r: any) => r.role === "coach");
      if (!isAdmin && !isCoach) return json({ error: "forbidden" }, 403);

      if (action === "requests") {
        const coachScope = String(body?.coachId || callerId);
        let q = admin
          .from("priority_spot_requests")
          .select("id, student_id, coach_id, weekday, start_time, duration_minutes, lesson_type, interval_weeks, start_date, notes, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true });
        q = isAdmin && body?.coachId ? q.eq("coach_id", coachScope) : isAdmin ? q : q.eq("coach_id", callerId);
        const { data: reqs } = await q;
        const ids = [...new Set((reqs || []).map((r: any) => r.student_id))];
        const { data: profs } = ids.length
          ? await admin.from("profiles").select("id, full_name, email").in("id", ids)
          : { data: [] };
        const byId = new Map((profs || []).map((p: any) => [p.id, p]));
        const out = [];
        for (const r of reqs || []) {
          const start = rollForward(String(r.start_date).slice(0, 10), r.interval_weeks);
          const occ = await occupantsFor(admin, r.coach_id ?? DEFAULT_COACH_ID, r.weekday, hhmm(r.start_time), r.duration_minutes || 60);
          const conflicts = occ
            .filter((o: any) => o.student_id !== r.student_id &&
              cadencesCollide(r.interval_weeks, r.interval_weeks > 1 ? start : null, Number(o.interval_weeks) || 1,
                o.interval_anchor ? String(o.interval_anchor).slice(0, 10) : null))
            .map((o: any) => o.student_id);
          const { data: cprofs } = conflicts.length
            ? await admin.from("profiles").select("full_name, email").in("id", conflicts)
            : { data: [] };
          out.push({
            ...r,
            start_time: hhmm(r.start_time),
            effective_start: start,
            student_name: (byId.get(r.student_id) as any)?.full_name || (byId.get(r.student_id) as any)?.email || "",
            conflicts_with: (cprofs || []).map((p: any) => p.full_name || p.email),
          });
        }
        return json({ requests: out });
      }

      // decide
      const decision = String(body?.decision);
      const { data: r } = await admin.from("priority_spot_requests").select("*").eq("id", String(body?.id ?? "")).maybeSingle();
      if (!r || r.status !== "pending") return json({ error: "not_found", message: "Request not found or already decided." }, 404);
      if (!isAdmin && r.coach_id !== callerId) return json({ error: "forbidden" }, 403);
      const dayEs = DAYS_ES[r.weekday];
      const time = hhmm(r.start_time);
      const cadEs = r.interval_weeks === 1 ? "semanal" : `cada ${r.interval_weeks} semanas`;
      const { data: stuProf } = await admin.from("profiles").select("full_name, email").eq("id", r.student_id).maybeSingle();
      const stuName = stuProf?.full_name || stuProf?.email || "Alumno";
      const decisionEmails = async (approved: boolean, startIso: string) => {
        const rowsD: Array<[string, string]> = [
          ["Alumno", stuName], ["Día", DAYS_ES[r.weekday]], ["Hora", time12(time)],
          ["Frecuencia", cadEs.charAt(0).toUpperCase() + cadEs.slice(1)], [approved ? "Desde" : "Pedido desde", dateEs(startIso)],
        ];
        if (!approved && body?.note) rowsD.push(["Nota", String(body.note).slice(0, 500)]);
        const subj = approved
          ? `Horario aprobado: ${DAYS_ES[r.weekday]} ${time12(time)}`
          : `Solicitud no aprobada: ${DAYS_ES[r.weekday]} ${time12(time)}`;
        await Promise.all([
          sendEmail([stuProf?.email ?? ""], subj, approved ? "Tu horario fue aprobado" : "Tu solicitud no fue aprobada",
            rowsD.filter(([k]) => k !== "Alumno"), { text: "Ver mis horarios", href: `${SITE_URL}/lessons/fixed-schedule` },
            approved ? "Tu Coach aprobó tu horario prioritario. Tus clases ya están en tu calendario." : "Tu Coach no pudo aprobar este horario. Puedes pedir otro desde la app."),
          sendEmail(await coachEmails(admin, r.coach_id), `${subj} · ${stuName}`, approved ? "Horario aprobado" : "Solicitud rechazada",
            rowsD, { text: "Ver Lugar Prioritario", href: `${SITE_URL}/admin/fixed-schedule` }),
        ]);
      };

      if (decision === "reject") {
        await admin.from("priority_spot_requests").update({
          status: "rejected", decided_by: callerId, decided_at: new Date().toISOString(),
          decision_note: body?.note ? String(body.note).slice(0, 500) : null,
        }).eq("id", r.id).eq("status", "pending");
        await notify(admin, [r.student_id], {
          type: "priority_spot_request",
          title: "Solicitud de horario",
          message: `Tu Coach no pudo aprobar ${dayEs} ${time} (${cadEs}).${body?.note ? " " + String(body.note).slice(0, 200) : ""}`,
          link: "/lessons/fixed-schedule",
          metadata: { request_id: r.id, status: "rejected" },
        });
        await decisionEmails(false, String(r.start_date).slice(0, 10));
        return json({ ok: true, status: "rejected" });
      }
      if (decision !== "approve") return json({ error: "invalid_request" }, 400);

      const coachId = r.coach_id ?? DEFAULT_COACH_ID;
      const start = rollForward(String(r.start_date).slice(0, 10), r.interval_weeks);
      const occ = await occupantsFor(admin, coachId, r.weekday, time, r.duration_minutes || 60);
      const clash = occ.find((o: any) =>
        cadencesCollide(r.interval_weeks, r.interval_weeks > 1 ? start : null, Number(o.interval_weeks) || 1,
          o.interval_anchor ? String(o.interval_anchor).slice(0, 10) : null));
      if (clash) {
        return json({ error: "conflict", message: "That time now overlaps another student's recurring schedule." }, 409);
      }
      const { data: ins, error: insErr } = await admin.from("recurring_lesson_slots").insert({
        student_id: r.student_id, weekday: r.weekday, start_time: time,
        duration_minutes: r.duration_minutes || 60, lesson_type: r.lesson_type, is_active: true,
        coach_id: coachId, starts_on: start, interval_weeks: r.interval_weeks,
        interval_anchor: r.interval_weeks > 1 ? start : null, notes: "From Priority Spot request",
      }).select("id").single();
      if (insErr) return json({ error: "approve_failed", message: insErr.message }, 500);
      // A weekly approval takes a matching open spot so it isn't offered twice.
      if (r.interval_weeks === 1) {
        await admin.from("fixed_schedule_slots")
          .update({ student_id: r.student_id, is_available: false, claimed_at: new Date().toISOString() })
          .eq("day_of_week", r.weekday).eq("start_time", time).eq("coach_id", coachId)
          .is("student_id", null).is("specific_date", null);
      }
      await admin.from("priority_spot_requests").update({
        status: "approved", decided_by: callerId, decided_at: new Date().toISOString(),
        recurring_slot_id: ins.id, start_date: start,
      }).eq("id", r.id);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/generate-recurring-lessons`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ student_id: r.student_id }),
        });
      } catch (e) {
        console.warn("generate-recurring-lessons failed", e);
      }
      await notify(admin, [r.student_id], {
        type: "priority_spot_request",
        title: "Horario aprobado",
        message: `Tu Coach aprobó tu horario: ${dayEs} ${time} (${cadEs}), desde el ${start}.`,
        link: "/lessons/fixed-schedule",
        metadata: { request_id: r.id, status: "approved", recurring_slot_id: ins.id },
      });
      await decisionEmails(true, start);
      return json({ ok: true, status: "approved", start });
    }

    if (action !== "claim") return json({ error: "Unknown action" }, 400);

    const studentId = callerId;
    const { data: planRow } = await admin.rpc("get_effective_plan", { _user_id: studentId });
    if (!PAID_TIERS.includes(String(planRow ?? "free"))) {
      return json({ error: "plan_required", message: "A Scratch, Pro or Apex Level membership is required for a priority spot." }, 403);
    }

    const weekday = Number(body?.weekday);
    const startTime = hhmm(String(body?.start_time ?? ""));
    const interval = Number(body?.interval);
    let phases: string[] = Array.isArray(body?.phases) ? body.phases.map((p: any) => String(p).slice(0, 10)) : [];
    if (!CADENCES.includes(interval) || (interval > 1 && !phases.length) || phases.length > interval) {
      return json({ error: "invalid_request", message: "Invalid frequency or start date." }, 400);
    }

    const { coachId, windows } = await buildOffers(admin, studentId);
    const w = windows.find((x) => x.weekday === weekday && x.start_time === startTime);
    const offer = w?.offers.find((o) => o.interval === interval);
    // Weekly claims without a date start on the first available occurrence.
    if (interval === 1 && !phases.length && offer) phases = [offer.phases[0]];
    if (!w || !offer || !phases.every((p) => offer.phases.includes(p))) {
      return json({ error: "taken", message: "That spot is no longer available. Please pick another." }, 409);
    }

    const rows = [...new Set(phases)].map((p) => ({
      student_id: studentId,
      weekday: w.weekday,
      start_time: w.start_time,
      duration_minutes: w.duration_minutes,
      lesson_type: w.lesson_type,
      is_active: true,
      coach_id: coachId,
      starts_on: p,
      interval_weeks: interval,
      interval_anchor: interval > 1 ? p : null,
      notes: "From Priority Spot claim",
    }));

    // Weekly claim of an open spot: take the spot itself (atomic).
    if (interval === 1 && w.fixed_slot_id) {
      const { data: took } = await admin
        .from("fixed_schedule_slots")
        .update({ student_id: studentId, is_available: false, claimed_at: new Date().toISOString() })
        .eq("id", w.fixed_slot_id)
        .is("student_id", null)
        .eq("is_available", true)
        .select("id")
        .maybeSingle();
      if (!took) return json({ error: "taken", message: "That spot was just taken. Please pick another." }, 409);
    }

    const { data: inserted, error: insErr } = await admin.from("recurring_lesson_slots").insert(rows).select("id");
    if (insErr) {
      if (interval === 1 && w.fixed_slot_id) {
        await admin.from("fixed_schedule_slots")
          .update({ student_id: null, is_available: true, claimed_at: null })
          .eq("id", w.fixed_slot_id).eq("student_id", studentId);
      }
      console.error("priority-spots insert failed", insErr);
      return json({ error: "claim_failed", message: insErr.message }, 500);
    }

    // Generate lessons with the shared generator (package budget rules apply).
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/generate-recurring-lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ student_id: studentId }),
      });
    } catch (e) {
      console.warn("generate-recurring-lessons failed", e);
    }

    // In-app notification for the admins (same as the old claim trigger).
    try {
      const { data: stu } = await admin.from("profiles").select("full_name, email").eq("id", studentId).maybeSingle();
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const cad = interval === 1 ? "weekly" : `every ${interval} weeks`;
      const name = stu?.full_name || stu?.email || "A student";
      const notes = (admins || []).map((a: any) => ({
        user_id: a.user_id,
        type: "fixed_schedule_claim",
        title: "Fixed Schedule spot claimed",
        message: `${name} has booked the ${days[w.weekday]} ${w.start_time} spot (${cad}, from ${phases.slice().sort()[0]}).`,
        link: "/admin/fixed-schedule",
        metadata: {
          student_id: studentId, day_of_week: w.weekday, start_time: w.start_time,
          interval_weeks: interval, phases, recurring_slot_ids: (inserted || []).map((r: any) => r.id),
        },
      }));
      if (notes.length) await admin.from("notifications").insert(notes);
    } catch (e) {
      console.warn("admin notification failed", e);
    }

    return json({ ok: true, weekday: w.weekday, start_time: w.start_time, interval, phases });
  } catch (err: any) {
    console.error("priority-spots error", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
