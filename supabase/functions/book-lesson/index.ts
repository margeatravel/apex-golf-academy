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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function cancunWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00-05:00`);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Cancun", weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const studentId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { lessonDate, lessonTime, lessonType, notes, paymentMethod, packageId, attendeeIds: requestedAttendeeIds } = body || {};

    if (!lessonDate || !lessonTime || !lessonType) {
      return new Response(JSON.stringify({ error: "lessonDate, lessonTime, lessonType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate) || !/^\d{2}:\d{2}(:\d{2})?$/.test(lessonTime)) {
      return new Response(JSON.stringify({ error: "Invalid date/time format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load profile + settings
    const [profileRes, settingsRes] = await Promise.all([
      admin.from("profiles").select("id, email, full_name, plan_tier, manual_plan_override, override_expires_at").eq("id", studentId).maybeSingle(),
      admin.from("booking_settings").select("*").eq("id", "default").maybeSingle(),
    ]);
    const profile = profileRes.data;
    const settings = settingsRes.data;
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duration = settings?.default_lesson_duration_minutes ?? 60;
    const buffer = settings?.buffer_minutes ?? 0;
    const minNoticeHours = settings?.min_notice_hours ?? 12;
    const maxAdvanceDays = settings?.max_advance_days ?? 60;
    const allowUnpaid = settings?.allow_unpaid_booking ?? false;

    // Only Apex members get free lesson coverage by their membership.
    // Scratch / Pro / Free must consume a package or pay
    // (card, cash, or transfer).
    const isApexMember = (() => {
      const overrideValid = !profile.override_expires_at || new Date(profile.override_expires_at) > new Date();
      if (overrideValid && profile.manual_plan_override === "apex") return true;
      if (profile.plan_tier === "apex") return true;
      return false;
    })();

    // Always look up an active package (FIFO — oldest first) so paid credits
    // are consumed before falling back to membership coverage. This applies
    // regardless of subscriber status: a student who paid for a 10-pack
    // expects those credits to be used.
    // Packages the student OWNS *or* is a shared member of both count: a
    // shared package's balance can be spent by any of its members.
    // When the student explicitly picks card / cash, no package is consumed.
    const explicitlyPaying = paymentMethod === "card" || paymentMethod === "cash_transfer";
    let activePackageId: string | null = null;
    if (!explicitlyPaying) {
      const { data: memberships } = await admin
        .from("package_members")
        .select("package_id")
        .eq("student_id", studentId);
      const memberIds = (memberships ?? []).map((m: any) => m.package_id);
      let q = admin
        .from("class_packages")
        .select("id")
        .eq("is_active", true)
        .gt("classes_remaining", 0);
      q = memberIds.length
        ? q.or(`user_id.eq.${studentId},id.in.(${memberIds.join(",")})`)
        : q.eq("user_id", studentId);
      // A specific package chosen by the student wins, but it must still be
      // one they own or share, active and with remaining credits.
      if (packageId) q = q.eq("id", packageId);
      const { data: pkg } = await q
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      activePackageId = pkg?.id ?? null;
      if (packageId && !activePackageId) {
        return new Response(
          JSON.stringify({ error: "invalid_package", message: "That package is not available." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Joint lessons: who attends. The booker always attends; extra attendees
    // must belong to the package paying for the lesson (owner or member).
    // Without a package (card/cash/membership) only the booker attends.
    // One lesson row = 1 credit no matter how many attend together.
    let attendeeIds: string[] = [studentId];
    if (Array.isArray(requestedAttendeeIds) && requestedAttendeeIds.length > 0 && activePackageId) {
      const wanted = Array.from(
        new Set(requestedAttendeeIds.filter((x: any) => typeof x === "string")),
      ) as string[];
      const [{ data: pkgOwner }, { data: pkgMembers }] = await Promise.all([
        admin.from("class_packages").select("user_id").eq("id", activePackageId).maybeSingle(),
        admin.from("package_members").select("student_id").eq("package_id", activePackageId),
      ]);
      const allowed = new Set<string>([studentId, (pkgOwner as any)?.user_id].filter(Boolean));
      (pkgMembers ?? []).forEach((m: any) => allowed.add(m.student_id));
      const invalid = wanted.filter((id) => !allowed.has(id));
      if (invalid.length > 0) {
        return new Response(
          JSON.stringify({ error: "invalid_attendee", message: "An attendee does not belong to this package." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      attendeeIds = Array.from(new Set([studentId, ...wanted]));
    }

    // Determine payment pathway
    const isCard = paymentMethod === "card";
    const isCashTransfer = paymentMethod === "cash_transfer";
    // If not Apex, no credits, and no explicit payment method — student must choose one
    if (!isApexMember && !activePackageId && !allowUnpaid && !isCashTransfer && !isCard) {
      return new Response(
        JSON.stringify({ error: "no_credits", message: "Please select a payment method." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const isUnpaidBooking = isCashTransfer || isCard;

    // Decide what actually pays for this lesson:
    //  - card / cash_transfer  -> pending external payment
    //  - active package        -> deduct one credit (preferred over membership)
    //  - active subscription   -> covered by membership
    const paidWith: "package" | "membership" | "card" | "cash_transfer" =
      isCard ? "card"
      : isCashTransfer ? "cash_transfer"
      : activePackageId ? "package"
      : "membership"; // only reachable for Apex members per gate above

    // Time-window checks
    const slotUtc = new Date(`${lessonDate}T${lessonTime.length === 5 ? lessonTime + ":00" : lessonTime}-05:00`);
    const nowUtc = new Date();
    const earliest = new Date(nowUtc.getTime() + minNoticeHours * 3600 * 1000);
    const latest = new Date(nowUtc.getTime() + maxAdvanceDays * 86400 * 1000);
    if (slotUtc < earliest) {
      return new Response(JSON.stringify({ error: "too_soon", message: `Bookings require at least ${minNoticeHours}h notice.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (slotUtc > latest) {
      return new Response(JSON.stringify({ error: "too_far", message: `Cannot book more than ${maxAdvanceDays} days ahead.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate slot against fixed_schedule_slots — using the SAME logic as
    // get-available-slots. A (date, time) is bookable iff ANY recurring slot
    // on that weekday at that time is either (a) an unclaimed open spot, or
    // (b) a claimed spot whose owner has a skipped lesson this exact week.
    const wd = cancunWeekday(lessonDate);
    const requestedTime = lessonTime.length > 5 ? lessonTime.slice(0, 5) : lessonTime;
    const slotStartMin = timeToMinutes(lessonTime);
    const { data: fixedSlots = [] } = await admin
      .from("fixed_schedule_slots")
      .select("day_of_week, start_time, duration_minutes, student_id, is_available, coach_id, specific_date")
      .eq("day_of_week", wd);

    // Coach scoping: student's assigned coach (profiles.assigned_coach_id),
    // else the default coach used by set_coach_id_default.
    const DEFAULT_COACH_ID = "13480fb4-e4d2-423c-b035-c65846b061fc";
    const { data: coachProf } = await admin
      .from("profiles").select("assigned_coach_id").eq("id", studentId).maybeSingle();
    const targetCoachId = (coachProf?.assigned_coach_id as string | null) ?? DEFAULT_COACH_ID;

    const matchingSlots = (fixedSlots || []).filter((r: any) => {
      const t = ((r.start_time as string) || "").slice(0, 5);
      if (t !== requestedTime) return false;
      if ((r.coach_id ?? DEFAULT_COACH_ID) !== targetCoachId) return false;
      if (r.specific_date != null && String(r.specific_date).slice(0, 10) !== lessonDate) return false;
      return true;
    });

    // Prefer an unclaimed open spot if one exists for this weekday/time.
    const openSpot = matchingSlots.find(
      (r: any) => r.student_id == null && r.is_available === true,
    );

    let allowed = !!openSpot;
    if (!allowed) {
      // Allow if any lesson on this exact date+time is marked as skipped
      // (and not kept closed) — this is the coach's manual "open this week"
      // adjustment and may exist independently of fixed_schedule_slots.
      // NOTE: do NOT exclude cancelled rows here — the admin "cancel this
      // week" flow marks the lesson cancelled AND skipped (open), which is
      // exactly a freed week; excluding it made cancelled weeks unbookable
      // (409 "unavailable") even though the calendar shows them as open.
      const { data: weekLessons = [] } = await admin
        .from("lessons")
        .select("id, lesson_time, skipped, skip_keep_closed, status, coach_id")
        .eq("lesson_date", lessonDate)
        .eq("skipped", true);
      allowed = (weekLessons || []).some(
        (l: any) =>
          ((l.lesson_time as string) || "").slice(0, 5) === requestedTime &&
          !l.skip_keep_closed &&
          (l.coach_id ?? DEFAULT_COACH_ID) === targetCoachId,
      );
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: "unavailable", message: "That time is not an open spot for your coach on this date." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refSlot = openSpot ?? matchingSlots[0];
    const slotEndMin =
      slotStartMin + ((refSlot as any)?.duration_minutes ?? duration);

    // Check date blocks
    const { data: blocks = [] } = await admin
      .from("coach_availability_blocks")
      .select("start_time, end_time")
      .eq("block_date", lessonDate);
    for (const b of blocks || []) {
      if (!b.start_time && !b.end_time) {
        return new Response(JSON.stringify({ error: "blocked", message: "That date is blocked." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (b.start_time && b.end_time) {
        const bs = timeToMinutes(b.start_time as string);
        const be = timeToMinutes(b.end_time as string);
        if (slotStartMin < be && slotEndMin > bs) {
          return new Response(JSON.stringify({ error: "blocked", message: "That time is blocked." }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Check existing lessons at this exact date+time (skipped occurrences
    // free up the slot for that single week — match get-available-slots).
    const { data: sameDayLessons = [] } = await admin
      .from("lessons")
      .select("id, lesson_time, status, skipped")
      .eq("lesson_date", lessonDate)
      .neq("status", "cancelled")
      .eq("skipped", false);
    const conflict = (sameDayLessons || []).some((l: any) => {
      const t = ((l.lesson_time as string) || "").slice(0, 5);
      return t === requestedTime;
    });
    if (conflict) {
      return new Response(JSON.stringify({ error: "taken", message: "That time was just booked. Please pick another." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert lesson
    const { data: inserted, error: insertErr } = await admin
      .from("lessons")
      .insert({
        student_id: studentId,
        coach_id: (openSpot as any)?.coach_id ?? targetCoachId,
        lesson_date: lessonDate,
        lesson_time: lessonTime,
        duration_minutes: duration,
        lesson_type: lessonType,
        status: "scheduled",
        package_id: isUnpaidBooking ? null : activePackageId,
        invitee_name: profile.full_name,
        invitee_email: profile.email,
        student_notes: notes ?? null,
        currency: "MXN",
        coach_notes: isCard
          ? "Payment: Pending – card (Stripe)"
          : isCashTransfer
            ? "Payment: Pending – cash/transfer"
            : null,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("insert lesson failed", insertErr);
      return new Response(JSON.stringify({ error: "insert_failed", message: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One lesson row = 1 credit: record every attendee of this lesson.
    const { error: attErr } = await admin.from("lesson_attendees").insert(
      attendeeIds.map((id) => ({ lesson_id: inserted.id, student_id: id })),
    );
    if (attErr) console.error("insert lesson_attendees failed", attErr);

    // NOTE: Reserved (future) lessons must NOT consume the package.
    // Package counters are only decremented when a lesson is marked completed
    // (handled by the process_lesson_completion_for_lesson DB trigger).
    // Here we only compute an informational `lessonsRemaining` for the
    // confirmation email, based solely on already-completed lessons.
    let lessonsRemaining: number | null = null;
    if (activePackageId && !isUnpaidBooking) {
      const { data: pkgRow } = await admin
        .from("class_packages")
        .select("package_size")
        .eq("id", activePackageId)
        .maybeSingle();

      const { data: completedLessons } = await admin
        .from("lessons")
        .select("lesson_type")
        .eq("package_id", activePackageId)
        .eq("status", "completed");

      const DOUBLE_TYPES = ["Campo", "Playing Lesson", "Field Lesson"];
      const completedUsed = (completedLessons ?? []).reduce(
        (sum: number, l: any) =>
          sum + (DOUBLE_TYPES.includes(l.lesson_type) ? 2 : 1),
        0,
      );
      const pkgSize = pkgRow?.package_size ?? 0;
      lessonsRemaining = Math.max(0, pkgSize - completedUsed);
    }

    // Fire-and-forget student confirmation email
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          to: profile.email,
          studentName: profile.full_name ?? profile.email,
          notificationType: "lesson_booked",
          lessonDate,
          lessonTime,
          lessonType,
          lessonsRemaining,
          lessonDurationMinutes: duration,
        }),
      });
    } catch (e) {
      console.warn("student confirmation email failed", e);
    }

    // Fire-and-forget Google Calendar sync to coach's calendar
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ action: "create", lessonId: inserted.id }),
      });
    } catch (e) {
      console.warn("google calendar sync failed", e);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lessonId: inserted.id,
        lessonsRemaining,
        packageId: paidWith === "package" ? activePackageId : null,
        isSubscriber: isApexMember,
        paidWith,
        needsStripeCheckout: isCard,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("book-lesson error", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});