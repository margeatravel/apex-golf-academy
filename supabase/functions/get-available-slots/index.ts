import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Cancun"; // fixed UTC-5

/**
 * Build a UTC Date from a Cancún wall-clock date+time.
 * Cancún has no DST and is permanently UTC-5.
 */
function cancunWallToUtc(dateStr: string, timeStr: string): Date {
  // dateStr "YYYY-MM-DD", timeStr "HH:MM" or "HH:MM:SS"
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${dateStr}T${t}-05:00`);
}

/** Day-of-week (0=Sun..6=Sat) in Cancún for a "YYYY-MM-DD" date string */
function cancunWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00-05:00`);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate"); // YYYY-MM-DD (Cancún)
    const endDate = url.searchParams.get("endDate");     // YYYY-MM-DD (Cancún)
    const durationParam = url.searchParams.get("duration");

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Settings
    const { data: settingsRow } = await supabase
      .from("booking_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const duration = Number(durationParam) || settingsRow?.default_lesson_duration_minutes || 60;
    const buffer = settingsRow?.buffer_minutes ?? 0;
    const increment = settingsRow?.slot_increment_minutes ?? 30;
    const minNoticeHours = settingsRow?.min_notice_hours ?? 12;
    const maxAdvanceDays = settingsRow?.max_advance_days ?? 60;

    const nowUtc = new Date();
    const earliestUtc = new Date(nowUtc.getTime() + minNoticeHours * 3600 * 1000);
    const latestUtc = new Date(nowUtc.getTime() + maxAdvanceDays * 86400 * 1000);

    // Blocks within range
    const { data: blocks = [] } = await supabase
      .from("coach_availability_blocks")
      .select("block_date, start_time, end_time")
      .gte("block_date", startDate)
      .lte("block_date", endDate);

    // Existing lessons within range (any student). Used both to detect
    // which times are already taken AND to detect which weeks are skipped
    // (a skipped fixed-schedule slot reopens that single week).
    // NOTE: cancelled rows are fetched too — the admin "cancel this week"
    // flow marks the lesson cancelled AND skipped (open), which frees the
    // week exactly like a skip. The taken-loop below ignores cancelled
    // rows, and only skipped+open rows count as freed.
    const { data: lessons = [] } = await supabase
      .from("lessons")
      .select("lesson_date, lesson_time, duration_minutes, lesson_type, status, skipped, skip_keep_closed, recurring_slot_id")
      .gte("lesson_date", startDate)
      .lte("lesson_date", endDate);

    // Slots are sourced EXCLUSIVELY from fixed_schedule_slots (the coach's
    // calendar of "open spots" + claimed fixed-schedule spots). A slot is
    // bookable on a given date iff:
    //   (a) it's an unclaimed open spot (student_id IS NULL, is_available),
    //       OR
    //   (b) it's a claimed fixed-schedule spot that the owning student has
    //       skipped for that specific week (lesson row has skipped=true).
    // Coach scoping: only the booking student's assigned coach's open spots
    // (profiles.assigned_coach_id), falling back to the default coach used
    // by the set_coach_id_default trigger.
    const DEFAULT_COACH_ID = "13480fb4-e4d2-423c-b035-c65846b061fc";
    let targetCoachId = DEFAULT_COACH_ID;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) {
      try {
        const { data: claimsData } = await supabase.auth.getClaims(token);
        const callerId = (claimsData?.claims?.sub as string | undefined) ?? null;
        if (callerId) {
          const { data: prof } = await supabase
            .from("profiles").select("assigned_coach_id").eq("id", callerId).maybeSingle();
          if (prof?.assigned_coach_id) targetCoachId = prof.assigned_coach_id as string;
        }
      } catch (_) { /* anon key / invalid token → default coach */ }
    }

    const { data: fixedSlotsRaw = [] } = await supabase
      .from("fixed_schedule_slots")
      .select("day_of_week, start_time, duration_minutes, student_id, is_available, coach_id, specific_date");
    const fixedSlots = (fixedSlotsRaw || []).filter((r: any) =>
      (r.coach_id ?? DEFAULT_COACH_ID) === targetCoachId,
    );

    // ── Recurring weekly slots (the coach calendar's "fixed" tiles). These
    // occupy their weekday/time even when no concrete lesson row exists yet,
    // which is exactly what the Master Calendar projects via useCalendarWeek.
    const { data: recurringSlots = [] } = await supabase
      .from("recurring_lesson_slots")
      .select("id, weekday, start_time, duration_minutes, lesson_type, is_active, paused_until")
      .eq("is_active", true);

    // Weeks the coach freed: a lesson skipped for that week (or cancelled
    // by the admin, which also marks it skipped) with skip_keep_closed=false.
    // Those (date, time) pairs are bookable again — see (b) below — and must
    // not count as taken. A skipped week kept closed stays blocked.
    const freedByDate = new Map<string, Set<string>>();
    const freedRecurringByDate = new Map<string, Set<string>>();
    for (const l of lessons || []) {
      if ((l as any).skipped !== true || (l as any).skip_keep_closed === true) continue;
      if (!l.lesson_date || !l.lesson_time) continue;
      const d = l.lesson_date as string;
      const t = (l.lesson_time as string).slice(0, 5);
      if (!freedByDate.has(d)) freedByDate.set(d, new Set());
      freedByDate.get(d)!.add(t);
      const rsid = (l as any).recurring_slot_id as string | null | undefined;
      if (rsid) {
        if (!freedRecurringByDate.has(d)) freedRecurringByDate.set(d, new Set());
        freedRecurringByDate.get(d)!.add(rsid);
      }
    }

    // ── Build "taken" set: any non-cancelled, non-freed lesson occupies its
    // (date, time) for its FULL duration. A 2-hour lesson (Campo / Playing
    // Lesson / Field Lesson) at 17:00 blocks both 17:00 AND 18:00 open spots,
    // not just the exact start time. Freed weeks (skipped, or cancelled by
    // the admin, with skip_keep_closed=false) occupy nothing.
    const takenSet = new Set<string>();
    // Per-date taken intervals in minutes: [startMin, endMin)
    const takenIntervals = new Map<string, Array<[number, number]>>();
    const longLessonTypes = new Set(["Campo", "Playing Lesson", "Field Lesson"]);
    const lessonOccupiedMinutes = (l: any): number => {
      if (longLessonTypes.has((l.lesson_type as string) ?? "")) return 120;
      return (l.duration_minutes as number) || duration;
    };
    for (const l of lessons || []) {
      if (!l.lesson_date || !l.lesson_time) continue;
      const t = (l.lesson_time as string).slice(0, 5);
      // A freed week occupies nothing; a cancelled lesson is gone either way.
      if (freedByDate.get(l.lesson_date as string)?.has(t)) continue;
      if ((l as any).status === 'cancelled') continue;
      takenSet.add(`${l.lesson_date}|${t}`);
      const sMin = timeToMinutes(l.lesson_time as string);
      const eMin = sMin + lessonOccupiedMinutes(l);
      const arr = takenIntervals.get(l.lesson_date as string) ?? [];
      arr.push([sMin, eMin]);
      takenIntervals.set(l.lesson_date as string, arr);
    }


    // ── Day blocks (full-day or partial) from coach_availability_blocks.
    const fullyBlocked = new Set<string>();
    const partialBlocks = new Map<string, Array<[number, number]>>();
    for (const b of blocks || []) {
      if (!b.block_date) continue;
      if (!b.start_time && !b.end_time) {
        fullyBlocked.add(b.block_date as string);
      } else if (b.start_time && b.end_time) {
        const arr = partialBlocks.get(b.block_date as string) ?? [];
        arr.push([
          timeToMinutes(b.start_time as string),
          timeToMinutes(b.end_time as string),
        ]);
        partialBlocks.set(b.block_date as string, arr);
      }
    }

    // ── For each date in range, list recurring slots for that weekday and
    // include only those that are not taken / blocked / out of policy window.
    const result: Array<{ date: string; slots: string[] }> = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      if (fullyBlocked.has(cursor)) {
        result.push({ date: cursor, slots: [] });
        cursor = addDaysISO(cursor, 1);
        continue;
      }

      const wd = cancunWeekday(cursor);
      const daySlots = (fixedSlots || []).filter(
        (r: any) =>
          r.day_of_week === wd &&
          (r.specific_date == null || String(r.specific_date).slice(0, 10) === cursor),
      );
      const blockRanges = partialBlocks.get(cursor) ?? [];
      const slots: string[] = [];

      // Recurring weekly slots projected onto this date occupy their window,
      // mirroring the coach calendar's `fixed` tiles — except a slot whose
      // week the coach freed, which must not block its own time.
      const recurringIntervals: Array<[number, number]> = (recurringSlots || [])
        .filter((r: any) => r.weekday === wd &&
          !(r.paused_until && cursor < String(r.paused_until).slice(0, 10)) &&
          !freedRecurringByDate.get(cursor)?.has((r as any).id))
        .map((r: any) => {
          const sMin = timeToMinutes(r.start_time as string);
          const dur = longLessonTypes.has((r.lesson_type as string) ?? "")
            ? 120
            : (r.duration_minutes as number) || duration;
          return [sMin, sMin + dur] as [number, number];
        });

      for (const r of daySlots) {
        const startTime = ((r as any).start_time as string).slice(0, 5);
        const sMin = timeToMinutes((r as any).start_time as string);
        const eMin = sMin + ((r as any).duration_minutes ?? duration);

        // (a) Genuinely unclaimed open spots are offered.
        const isUnclaimedOpenSpot =
          (r as any).student_id == null && (r as any).is_available === true;
        // (b) A claimed spot whose owner skipped this week (and left it open)
        // is offered for this date only.
        const isFreedBySkip =
          (r as any).student_id != null &&
          !!freedByDate.get(cursor)?.has(startTime);
        if (!isUnclaimedOpenSpot && !isFreedBySkip) continue;

        // Already taken by another lesson overlapping this slot's window?
        const dayTaken = takenIntervals.get(cursor) ?? [];
        const overlapsTaken = dayTaken.some(
          ([ts, te]) => sMin < te && eMin > ts,
        );
        if (overlapsTaken) continue;

        // Occupied by a projected recurring (fixed) slot on this weekday?
        const overlapsRecurring = recurringIntervals.some(
          ([ts, te]) => sMin < te && eMin > ts,
        );
        if (overlapsRecurring) continue;

        // Falls inside a partial day block?
        const blocked = blockRanges.some(
          ([bs, be]) => sMin < be + buffer && eMin + buffer > bs,
        );
        if (blocked) continue;

        // Min-notice / max-advance window
        const slotUtc = cancunWallToUtc(cursor, startTime);
        if (slotUtc < earliestUtc || slotUtc > latestUtc) continue;

        if (!slots.includes(startTime)) slots.push(startTime);
      }


      slots.sort();
      result.push({ date: cursor, slots });
      cursor = addDaysISO(cursor, 1);
    }

    return new Response(
      JSON.stringify({ duration, buffer, increment, days: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("get-available-slots error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});