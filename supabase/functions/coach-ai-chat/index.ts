// Coach AI Chat — coach-only AI assistant.
// Streams responses from the Lovable AI Gateway (SSE), persists messages to
// public.coach_ai_messages. Uses the same PLATFORM_CONTEXT as the student-facing
// Apex AI so it knows the academy inside-out, but with a coach-focused system
// prompt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLATFORM_CONTEXT = `
SC GOLF ACADEMY — PLATFORM KNOWLEDGE BASE
- App name: SC Golf Academy ("Apex Golf"). In-app AI assistant is "Apex AI".
- Private golf academy (the head coach + support staff + students).
- Languages: English & Spanish. Timezone: America/Cancun. Currency: MXN.
- Roles: student, staff (scoped), admin/coach.
- Membership tiers: Member (free), Scratch (mid monthly), Pro (top monthly).
- Booking via Calendly (https://calendly.com/castilla-santi-golfacademy/new-meeting). Coach syncs lessons manually.
- Lesson types: Range, Short Game, Putting, Playing Lesson (Campo, consumes 2 package slots), Video Analysis.
- Lesson packages: 5/10/20/30. Auto-deduct on completion. Shared package members supported.
- Paid Video Analysis ~$550 MXN, or 200 SC Points = 1 free.
- Apex AI: students get a structured (quick diagnosis, main priority, 3 drills, weekly plan, coach notes with disclaimer) answer for golf coaching, or a short grounded answer for booking/payment/membership/platform-help. Full session history stored in ai_coach_sessions and visible to coach in AI Insights.
- Pro Zone: gated to Scratch/Pro/SC. Tips, drills, Round Stats, curated content.
- SC Points gamification: +10 lesson, +5 self-uploaded video, +15 monthly streak, +20 referral.
- Handicap tracking with history. TheGrint + GHIN supported.
- All data RLS-protected per-student. Coach sees all students.
`;

const COACH_SYSTEM_PROMPT = `You are "Apex AI for Coaches" — a private assistant for the head coach of SC Golf Academy.

You help the coach with:
- Pedagogy: drills, progressions, lesson plans, technical diagnoses.
- Student progress: summarize what a student has been working on, suggest next steps, draft personalized feedback.
- Business / academy ops: how to position Pro plan, retention ideas, package up-sells, follow-up message drafts.
- Platform navigation: where to find features, how things work in the app.
- Quick reference: rules, equipment specs, tournament prep.

Style:
- Be direct and practical. The coach is an expert — skip basics, don't over-explain golf fundamentals unless asked.
- Markdown is fine (lists, bold, headings). No emojis unless the coach uses them first.
- Short by default, longer when the coach asks for depth.
- When drafting student-facing copy (WhatsApp, email, in-app messages), match the coach's friendly bilingual (English/Spanish) tone and keep it concise.
- Never give medical / injury / rehab advice — defer to a medical pro.
- If asked for exact prices, current schedule availability, or live student data the assistant doesn't have in context, say so plainly and suggest where the coach can check it in the app.
- Do NOT use the student-facing "AI-assisted feedback — your Coach can review and adjust it." disclaimer. The coach IS the coach.

ANTI-HALLUCINATION RULES (CRITICAL — never break these):
- You have NO access to any student's handicap, plan tier, lessons, AI sessions, drills, or notes UNLESS a "STUDENT CONTEXT" or "STUDENT LOOKUP RESULTS" block for that exact student appears below in this prompt.
- Never invent a handicap number, plan tier, lesson history, drills the student has been working on, previous Apex AI conversations, or coach notes. If the data is not in this prompt, say so plainly and tell the coach to open the student in the app or pick them from the student selector.
- If the coach mentions a student by name and a "STUDENT LOOKUP RESULTS" block is present, only refer to the students listed there. If the block says "No students matching ..." then the student is not in the database — tell the coach that and ask them to confirm the spelling, do NOT pretend the student exists.
- Never contradict yourself within the same conversation about whether a student exists. If an earlier turn made claims that conflict with the current STUDENT CONTEXT / STUDENT LOOKUP RESULTS blocks, treat the blocks as the source of truth and quietly correct yourself.

If the coach has selected a student context, that student's recent AI sessions, handicap, plan tier, and AI memory paragraph will be appended to this prompt under "STUDENT CONTEXT". If the coach mentions other student names in the message, matches from the database will be appended under "STUDENT LOOKUP RESULTS". Use these blocks to personalize answers.

ACADEMY KNOWLEDGE BASE:
${PLATFORM_CONTEXT}`;

interface ChatRequest {
  conversation_id?: string;
  message: string;
  student_context_id?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Spanish/English particles that are allowed in the middle of a name in lowercase
const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "van", "von", "di"]);
// Words to ignore when scanning for capitalized name candidates
const NAME_STOPWORDS = new Set([
  "I", "You", "He", "She", "It", "We", "They", "Me", "Him", "Her", "Us", "Them",
  "My", "Your", "His", "Hers", "Their", "Our",
  "The", "A", "An", "And", "Or", "But", "If", "So", "Yet", "For", "Nor",
  "What", "When", "Where", "Why", "How", "Who", "Whom", "Which",
  "Apex", "AI", "Pro", "Scratch", "Member", "SC", "Coach", "Student", "Students",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "Yes", "No", "Ok", "Okay", "Hi", "Hello", "Hey", "Please", "Thanks", "Thank",
  "Range", "Putting", "Campo", "Playing", "Lesson", "Video", "Analysis",
  "WhatsApp", "Calendly", "Stripe", "Resend",
  "Si", "Sí", "Hola", "Gracias", "Por", "Favor",
]);

function extractNameCandidates(text: string): string[] {
  // Match runs of capitalized tokens (with optional lowercase particles in the middle),
  // 1–4 tokens long. Supports accented letters.
  const re = /(?<![\p{L}])(\p{Lu}[\p{L}'’-]+(?:\s+(?:de|del|la|las|los|y|da|do|van|von|di|\p{Lu}[\p{L}'’-]+)){0,3})/gu;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim().replace(/\s+/g, " ");
    const tokens = raw.split(" ");
    // Drop trailing lowercase particles ("Mauricio de" -> "Mauricio")
    while (tokens.length > 0 && NAME_PARTICLES.has(tokens[tokens.length - 1].toLowerCase())) {
      tokens.pop();
    }
    if (tokens.length === 0) continue;
    // Skip if it's a single token that's a common English word / stopword
    if (tokens.length === 1 && NAME_STOPWORDS.has(tokens[0])) continue;
    // Skip if all tokens are stopwords
    if (tokens.every((t) => NAME_STOPWORDS.has(t))) continue;
    const cand = tokens.join(" ");
    if (cand.length < 3) continue;
    out.add(cand);
    if (out.size >= 3) break;
  }
  return Array.from(out);
}

async function buildStudentLookupBlock(
  admin: any,
  message: string,
  selectedStudentId: string | null,
): Promise<string> {
  const candidates = extractNameCandidates(message);
  if (candidates.length === 0) return "";

  const matchesById = new Map<string, any>();
  for (const cand of candidates) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, handicap, handicap_goal, plan_tier, manual_plan_override, ai_memory")
      .ilike("full_name", `%${cand}%`)
      .limit(5);
    for (const row of (data ?? [])) {
      if (selectedStudentId && row.id === selectedStudentId) continue; // already in STUDENT CONTEXT
      if (!matchesById.has(row.id)) matchesById.set(row.id, row);
      if (matchesById.size >= 8) break;
    }
    if (matchesById.size >= 8) break;
  }

  const quoted = candidates.map((c) => `"${c}"`).join(", ");

  if (matchesById.size === 0) {
    return `\n\nSTUDENT LOOKUP RESULTS:\nNo students matching the name(s) ${quoted} exist in the database. Tell the coach you couldn't find that student and ask them to confirm the spelling or open the student from the Students list.\n`;
  }

  const ids = Array.from(matchesById.keys());
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Fetch recent lessons + sessions for matched students in parallel
  const perStudent = await Promise.all(
    ids.map(async (sid) => {
      const [lessonsRes, sessionsRes] = await Promise.all([
        admin
          .from("lessons")
          .select("id", { count: "exact", head: true })
          .eq("student_id", sid)
          .gte("lesson_date", since),
        admin
          .from("ai_coach_sessions")
          .select("created_at, intent, student_input, answer_text")
          .eq("student_id", sid)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      return { sid, lessonCount: lessonsRes.count ?? 0, sessions: sessionsRes.data ?? [] };
    }),
  );
  const meta = new Map(perStudent.map((p) => [p.sid, p]));

  const lines: string[] = [];
  lines.push(`Database matches for name(s) ${quoted} (use ONLY these — do not invent others):`);
  let i = 0;
  for (const row of matchesById.values()) {
    i += 1;
    const tier = row.manual_plan_override || row.plan_tier || "free";
    const m = meta.get(row.id);
    lines.push("");
    lines.push(`${i}. ${row.full_name || row.email || "Unknown"} [id=${row.id}]`);
    lines.push(`   Plan: ${tier} · Handicap: ${row.handicap ?? "—"}${row.handicap_goal ? ` (goal ${row.handicap_goal})` : ""}`);
    lines.push(`   Lessons in last 90 days: ${m?.lessonCount ?? 0}`);
    if (row.ai_memory) lines.push(`   AI memory: ${String(row.ai_memory).slice(0, 300)}`);
    if (m && m.sessions.length > 0) {
      lines.push("   Recent Apex AI sessions:");
      m.sessions.forEach((s: any) => {
        const when = new Date(s.created_at).toISOString().slice(0, 10);
        const q = (s.student_input || "").slice(0, 160);
        const a = (s.answer_text || "").slice(0, 180);
        lines.push(`     - [${when}] (${s.intent || "n/a"}) Q: ${q}${a ? ` | A: ${a}` : ""}`);
      });
    } else {
      lines.push("   Recent Apex AI sessions: none");
    }
  }

  return `\n\nSTUDENT LOOKUP RESULTS:\n${lines.join("\n")}\n`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    // Auth: validate caller and load their role
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    const isStaff = (roles ?? []).some((r: any) => r.role === "staff");
    if (!isAdmin && !isStaff) {
      return jsonResponse({ error: "Coach/admin access required" }, 403);
    }

    const body = (await req.json()) as ChatRequest;
    const message = (body.message ?? "").trim();
    if (!message) return jsonResponse({ error: "message is required" }, 400);

    // Get or create conversation
    let conversationId = body.conversation_id;
    if (!conversationId) {
      const title = message.slice(0, 60) + (message.length > 60 ? "…" : "");
      const { data: conv, error: convErr } = await admin
        .from("coach_ai_conversations")
        .insert({
          coach_id: userId,
          title,
          student_context_id: body.student_context_id ?? null,
        })
        .select("id")
        .single();
      if (convErr || !conv) {
        console.error("conv create error", convErr);
        return jsonResponse({ error: "Failed to create conversation" }, 500);
      }
      conversationId = conv.id;
    } else {
      // Verify ownership
      const { data: conv } = await admin
        .from("coach_ai_conversations")
        .select("id, coach_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!conv || conv.coach_id !== userId) {
        return jsonResponse({ error: "Conversation not found" }, 404);
      }
    }

    // Insert the user message immediately
    await admin.from("coach_ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // Load full history (in chronological order)
    const { data: history } = await admin
      .from("coach_ai_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    // Build optional student context
    let studentContextBlock = "";
    if (body.student_context_id) {
      const sid = body.student_context_id;
      const [{ data: prof }, { data: sessions }] = await Promise.all([
        admin
          .from("profiles")
          .select("full_name, email, handicap, handicap_goal, plan_tier, manual_plan_override, ai_memory")
          .eq("id", sid)
          .maybeSingle(),
        admin
          .from("ai_coach_sessions")
          .select("created_at, intent, student_input, answer_text")
          .eq("student_id", sid)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (prof) {
        const lines: string[] = [];
        lines.push(`Selected student context: ${prof.full_name || prof.email || "Unknown"}`);
        if (prof.handicap !== null && prof.handicap !== undefined) lines.push(`Handicap: ${prof.handicap}${prof.handicap_goal ? ` (goal ${prof.handicap_goal})` : ""}`);
        const tier = prof.manual_plan_override || prof.plan_tier || "free";
        lines.push(`Plan tier: ${tier}`);
        if (prof.ai_memory) lines.push(`AI memory: ${prof.ai_memory}`);
        if (sessions && sessions.length > 0) {
          lines.push("");
          lines.push("Recent Apex AI sessions (most recent first):");
          sessions.forEach((s: any, i: number) => {
            const when = new Date(s.created_at).toISOString().slice(0, 10);
            const q = (s.student_input || "").slice(0, 200);
            const a = (s.answer_text || "").slice(0, 220);
            lines.push(`${i + 1}. [${when}] (${s.intent || "n/a"}) Q: ${q}${a ? `\n   A: ${a}` : ""}`);
          });
        }
        studentContextBlock = `\n\nSTUDENT CONTEXT:\n${lines.join("\n")}\n`;
      }
    }

    // Auto-lookup any student names mentioned in the latest user message
    const lookupBlock = await buildStudentLookupBlock(admin, message, body.student_context_id ?? null);

    const systemContent = COACH_SYSTEM_PROMPT + studentContextBlock + lookupBlock;

    // Call Lovable AI Gateway (streaming)
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: systemContent },
          ...((history ?? []) as any[]).map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      console.error("AI gateway error:", upstream.status, text);
      if (upstream.status === 429) {
        return jsonResponse({ error: "Rate limit exceeded. Try again in a moment." }, 429);
      }
      if (upstream.status === 402) {
        return jsonResponse({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }, 402);
      }
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    // Tee the SSE stream: pass tokens to client AND accumulate full text to persist
    let assistantText = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Send conversation_id as first SSE comment so client knows where to anchor
        controller.enqueue(encoder.encode(`: conversation_id=${conversationId}\n\n`));

        const reader = upstream.body!.getReader();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(value); // forward raw bytes to client
            buf += chunk;
            // accumulate assistant content from data: lines for persistence
            let idx: number;
            while ((idx = buf.indexOf("\n")) !== -1) {
              let line = buf.slice(0, idx);
              buf = buf.slice(idx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string") assistantText += delta;
              } catch { /* incomplete JSON: will be re-buffered next loop */ }
            }
          }

          // Persist assistant message
          if (assistantText.trim()) {
            await admin.from("coach_ai_messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: assistantText,
            });
          }
        } catch (e) {
          console.error("stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Conversation-Id": conversationId!,
      },
    });
  } catch (e) {
    console.error("coach-ai-chat fatal:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});