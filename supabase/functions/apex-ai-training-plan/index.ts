// Apex AI Custom Training Plan generator
// Gated to active subscribers (Scratch / Pro / Apex / SC included).
// Generates a structured training plan via Lovable AI Gateway and persists it to ai_training_plans.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_TYPES = new Set(["weekly", "monthly", "bimonthly"]);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are Apex AI, a senior golf coach generating a structured CUSTOM TRAINING PLAN for a real student.

Rules:
- Use the STUDENT CONTEXT block. Use the "Player level" line EXACTLY as given; never invent a level, handicap or score. If the level is UNKNOWN, build a general intermediate plan and say so in one short line.
- Progressive across the duration (weekly = 1 week, monthly = 4 weeks, bimonthly = 8 weeks).
- KEEP IT MINIMAL. The plan is a checklist, not an essay: no explanations, no reasoning, no motivational text inside sessions.
- Each block is a REAL, EXECUTABLE exercise with sets/reps/time or ball count. MAX 8 words.
  GOOD: "3x5 box jumps", "4x8 med ball slams", "30 balls 6ft gate putting", "3x10 half-swing 8 iron", "20 bunker shots", "3x30s side plank".
  BAD (never use vague body parts or concepts): "T-spine", "cadera posterior", "mobility", "core", "tempo work", "short game", "posture".
  Every block must state WHAT to do and HOW MUCH. No sentences, no "because", no tips.
- "focus" and "theme": MAX 5 words each.
- "summary": ONE short line (max 15 words).
- 2 or 3 sessions per week ONLY (matching the training days given). Never more, never daily.
- EXACTLY 4 blocks (exercises) per session. Never more, never less.
- Use ONLY the training days given by the student, in that order.

Return ONLY by calling return_training_plan.`;

const PLAN_TOOL = {
  type: "function",
  function: {
    name: "return_training_plan",
    description: "Return a structured custom training plan for the student.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, motivational plan title." },
        summary: {
          type: "string",
          description: "ONE short line, max 15 words. No explanations.",
        },
        weeks: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              week_number: { type: "number" },
              theme: { type: "string", description: "Max 5 words (e.g. 'Contact + putting baseline')." },
              sessions: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: {
                  type: "object",
                  properties: {
                    day: { type: "string", description: "e.g. Mon, Wed, Sat" },
                    focus: { type: "string", description: "Max 5 words. Name only, no explanation." },
                    duration_minutes: { type: "number" },
                    blocks: {
                      type: "array",
                      minItems: 4,
                      maxItems: 4,
                      items: {
                        type: "string",
                        description:
                          "Exercise name + reps/time ONLY. Max 8 words. No explanations or tips. Example: '3-6 ft gate putting - 30 balls'.",
                      },
                    },
                  },
                  required: ["day", "focus", "duration_minutes", "blocks"],
                  additionalProperties: false,
                },
              },
            },
            required: ["week_number", "theme", "sessions"],
            additionalProperties: false,
          },
        },
        success_metrics: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string" },
        },
        coach_review_note: { type: "string" },
      },
      required: ["title", "summary", "weeks", "success_metrics", "coach_review_note"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) return jsonResp({ error: "AI is not configured." }, 500);

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

    const planType = String(body.plan_type ?? "");
    const focusNote = String(body.focus_note ?? "").trim().slice(0, 500);
    const language = String(body.language ?? "en").toLowerCase().startsWith("es") ? "es" : "en";
    const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days: string[] = Array.isArray(body.days)
      ? body.days.map((d: unknown) => String(d)).filter((d: string) => VALID_DAYS.includes(d)).slice(0, 3)
      : [];
    const trainingDays = days.length >= 2 ? days : ["Tue", "Sat"];
    if (!PLAN_TYPES.has(planType)) {
      return jsonResp({ error: "plan_type must be weekly, monthly, or bimonthly." }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Apex AI gate: per-plan `apex_ai_enabled` flag on billing_plans.
    const { data: gateRow, error: gateErr } = await adminClient.rpc("has_apex_ai_access", {
      _user_id: userId,
    });
    if (gateErr) {
      console.error("has_apex_ai_access rpc failed", gateErr);
      return jsonResp({ error: "Subscription check failed." }, 500);
    }
    if (gateRow !== true) {
      return jsonResp(
        {
          error:
            "Custom AI training plans are available to active subscribers (Scratch, Pro, or Apex). Upgrade your plan to unlock plans built for you.",
          code: "subscription_required",
        },
        403,
      );
    }

    // Build student context.
    const { data: prof } = await adminClient
      .from("profiles")
      .select("full_name, plan_tier, manual_plan_override, override_expires_at, handicap, handicap_goal, goals, ai_memory")
      .eq("id", userId)
      .maybeSingle();

    const ctxLines: string[] = [];
    if (prof) {
      const p: any = prof;
      if (p.full_name) ctxLines.push(`Name: ${p.full_name}`);
      const eff =
        (p.manual_plan_override &&
          (!p.override_expires_at || new Date(p.override_expires_at) > new Date()))
          ? p.manual_plan_override
          : (p.plan_tier || "free");

      ctxLines.push(`Plan: ${eff}`);
      if (p.handicap !== null && p.handicap !== undefined) ctxLines.push(`Handicap: ${p.handicap}`);
      if (p.handicap_goal !== null && p.handicap_goal !== undefined)
        ctxLines.push(`Handicap goal: ${p.handicap_goal}`);
      if (p.goals) ctxLines.push(`Stated goals: ${String(p.goals).slice(0, 400)}`);
      if (p.ai_memory) ctxLines.push(`Coach memory: ${String(p.ai_memory).slice(0, 1500)}`);
    }

    const { data: recentLessons } = await adminClient
      .from("lessons")
      .select("lesson_date, lesson_type, status, coach_notes, student_notes")
      .eq("student_id", userId)
      .eq("status", "completed")
      .order("lesson_date", { ascending: false })
      .limit(8);
    if (recentLessons && recentLessons.length > 0) {
      ctxLines.push(
        `Recent completed lessons: ${recentLessons.map((l: any) => `${l.lesson_date} (${l.lesson_type})`).join(", ")}`,
      );
      const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
      const lessonNoteLines = recentLessons
        .filter((l: any) => (l.coach_notes && l.coach_notes.trim()) || (l.student_notes && l.student_notes.trim()))
        .map((l: any) => {
          const parts: string[] = [`${l.lesson_date}`];
          if (l.coach_notes?.trim()) parts.push(`coach: ${trunc(l.coach_notes.trim(), 180)}`);
          if (l.student_notes?.trim()) parts.push(`student: ${trunc(l.student_notes.trim(), 180)}`);
          return `- ${parts.join(" | ")}`;
        });
      if (lessonNoteLines.length) {
        ctxLines.push(`Recent lesson notes (newest first):\n${lessonNoteLines.join("\n")}`);
      }
    }

    const { data: recentVideos } = await adminClient
      .from("videos")
      .select("title, notes, upload_date")
      .eq("student_id", userId)
      .order("upload_date", { ascending: false })
      .limit(5);
    if (recentVideos && recentVideos.length > 0) {
      const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
      const videoNoteLines = recentVideos
        .filter((v: any) => v.notes && v.notes.trim())
        .map((v: any) => `- ${v.upload_date} ${v.title || "Untitled"}: ${trunc(v.notes.trim(), 180)}`);
      if (videoNoteLines.length) {
        ctxLines.push(`Recent video notes (newest first):\n${videoNoteLines.join("\n")}`);
      }
    }

    const { data: recentRounds } = await adminClient
      .from("golf_rounds")
      .select("total_score, played_on, course_name_snapshot")
      .eq("student_id", userId)
      .order("played_on", { ascending: false })
      .limit(5);
    const recentRound = recentRounds?.[0] ?? null;
    if (recentRound) {
      ctxLines.push(
        `Most recent round: ${(recentRound as any).total_score} on ${(recentRound as any).played_on}` +
          ((recentRound as any).course_name_snapshot
            ? ` at ${(recentRound as any).course_name_snapshot}`
            : ""),
      );
    }

    // Explicit, data-derived player level (never guessed by the model).
    {
      const scores = (recentRounds ?? [])
        .map((r: any) => Number(r.total_score))
        .filter((n: number) => Number.isFinite(n) && n > 40 && n < 200);
      const avgScore = scores.length
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : null;
      const hcp = (prof as any)?.handicap;
      const hcpNum = hcp === null || hcp === undefined ? null : Number(hcp);
      const levelFromHcp = (h: number) =>
        h <= 4 ? "Elite" : h <= 11 ? "Advanced" : h <= 20 ? "Intermediate" : "Beginner";
      const levelFromScore = (sc: number) =>
        sc <= 75 ? "Elite" : sc <= 84 ? "Advanced" : sc <= 96 ? "Intermediate" : "Beginner";
      if (avgScore !== null) ctxLines.push(`Average score (last ${scores.length} rounds): ${avgScore}`);
      if (hcpNum !== null && Number.isFinite(hcpNum)) {
        ctxLines.push(`Player level: ${levelFromHcp(hcpNum)} (source: handicap ${hcpNum})`);
      } else if (avgScore !== null) {
        ctxLines.push(
          `Player level: ${levelFromScore(avgScore)} (source: average of last ${scores.length} logged round(s) = ${avgScore})`,
        );
      } else {
        ctxLines.push(
          "Player level: UNKNOWN (no handicap and no logged rounds). Do NOT invent a level or handicap; build a general intermediate plan and note the level is not on file.",
        );
      }
    }

    const planScopeText =
      planType === "weekly"
        ? "Generate exactly 1 week (week_number 1)."
        : planType === "monthly"
        ? "Generate exactly 4 weeks (week_number 1..4)."
        : "Generate exactly 8 weeks (week_number 1..8).";

    const userMessage = [
      `Plan type: ${planType}.`,
      planScopeText,
      `Training days chosen by the student: ${trainingDays.join(" and ")}. Every week must contain EXACTLY ${trainingDays.length} sessions (day field = exactly these values, no other days), each with EXACTLY 4 blocks.`,
      ctxLines.length ? `\nSTUDENT CONTEXT:\n${ctxLines.join("\n")}` : "",
      focusNote ? `\nStudent's specific focus request: ${focusNote}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const model = "google/gemini-3-flash-preview";
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              SYSTEM_PROMPT +
              (language === "es"
                ? "\n\nLANGUAGE: Write EVERY string of the plan (title, summary, theme, focus, blocks, success_metrics, coach_review_note) in SPANISH (Mexico). Keep standard golf terms (putting, driver, chipping, bunker) as-is. Never answer in English."
                : "\n\nLANGUAGE: Write EVERY string of the plan in ENGLISH. Never answer in Spanish."),
          },
          { role: "user", content: userMessage },
        ],
        tools: [PLAN_TOOL],
        tool_choice: { type: "function", function: { name: "return_training_plan" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) return jsonResp({ error: "Rate limit reached. Try again shortly." }, 429);
      if (aiResp.status === 402) return jsonResp({ error: "AI credits exhausted. Please contact your Coach." }, 402);
      return jsonResp({ error: "AI service error." }, 502);
    }

    const aiJson = await aiResp.json();
    const argsStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any = null;
    try {
      if (argsStr) parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("AI plan parse failed", e);
    }
    if (!parsed?.title || !Array.isArray(parsed?.weeks)) {
      return jsonResp({ error: "AI returned an unexpected plan." }, 502);
    }

    const { data: planRow, error: insertErr } = await adminClient
      .from("ai_training_plans")
      .insert({
        student_id: userId,
        plan_type: planType,
        title: String(parsed.title).slice(0, 200),
        summary: parsed.summary ? String(parsed.summary).slice(0, 2000) : null,
        plan_content: parsed,
        source: "apex_ai",
        status: "active",
      })
      .select("id, title, plan_type, created_at")
      .single();

    if (insertErr || !planRow) {
      console.error("ai_training_plans insert failed", insertErr);
      return jsonResp({ error: "Could not save the plan." }, 500);
    }

    return jsonResp({
      plan_id: planRow.id,
      plan_type: planRow.plan_type,
      title: planRow.title,
      summary: parsed.summary ?? null,
      weeks: parsed.weeks,
      success_metrics: parsed.success_metrics ?? [],
      coach_review_note: parsed.coach_review_note ?? null,
      created_at: planRow.created_at,
    });
  } catch (e) {
    console.error("apex-ai-training-plan error", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});