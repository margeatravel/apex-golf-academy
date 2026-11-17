// Apex AI Availability + Booking
// Action 'list' → returns the next N available fixed_schedule_slots for the next 14 days.
// Action 'book' → creates a lesson on a specific slot for the authenticated student,
// deducting from an active package if available, otherwise returning a Stripe checkout URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nextDateForWeekday(targetDow: number, withinDays = 14): Date[] {
  // Returns ALL future dates within `withinDays` whose DOW matches.
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < withinDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === targetDow) out.push(d);
  }
  return out;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResp({ error: "Missing authorization." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: "Invalid session." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return jsonResp({ error: "Invalid JSON body." }, 400);
    const action = String(body.action ?? "list");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ----------- ACTION: list -----------
    if (action === "list") {
      const { data: slots, error: slotsErr } = await adminClient
        .from("fixed_schedule_slots")
        .select("id, day_of_week, start_time, duration_minutes, lesson_type, is_available, student_id")
        .eq("is_available", true)
        .is("student_id", null)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (slotsErr) {
        console.error("slots fetch failed", slotsErr);
        return jsonResp({ error: "Could not load availability." }, 500);
      }

      // Expand each slot into the next concrete date(s) within 14 days.
      const expanded: Array<{
        slot_id: string;
        date: string;
        day_label: string;
        start_time: string;
        duration_minutes: number;
        lesson_type: string;
      }> = [];

      for (const s of slots ?? []) {
        const dates = nextDateForWeekday(s.day_of_week as number, 14);
        for (const d of dates) {
          expanded.push({
            slot_id: s.id as string,
            date: fmtDate(d),
            day_label: DAY_NAMES[s.day_of_week as number],
            start_time: s.start_time as string,
            duration_minutes: s.duration_minutes as number,
            lesson_type: s.lesson_type as string,
          });
        }
      }

      // Cap response so chat stays light.
      expanded.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
      return jsonResp({ slots: expanded.slice(0, 12) });
    }

    // ----------- ACTION: book -----------
    if (action === "book") {
      const slotId = String(body.slot_id ?? "");
      const lessonDate = String(body.lesson_date ?? "");
      if (!slotId || !lessonDate) {
        return jsonResp({ error: "slot_id and lesson_date are required." }, 400);
      }

      // Re-load the slot to make sure it's still available.
      const { data: slot, error: slotErr } = await adminClient
        .from("fixed_schedule_slots")
        .select("id, day_of_week, start_time, duration_minutes, lesson_type, is_available, student_id")
        .eq("id", slotId)
        .maybeSingle();

      if (slotErr || !slot) return jsonResp({ error: "Slot not found." }, 404);
      if (!slot.is_available || slot.student_id) {
        return jsonResp({ error: "This slot is no longer available." }, 409);
      }

      // Avoid duplicate lesson for same student/date/time
      const { data: existing } = await adminClient
        .from("lessons")
        .select("id")
        .eq("student_id", userId)
        .eq("lesson_date", lessonDate)
        .eq("lesson_time", slot.start_time)
        .maybeSingle();
      if (existing) {
        return jsonResp({
          status: "already_booked",
          message: "You already have a lesson at that time.",
        });
      }

      // Look up an active package with remaining classes.
      const { data: pkg } = await adminClient
        .from("class_packages")
        .select("id, classes_remaining")
        .eq("user_id", userId)
        .eq("is_active", true)
        .gt("classes_remaining", 0)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pkg) {
        // Create the lesson, attach the package_id. Triggers handle deduction on completion.
        const { data: created, error: createErr } = await adminClient
          .from("lessons")
          .insert({
            student_id: userId,
            lesson_date: lessonDate,
            lesson_time: slot.start_time,
            duration_minutes: slot.duration_minutes,
            lesson_type: slot.lesson_type,
            status: "scheduled",
            package_id: pkg.id,
            currency: "MXN",
          })
          .select("id")
          .single();

        if (createErr || !created) {
          console.error("lesson create failed", createErr);
          return jsonResp({ error: "Could not create the lesson." }, 500);
        }

        return jsonResp({
          status: "booked",
          lesson_id: created.id,
          package_used: true,
          message: "Lesson booked. It will be deducted from your active package after the lesson is completed.",
        });
      }

      // No package — student needs to buy a lesson or package first.
      // Surface this to the chat so the UI can show "Buy a lesson" / "View packages" links.
      return jsonResp({
        status: "payment_required",
        message:
          "You don't have any lessons remaining. Buy a lesson or package, then I can book this slot for you.",
        slot: {
          slot_id: slotId,
          date: lessonDate,
          start_time: slot.start_time,
          lesson_type: slot.lesson_type,
        },
      });
    }

    return jsonResp({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("apex-ai-availability error", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});