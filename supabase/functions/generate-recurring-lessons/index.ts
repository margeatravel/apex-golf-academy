// Generates recurring lessons based strictly on each student's package capacity.
// - Slots WITHOUT a package_id only generate when the caller explicitly opts in
//   via { include_no_package: true } (the manual "Generate now" buttons). They
//   then generate occurrences for NO_PACKAGE_WEEKS_AHEAD weeks ahead.
// - Slots WITH a package_id generate exactly `classes_remaining` future occurrences
//   (minus already-scheduled future lessons for that package), one per week.
// Idempotent: skips if a lesson already exists for the same student at the same date+time.
// Prunes excess auto-generated future lessons before regenerating so the queue tracks the package.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Safety cap so a misconfigured package can never spin forever.
const HARD_MAX_WEEKS = 104;
// How many weeks ahead to generate lessons for recurring slots WITHOUT a package
// when the caller opts in (manual "Generate now"). Long horizon so the spot
// stays populated until the admin cancels the recurring slot.
const NO_PACKAGE_WEEKS_AHEAD = 104;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function mondayOf(dateStr: string) {
  const [y, m, d] = dateStr.substring(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return fmtDate(dt);
}

function isCadenceWeek(dateStr: string, anchor: string | null | undefined, n: number | null | undefined) {
  if (!n || n <= 1 || !anchor) return true;
  const a = Date.parse(`${mondayOf(String(anchor))}T00:00:00Z`);
  const b = Date.parse(`${mondayOf(dateStr)}T00:00:00Z`);
  const weeks = Math.round((b - a) / (7 * 86400000));
  return weeks >= 0 && weeks % n === 0;
}

function firstOccurrenceOnOrAfter(base: Date, weekday: number) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// Who takes a lesson generated from this slot: the slot's predetermined
// attendees (attendee_ids), or just the slot's student when none are set.
// One lesson row = 1 package credit no matter how many attend together.
function slotAttendeeIds(slot: any): string[] {
  const ids = Array.isArray(slot?.attendee_ids)
    ? slot.attendee_ids.filter((x: any) => typeof x === "string")
    : [];
  const unique = Array.from(new Set(ids)) as string[];
  return unique.length > 0 ? unique : [slot.student_id];
}

async function insertLessonAttendees(supabase: any, lessonId: string, attendeeIds: string[]) {
  if (!lessonId || attendeeIds.length === 0) return;
  const { error } = await supabase
    .from("lesson_attendees")
    .insert(attendeeIds.map((id) => ({ lesson_id: lessonId, student_id: id })));
  if (error) console.error("[generate-recurring-lessons] lesson_attendees insert failed:", error);
}

// Keep an already-generated lesson's attendees in sync with its slot: when
// the coach changes who a spot is for, the next generation run updates the
// future lessons instead of leaving them with the old attendees.
async function syncLessonAttendees(supabase: any, lessonId: string, attendeeIds: string[]) {
  if (!lessonId) return;
  const { data: rows } = await supabase
    .from("lesson_attendees")
    .select("student_id")
    .eq("lesson_id", lessonId);
  const current = new Set<string>((rows ?? []).map((r: any) => r.student_id as string));
  const wanted = new Set(attendeeIds);
  const toAdd = attendeeIds.filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !wanted.has(id));
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("lesson_attendees")
      .insert(toAdd.map((id) => ({ lesson_id: lessonId, student_id: id })));
    if (error) console.error("[generate-recurring-lessons] lesson_attendees sync insert failed:", error);
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("lesson_attendees")
      .delete()
      .eq("lesson_id", lessonId)
      .in("student_id", toRemove);
    if (error) console.error("[generate-recurring-lessons] lesson_attendees sync delete failed:", error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Authorization: accept (a) the service role key (manual/admin calls),
    // (b) the internal cron token stored in public.internal_cron_tokens
    // (pg_cron), or (c) a signed-in admin/coach user JWT — the admin UI
    // (AssignSpotModal) calls this function with the coach's session token,
    // so staff JWTs must be accepted here. Without this check, anyone on
    // the internet could trigger lesson generation.
    // NOTE: this function runs with verify_jwt = false (see config.toml) so
    // the pg_cron bearer token (not a JWT) reaches this code.
    // Same pattern as send-daily-lesson-reminders/index.ts.
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let authorized = authHeader === `Bearer ${serviceKey}`;
    if (!authorized && authHeader.startsWith("Bearer ")) {
      const presented = authHeader.slice(7).trim();
      if (presented) {
        const { data: tokenRow } = await supabase
          .from("internal_cron_tokens")
          .select("token")
          .eq("name", "generate_recurring_lessons")
          .maybeSingle();
        if (tokenRow?.token && tokenRow.token === presented) authorized = true;
      }
    }
    // (c) Staff user JWT: validate the session and require an admin/coach role.
    if (!authorized && authHeader.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        anonKey,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .in("role", ["admin", "coach"])
          .maybeSingle();
        if (roleRow) authorized = true;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let studentId: string | null = null;
    let includeNoPackage = false;
    let materializeSlotId: string | null = null;
    let materializeDate: string | null = null;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.student_id === "string") {
          studentId = body.student_id;
        }
        if (body && body.include_no_package === true) {
          includeNoPackage = true;
        }
        if (body && typeof body.materialize_slot_id === "string") {
          materializeSlotId = body.materialize_slot_id;
        }
        if (body && typeof body.materialize_date === "string") {
          materializeDate = body.materialize_date;
        }
      }
    } catch (_e) {
      // ignore
    }

    // ── Single-occurrence materialization ────────────────────────────────
    // Turns ONE projected recurring occurrence into a concrete `lessons` row,
    // using exactly the same field set, idempotency checks and package-budget
    // rules as the bulk generator below. Used by Today's Schedule / calendar
    // actions when the coach acts on a projection that has no row yet.
    if (materializeSlotId && materializeDate) {
      const { data: slot, error: slotErr } = await supabase
        .from("recurring_lesson_slots")
        .select("*")
        .eq("id", materializeSlotId)
        .maybeSingle();
      if (slotErr) throw slotErr;
      if (!slot) {
        return new Response(
          JSON.stringify({ ok: false, error: "Recurring slot not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      if (!isCadenceWeek(materializeDate, slot.interval_anchor, slot.interval_weeks)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Not a cadence week" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const timeStr =
        typeof slot.start_time === "string"
          ? slot.start_time.length >= 8
            ? slot.start_time.substring(0, 8)
            : `${slot.start_time}:00`
          : "00:00:00";

      // Idempotency — identical checks to the bulk path.
      const { data: sameDayForSlot, error: sameDayErr } = await supabase
        .from("lessons")
        .select("id")
        .eq("recurring_slot_id", slot.id)
        .eq("lesson_date", materializeDate)
        .limit(1);
      if (sameDayErr) throw sameDayErr;
      if (sameDayForSlot && sameDayForSlot.length > 0) {
        return new Response(
          JSON.stringify({ ok: true, lesson_id: sameDayForSlot[0].id, created: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      const { data: existing, error: existsErr } = await supabase
        .from("lessons")
        .select("id")
        .eq("student_id", slot.student_id)
        .eq("lesson_date", materializeDate)
        .eq("lesson_time", timeStr)
        .limit(1);
      if (existsErr) throw existsErr;
      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ ok: true, lesson_id: existing[0].id, created: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      // Package budget — same criterion as the bulk generator: a package that
      // is inactive, draft or without remaining capacity does not get consumed;
      // the lesson is then created without a package link.
      let pkgId: string | null = slot.package_id ?? null;
      if (pkgId) {
        const { data: pkg } = await supabase
          .from("class_packages")
          .select("package_size, classes_remaining, classes_used, is_active, is_paused, is_archived, ar_status")
          .eq("id", pkgId)
          .maybeSingle();
        // A PAUSED package never receives new lessons.
        let usable =
          !!pkg && pkg.is_active === true && pkg.is_paused !== true && pkg.is_archived !== true &&
          pkg.ar_status !== "draft";
        if (usable) {
          const { count: allScheduledCount } = await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("package_id", pkgId)
            .eq("status", "scheduled")
            .eq("skipped", false);
          const { count: completedCount } = await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("package_id", pkgId)
            .in("status", ["completed", "no_show"]);
          // Capacity is the package SIZE (mirror of computePackageCounts);
          // the persisted classes_remaining can lag behind and must not decide.
          const totalCapacity = (pkg!.package_size ?? 0) > 0
            ? (pkg!.package_size ?? 0)
            : (pkg!.classes_remaining ?? 0) + (pkg!.classes_used ?? 0);
          const used = (allScheduledCount ?? 0) + (completedCount ?? 0);
          usable = totalCapacity - used > 0;
        }
        if (!usable) pkgId = null;
      }

      const { data: insertedRow, error: insErr } = await supabase
        .from("lessons")
        .insert({
          student_id: slot.student_id,
          lesson_date: materializeDate,
          lesson_time: timeStr,
          duration_minutes: slot.duration_minutes ?? 60,
          lesson_type: slot.lesson_type ?? "Range",
          status: "scheduled",
          package_id: pkgId,
          recurring_slot_id: slot.id,
          auto_generated: true,
          currency: "MXN",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      await insertLessonAttendees(supabase, insertedRow.id, slotAttendeeIds(slot));

      return new Response(
        JSON.stringify({ ok: true, lesson_id: insertedRow.id, created: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }


    // Fetch active slots
    let q = supabase.from("recurring_lesson_slots").select("*").eq("is_active", true);
    if (studentId) q = q.eq("student_id", studentId);
    const { data: slots, error: slotsErr } = await q;
    if (slotsErr) throw slotsErr;

    // "Today" in America/Cancun (UTC-5, no DST) — same wall-clock basis used by
    // lesson_date and by scheduled-move effective dates.
    const today = new Date(Date.now() - 5 * 60 * 60 * 1000);
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = fmtDate(today);

    // ── Scheduled moves ────────────────────────────────────────────────────
    // A slot can carry a pending day/time that takes effect on a given date.
    // Once that date has arrived, the pending schedule becomes the base one.
    let promotedMoves = 0;
    for (const s of (slots ?? []) as any[]) {
      const eff = s.pending_effective_date
        ? String(s.pending_effective_date).substring(0, 10)
        : null;
      if (!eff || s.pending_weekday === null || s.pending_weekday === undefined || !s.pending_start_time) {
        continue;
      }
      if (eff > todayStr) continue;
      const newTime = String(s.pending_start_time).length >= 8
        ? String(s.pending_start_time).substring(0, 8)
        : `${String(s.pending_start_time)}:00`;
      const { error: promoteErr } = await supabase
        .from("recurring_lesson_slots")
        .update({
          weekday: s.pending_weekday,
          start_time: newTime,
          pending_weekday: null,
          pending_start_time: null,
          pending_effective_date: null,
          pending_wipe: false,
          ...(s.pending_lesson_type
            ? {
                duration_minutes: s.pending_duration_minutes ?? s.duration_minutes,
                lesson_type: s.pending_lesson_type,
                package_id: s.pending_package_id ?? null,
                no_package_intentional: s.pending_no_package_intentional === true,
              }
            : {}),
          ...(s.pending_interval_weeks != null
            ? { interval_weeks: s.pending_interval_weeks, interval_anchor: s.pending_interval_anchor ?? null }
            : {}),
          pending_interval_weeks: null,
          pending_interval_anchor: null,
          pending_duration_minutes: null,
          pending_lesson_type: null,
          pending_package_id: null,
          pending_no_package_intentional: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (promoteErr) {
        console.error("[generate-recurring-lessons] promote error:", promoteErr);
        continue;
      }
      s.weekday = s.pending_weekday;
      s.start_time = newTime;
      s.pending_weekday = null;
      s.pending_start_time = null;
      s.pending_effective_date = null;
      s.pending_wipe = false;
      if (s.pending_lesson_type) {
        s.duration_minutes = s.pending_duration_minutes ?? s.duration_minutes;
        s.lesson_type = s.pending_lesson_type;
        s.package_id = s.pending_package_id ?? null;
        s.no_package_intentional = s.pending_no_package_intentional === true;
      }
      s.pending_lesson_type = null;
      if (s.pending_interval_weeks != null) {
        s.interval_weeks = s.pending_interval_weeks;
        s.interval_anchor = s.pending_interval_anchor ?? null;
      }
      s.pending_interval_weeks = null;
      s.pending_interval_anchor = null;
      promotedMoves++;
    }

    let inserted = 0;
    let skipped = 0;
    let capped = 0;
    let pruned = 0;
    let noPackageGenerated = 0;
    const exhaustedPackages = new Set<string>();

    // The package linked to a recurring slot is an explicit administrative
    // decision. Generation may stop when that package has no capacity, but it
    // must never repoint or clear recurring_lesson_slots.package_id.

    // ── Step 1: Reset auto-generated future occurrences for active slots ──
    // We delete every auto-generated, non-skipped, future scheduled lesson that
    // came from one of the active recurring slots. Step 2 then regenerates them
    // in date order so today / near-term always wins the package cap over
    // farther-out occurrences. We preserve:
    //   - skipped lessons (admin overrides)
    //   - manual lessons (auto_generated = false)
    //   - lessons from inactive / removed slots (so we don't surprise-delete)
    // Only reset slots we're about to regenerate. Otherwise a no-package
    // generate-skip would wipe lessons we don't intend to recreate.
    const slotsToProcess = (slots ?? []).filter(
      (s: any) =>
        s.no_package_intentional !== true &&
        (s.package_id || includeNoPackage),
    );
    const resetSlotIds = slotsToProcess.map((s: any) => s.id).filter(Boolean);
    if (resetSlotIds.length > 0) {
      const { data: toReset, error: resetSelErr } = await supabase
        .from("lessons")
        .select("id")
        .in("recurring_slot_id", resetSlotIds)
        .eq("status", "scheduled")
        .eq("auto_generated", true)
        .eq("skipped", false)
        .gte("lesson_date", todayStr);
      if (resetSelErr) throw resetSelErr;
      const ids = (toReset ?? []).map((l: any) => l.id);
      if (ids.length > 0) {
        const { error: delErr } = await supabase
          .from("lessons")
          .delete()
          .in("id", ids);
        if (delErr) {
          console.error("[generate-recurring-lessons] reset error:", delErr);
        } else {
          pruned += ids.length;
        }
      }
    }

    // ── Step 2: Generate new lessons, processing candidates in date order ──
    // Expand each slot week-by-week. Slots without a package generate nothing.
    // For slots with a package, we generate exactly `classes_remaining`
    // future occurrences (across all slots sharing that package, near-term first).
    type Candidate = {
      slot: any;
      dateStr: string;
      timeStr: string;
      duration: number;
      lessonType: string;
      packageId: string | null;
      noPkgIntentional: boolean;
    };
    const normTime = (t: unknown) =>
      typeof t === "string"
        ? (t.length >= 8 ? t.substring(0, 8) : `${t}:00`)
        : "00:00:00";

    const candidates: Candidate[] = [];
    for (const slot of slotsToProcess) {
      // No-package slots only run when opted-in; package slots use the hard cap.
      const weeksToGenerate = slot.package_id ? HARD_MAX_WEEKS : NO_PACKAGE_WEEKS_AHEAD;

      const pendingEff = slot.pending_effective_date
        ? String(slot.pending_effective_date).substring(0, 10)
        : null;
      const hasPending =
        !!pendingEff &&
        slot.pending_weekday !== null &&
        slot.pending_weekday !== undefined &&
        !!slot.pending_start_time;

      // Streams: the current schedule owns dates BEFORE the effective date,
      // the pending schedule owns dates FROM the effective date onwards.
      // pending_wipe = the admin chose to clear scheduled lessons: nothing is
      // generated before the effective date, only the new schedule from it on.
      const wipeBefore = hasPending && slot.pending_wipe === true;
      type StreamFields = { duration: number; lessonType: string; packageId: string | null; noPkgIntentional: boolean };
      const baseFields: StreamFields = {
        duration: slot.duration_minutes ?? 60,
        lessonType: slot.lesson_type ?? "Range",
        packageId: slot.package_id ?? null,
        noPkgIntentional: slot.no_package_intentional === true,
      };
      // New leg carries its own duration/type/package when they were scheduled.
      const pendingFields: StreamFields = slot.pending_lesson_type
        ? {
            duration: slot.pending_duration_minutes ?? baseFields.duration,
            lessonType: slot.pending_lesson_type,
            packageId: slot.pending_package_id ?? null,
            noPkgIntentional: slot.pending_no_package_intentional === true,
          }
        : baseFields;
      const streams: Array<{ weekday: number; timeStr: string; from: string | null; until: string | null; n: number; anchor: string | null } & StreamFields> = [];
      if (!wipeBefore) {
        streams.push({
          weekday: slot.weekday,
          timeStr: normTime(slot.start_time),
          from: null,
          until: hasPending ? pendingEff : null,
          n: slot.interval_weeks ?? 1,
          anchor: slot.interval_anchor ?? null,
          ...baseFields,
        });
      }
      if (hasPending) {
        streams.push({
          weekday: Number(slot.pending_weekday),
          timeStr: normTime(slot.pending_start_time),
          from: pendingEff,
          until: null,
          n: slot.pending_interval_weeks ?? slot.interval_weeks ?? 1,
          anchor: slot.pending_interval_anchor ?? slot.interval_anchor ?? null,
          ...pendingFields,
        });
      }

      // Optional first date for the whole slot ("Starting from"): nothing is
      // generated before it, on either stream.
      const startsOn = slot.starts_on
        ? String(slot.starts_on).substring(0, 10)
        : null;
      // "Pause until": nothing is generated before paused_until (exclusive end).
      const pausedUntil = slot.paused_until
        ? String(slot.paused_until).substring(0, 10)
        : null;
      // "Ends on": temporary spots generate nothing on or after ends_on.
      const endsOn = slot.ends_on
        ? String(slot.ends_on).substring(0, 10)
        : null;

      for (const stream of streams) {
        let cursor = firstOccurrenceOnOrAfter(today, stream.weekday);
        for (let w = 0; w < weeksToGenerate; w++) {
          const dateStr = fmtDate(cursor);
          const beforeStart = (startsOn !== null && dateStr < startsOn) ||
            (pausedUntil !== null && dateStr < pausedUntil);
          const beforeWindow = beforeStart ||
            (stream.from !== null && dateStr < stream.from);
          const afterWindow = (stream.until !== null && dateStr >= stream.until) ||
            (endsOn !== null && dateStr >= endsOn);
          if (!beforeWindow && !afterWindow && isCadenceWeek(dateStr, stream.anchor, stream.n)) {
            candidates.push({
              slot,
              dateStr,
              timeStr: stream.timeStr,
              duration: stream.duration,
              lessonType: stream.lessonType,
              packageId: stream.packageId,
              noPkgIntentional: stream.noPkgIntentional,
            });
          }
          cursor = new Date(cursor);
          cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
      }
    }
    candidates.sort((a, b) =>
      (a.dateStr + a.timeStr).localeCompare(b.dateStr + b.timeStr),
    );

    // Per-package remaining cap, lazily loaded.
    const packageCap = new Map<string, number>(); // remaining slots we can still create
    const packageDead = new Set<string>(); // inactive / zero-remaining packages

    async function loadCap(pkgId: string): Promise<number | null> {
      if (packageDead.has(pkgId)) return 0;
      if (packageCap.has(pkgId)) return packageCap.get(pkgId)!;
      const { data: pkg, error: pkgErr } = await supabase
        .from("class_packages")
        .select("package_size, classes_remaining, classes_used, is_active, is_paused, is_archived, ar_status")
        .eq("id", pkgId)
        .maybeSingle();
      if (pkgErr) throw pkgErr;
      if (!pkg || !pkg.is_active || pkg.is_paused === true || pkg.is_archived === true || pkg.ar_status === 'draft') {
        packageDead.add(pkgId);
        return 0;
      }
      const { count: scheduledCount, error: cntErr } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkgId)
        .eq("status", "scheduled")
        .eq("skipped", false)
        .gte("lesson_date", todayStr);
      if (cntErr) throw cntErr;
      // Count ALL scheduled lessons (past+future) and completed lessons against
      // the package's total capacity. Never let scheduled+completed exceed
      // classes_remaining + classes_used.
      const { count: allScheduledCount, error: allSchedErr } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkgId)
        .eq("status", "scheduled")
        .eq("skipped", false)
        .gte("lesson_date", todayStr);
      if (allSchedErr) throw allSchedErr;
      const { count: completedCount, error: doneErr } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("package_id", pkgId)
        .in("status", ["completed", "no_show"]);
      if (doneErr) throw doneErr;
      // Capacity = package SIZE − (all scheduled + completed/no_show), the
      // same per-package formula computePackageCounts uses on the client.
      // The stale classes_remaining column is no longer the gate — it is what
      // made an older package with free classes look exhausted so new lessons
      // rolled into the newest package.
      const totalCapacity = (pkg.package_size ?? 0) > 0
        ? (pkg.package_size ?? 0)
        : (pkg.classes_remaining ?? 0) + (pkg.classes_used ?? 0);
      const used = (allScheduledCount ?? 0) + (completedCount ?? 0);
      const cap = Math.max(totalCapacity - used, 0);
      packageCap.set(pkgId, cap);
      return cap;
    }

    // Per-student FIFO queue of active packages (oldest created_at first).
    // Used to roll a candidate over to the next package when its current
    // package is exhausted, so multiple active packages get consumed in order.
    const studentPackageQueue = new Map<string, string[]>();
    async function getStudentQueue(studentId: string): Promise<string[]> {
      if (studentPackageQueue.has(studentId)) {
        return studentPackageQueue.get(studentId)!;
      }
      const { data: pkgs, error: qErr } = await supabase
        .from("class_packages")
        .select("id")
        .eq("user_id", studentId)
        .eq("is_active", true)
        .eq("is_paused", false)
        .eq("is_archived", false)
        .neq("ar_status", "draft")
        .order("created_at", { ascending: true });
      if (qErr) {
        console.error("[generate-recurring-lessons] queue error:", qErr);
        studentPackageQueue.set(studentId, []);
        return [];
      }
      const ids = (pkgs ?? []).map((p: any) => p.id);
      studentPackageQueue.set(studentId, ids);
      return ids;
    }

    async function nextAvailablePackage(
      studentId: string,
      currentPkgId: string | null,
    ): Promise<string | null> {
      const queue = await getStudentQueue(studentId);
      // Ensure current pkg is in the queue (it may be the slot's linked pkg
      // even if it wasn't returned by the active query above due to races).
      const ordered = currentPkgId && !queue.includes(currentPkgId)
        ? [currentPkgId, ...queue]
        : queue;
      // Strict FIFO: the OLDEST active, non-paused package with free capacity
      // always wins — never the package the slot happens to point at today.
      // This is what caused new lessons to pile onto the newest package while
      // an older one still had classes ("Agendadas de más").
      for (const id of ordered) {
        const cap = await loadCap(id);
        if (cap !== null && cap > 0) return id;
        if (cap === 0) exhaustedPackages.add(id);
      }
      return null;
    }

    for (const c of candidates) {
      const { slot, dateStr, timeStr } = c;
      let pkgId: string | null = c.packageId;

      // For package-linked slots, enforce remaining capacity — rolling
      // over to the next FIFO active package for this student when the
      // current one is exhausted. This lets multiple active packages be
      // consumed in created_at order.
      if (pkgId && slot.student_id) {
        const cap = await loadCap(pkgId);
        if (cap === null || cap <= 0) {
          if (cap === 0) exhaustedPackages.add(pkgId);
          const next = await nextAvailablePackage(slot.student_id, pkgId);
          if (!next) {
            capped++;
            continue;
          }
          pkgId = next;
        }
      }

      // Slots with no package (and NOT the intentional "will pay later"
      // override) also consume package capacity: only create the lesson while
      // a counting package still has free classes.
      if (!pkgId && slot.student_id && c.noPkgIntentional !== true) {
        const next = await nextAvailablePackage(slot.student_id, null);
        if (!next) {
          capped++;
          continue;
        }
        pkgId = next;
      }

      const { data: existing, error: existsErr } = await supabase
        .from("lessons")
        .select("id")
        .eq("student_id", slot.student_id)
        .eq("lesson_date", dateStr)
        .eq("lesson_time", timeStr)
        .limit(1);
      if (existsErr) throw existsErr;

      if (existing && existing.length > 0) {
        await syncLessonAttendees(supabase, existing[0].id, slotAttendeeIds(slot));
        skipped++;
        continue;
      }

      // Also skip if ANY lesson already exists for this slot on this date —
      // regardless of time. This covers single-occurrence edits where an admin
      // moved that day's lesson to a different time (auto_generated=false).
      // Without this, the generator would insert a fresh lesson at the slot's
      // original time, duplicating the occurrence.
      // Same for an occurrence moved to another day of the same Mon–Sun week.
      const _d = new Date(`${dateStr}T12:00:00Z`);
      const _off = (_d.getUTCDay() + 6) % 7;
      const _mon = new Date(_d.getTime() - _off * 86400000).toISOString().slice(0, 10);
      const _sun = new Date(_d.getTime() + (6 - _off) * 86400000).toISOString().slice(0, 10);
      const { data: sameDayForSlot, error: sameDayErr } = await supabase
        .from("lessons")
        .select("id")
        .eq("recurring_slot_id", slot.id)
        .gte("lesson_date", _mon)
        .lte("lesson_date", _sun)
        .limit(1);
      if (sameDayErr) throw sameDayErr;
      if (sameDayForSlot && sameDayForSlot.length > 0) {
        await syncLessonAttendees(supabase, sameDayForSlot[0].id, slotAttendeeIds(slot));
        skipped++;
        continue;
      }

      const { data: insertedRow, error: insErr } = await supabase.from("lessons").insert({
        student_id: slot.student_id,
        lesson_date: dateStr,
        lesson_time: timeStr,
        duration_minutes: c.duration,
        lesson_type: c.lessonType,
        status: "scheduled",
        package_id: pkgId,
        recurring_slot_id: slot.id,
        auto_generated: true,
        currency: "MXN",
      }).select("id").single();
      if (insErr) {
        console.error("[generate-recurring-lessons] insert error:", insErr);
        continue;
      }
      await insertLessonAttendees(supabase, insertedRow.id, slotAttendeeIds(slot));
      inserted++;
      if (pkgId) {
        const cur = packageCap.get(pkgId) ?? 0;
        packageCap.set(pkgId, cur - 1);
      } else {
        noPackageGenerated++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        slots_processed: slots?.length ?? 0,
        inserted,
        skipped,
        capped,
        pruned,
        no_package_generated: noPackageGenerated,
        slots_repointed: 0,
        promoted_moves: promotedMoves,
        exhausted_packages: Array.from(exhaustedPackages),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("[generate-recurring-lessons] error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
