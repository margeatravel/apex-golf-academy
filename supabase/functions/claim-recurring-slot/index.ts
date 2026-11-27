import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PAID_TIERS = ["scratch", "pro", "apex"];

/**
 * Student claims a recurring (fixed) weekly spot.
 *
 * Server-side guarantees:
 *  - Only Scratch / Pro / Apex students may claim (plan resolved with the
 *    single source of truth `public.get_effective_plan`).
 *  - The claim is atomic: the UPDATE is conditioned on the slot still being
 *    unclaimed, so two students racing for the same spot cannot both win.
 *  - Package deduction logic is untouched (handled elsewhere).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
    const studentId = userData.user.id;

    const { slotId } = (await req.json().catch(() => ({}))) as { slotId?: string };
    if (!slotId) return json({ error: "slotId is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Plan gate (server side, never trust the UI) ──
    const { data: planRow, error: planErr } = await admin.rpc("get_effective_plan", {
      _user_id: studentId,
    });
    if (planErr) console.error("get_effective_plan failed", planErr);
    const plan = String(planRow ?? "free");
    if (!PAID_TIERS.includes(plan)) {
      return json(
        {
          error: "plan_required",
          message: "A Scratch, Pro or Apex Level membership is required for a fixed weekly spot.",
          plan,
        },
        403,
      );
    }

    // ── Server-side recurring schedule limit (Santiago, 27 Nov 2026) ──
    // The UI used to be the only brake: a student could claim a second spot
    // by calling this function directly. Max distinct weekly schedules:
    // Scratch 1, Pro 2, Apex 2. A claimed fixed spot and a coach-assigned
    // recurring slot at the same weekday+time count as ONE schedule.
    {
      const maxSlots = plan === "scratch" ? 1 : 2;
      const [fixedMine, recurringMine] = await Promise.all([
        admin
          .from("fixed_schedule_slots")
          .select("day_of_week, start_time")
          .eq("student_id", studentId)
          .eq("is_available", false),
        admin
          .from("recurring_lesson_slots")
          .select("weekday, start_time")
          .eq("student_id", studentId)
          .eq("is_active", true),
      ]);
      const keys = new Set<string>();
      for (const r of fixedMine.data ?? []) {
        keys.add(`${r.day_of_week}|${String(r.start_time).slice(0, 5)}`);
      }
      for (const r of recurringMine.data ?? []) {
        keys.add(`${r.weekday}|${String(r.start_time).slice(0, 5)}`);
      }
      if (keys.size >= maxSlots) {
        return json(
          {
            error: "slot_limit",
            message:
              plan === "scratch"
                ? "Scratch members can hold one recurring schedule per week. Ask your coach to move it instead."
                : "You already hold the maximum of two recurring schedules per week. Ask your coach to move one instead.",
            plan,
          },
          409,
        );
      }
    }

    // ── Conflict priority (Santiago, 27 Nov 2026) ──
    // If a Scratch/Pro/Apex student has a pending change request for this
    // slot, a lower-plan student may not claim it out from under them — the
    // coach reviews the queue first. (The plan gate above already keeps
    // free/member/family students out of direct claims; this guard covers
    // override / SC students who can claim through the DB trigger path.)
    // Wrapped in try/catch: the table only exists once migration
    // 20261127130000 is applied; until then the guard is skipped.
    try {
      const { data: pendingForSlot } = await admin
        .from("recurring_slot_change_requests")
        .select("plan_at_request")
        .eq("target_slot_id", slotId)
        .eq("status", "pending");
      const hasPriorityRequest = (pendingForSlot ?? []).some((r: any) =>
        ["scratch", "pro", "apex"].includes(String(r.plan_at_request ?? "").toLowerCase()),
      );
      if (hasPriorityRequest && !["scratch", "pro", "apex"].includes(plan)) {
        return json(
          {
            error: "reserved_for_review",
            message:
              "This time is under review for a Scratch/Pro student. Your coach will confirm the schedule.",
            plan,
          },
          409,
        );
      }
    } catch (e) {
      console.warn("priority guard skipped (change-requests table missing?)", e);
    }

    // ── Minute-range conflict guard: an open spot that overlaps another
    // student's recurring slot or claimed spot cannot be claimed. ──
    {
      const toMin = (t: string) => {
        const [h, m = "0"] = String(t).split(":");
        return parseInt(h, 10) * 60 + parseInt(m, 10);
      };
      const dur = (r: any) =>
        /^(campo|playing lesson)$/i.test(String(r.lesson_type ?? "").trim())
          ? 120
          : Number(r.duration_minutes) > 0 ? Number(r.duration_minutes) : 60;
      const { data: spot } = await admin
        .from("fixed_schedule_slots")
        .select("id, day_of_week, start_time, duration_minutes, lesson_type, coach_id")
        .eq("id", slotId)
        .maybeSingle();
      if (spot) {
        const s0 = toMin(spot.start_time);
        const e0 = s0 + dur(spot);
        let rq = admin
          .from("recurring_lesson_slots")
          .select("student_id, start_time, duration_minutes, lesson_type")
          .eq("weekday", spot.day_of_week)
          .eq("is_active", true);
        let fq = admin
          .from("fixed_schedule_slots")
          .select("id, student_id, start_time, duration_minutes, lesson_type")
          .eq("day_of_week", spot.day_of_week)
          .not("student_id", "is", null)
          .neq("id", spot.id);
        if (spot.coach_id) {
          rq = rq.eq("coach_id", spot.coach_id);
          fq = fq.eq("coach_id", spot.coach_id);
        }
        const [{ data: rec }, { data: fix }] = await Promise.all([rq, fq]);
        const clash = [...(rec ?? []), ...(fix ?? [])].find((r: any) => {
          const s = toMin(r.start_time);
          return s < e0 && s0 < s + dur(r);
        });
        if (clash) {
          return json(
            { error: "conflict", message: "This spot overlaps another lesson and can't be claimed." },
            409,
          );
        }
      }
    }

    // ── Atomic claim ──
    const { data: claimed, error: claimErr } = await admin
      .from("fixed_schedule_slots")
      .update({ student_id: studentId })
      .eq("id", slotId)
      .eq("is_available", true)
      .is("student_id", null)
      .select("id, day_of_week, start_time, duration_minutes, lesson_type")
      .maybeSingle();

    if (claimErr) {
      console.error("claim failed", claimErr);
      return json({ error: "claim_failed", message: claimErr.message }, 500);
    }
    if (!claimed) {
      return json(
        { error: "taken", message: "That spot was just taken. Please pick another." },
        409,
      );
    }

    return json({ ok: true, slot: claimed });
  } catch (err: any) {
    console.error("claim-recurring-slot error", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
