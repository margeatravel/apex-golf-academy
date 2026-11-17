// Analyze Swing edge function
// Sends a hosted swing video URL + optional notes to the Lovable AI Gateway
// (Gemini) and returns structured swing-analysis JSON to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a professional golf swing analyst with 20 years of experience coaching tour players. You are analyzing a real student golf swing video. You MUST produce a unique, specific analysis based only on what you actually observe in this video. Do not produce generic feedback. Use this scoring rubric:
- 1-3: Complete beginner, major fundamental flaws in every aspect
- 4-5: High handicapper (20+), multiple significant faults
- 6-7: Mid handicapper (10-20), some faults but decent fundamentals
- 7-8: Low handicapper (5-10), solid swing with minor faults
- 8-9: Scratch to plus handicap, near-tour quality mechanics
- 9-10: Tour professional level, exceptional mechanics throughout
When in doubt, score generously — it is better to encourage a student with a slightly high score than to discourage them with an unfairly low one. A swing that looks athletic and structured should never score below 6. IMPORTANT SCORING RULE: If every single metric is rated good, the overall_score must be between 8.75 and 10.0. A swing with all good metrics cannot score below 8.75. Only deduct from this range if there are faults of medium or high severity. Every metric value must reflect what is actually visible in the swing. Return ONLY a valid JSON object with no markdown, no preamble, in this exact shape: { overall_score: number between 1-10 (must vary based on actual swing quality), summary: 2-3 sentences describing specifically what you see in THIS swing, metrics: { hip_rotation: { value: string, unit: degrees, rating: good or average or needs_work }, spine_angle: { value: string, unit: degrees, rating: good or average or needs_work }, tempo_ratio: { value: string, unit: ratio, rating: good or average or needs_work }, club_path: { value: string, unit: degrees, rating: good or average or needs_work }, weight_transfer: { value: string, unit: %, rating: good or average or needs_work } }, faults: [ { name: string, description: specific observation from THIS video, severity: low or medium or high } ], strengths: [ { name: string, description: specific observation from THIS video } ], drills: [ { name: string, description: string } ] }`;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripCodeFences(s: string): string {
  let out = s.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!LOVABLE_API_KEY) {
      return jsonResp({ error: "AI is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResp({ error: "Missing authorization." }, 401);
    }

    // Validate user JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResp({ error: "Invalid session." }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body) return jsonResp({ error: "Invalid JSON body." }, 400);

    const videoUrl = typeof body.video_url === "string" ? body.video_url.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
      return jsonResp({ error: "video_url must be an http(s) URL." }, 400);
    }

    const userContent = [
      `Here is the student's golf swing video: ${videoUrl}`,
      notes ? `Student notes (if any): ${notes}` : "Student notes (if any): none",
      "Analyze this specific swing video carefully and thoroughly. Look for: setup and address position, grip, takeaway path, backswing length and position, downswing sequence, impact position, follow-through, and finish. Your feedback must be specific to what you observe — mention specific body parts, positions, and moments in the swing. Do not give the same score or metrics you would give any other student.",
    ].join("\n\n");

    const gatewayResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!gatewayResp.ok) {
      const txt = await gatewayResp.text().catch(() => "");
      console.error("analyze-swing gateway error", gatewayResp.status, txt);
      if (gatewayResp.status === 429) {
        return jsonResp({ error: "Rate limit reached. Please try again in a moment." }, 429);
      }
      if (gatewayResp.status === 402) {
        return jsonResp({ error: "AI credits exhausted. Please contact your Coach." }, 402);
      }
      return jsonResp({ error: "AI service error." }, 502);
    }

    const completion = await gatewayResp.json();
    const raw = completion?.choices?.[0]?.message?.content ?? "";
    if (!raw || typeof raw !== "string") {
      return jsonResp({ error: "AI returned an empty response." }, 502);
    }

    let feedback: unknown;
    try {
      feedback = JSON.parse(stripCodeFences(raw));
    } catch (e) {
      console.error("analyze-swing JSON parse failed", e, raw.slice(0, 500));
      return jsonResp({ error: "AI returned invalid JSON.", raw }, 502);
    }

    return jsonResp({ feedback });
  } catch (err) {
    console.error("analyze-swing unhandled error", err);
    return jsonResp({ error: "Unexpected server error." }, 500);
  }
});