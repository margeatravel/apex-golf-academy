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
      return json({ windows, mine });
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
