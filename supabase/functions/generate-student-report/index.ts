import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "..." : s);

/** Lesson reports a student may generate for themselves per calendar month. */
const MAX_STUDENT_LESSON_REPORTS_PER_MONTH = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Gemini directo (decision 21 nov 2026: Gemini es la IA de la Academy; la
    // llave del gateway de Lovable nunca migro y ya no existe). gemini-3.5-flash
    // es el modelo estable verificado funcionando el 21 nov.
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");
    const GEMINI_MODEL = "gemini-3.5-flash";

    // Validate JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { student_id, date_start, date_end, language, title, persist } = await req.json();
    if (!student_id || !date_start || !date_end) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: admin, staff with lessons scope, family parent, or active parent_access_grant
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const { data: perms } = await admin.from("staff_permissions").select("scope").eq("user_id", user.id);
    const isAdmin = roles?.some((r: any) => r.role === "admin");
    const isStaff = perms?.some((p: any) => p.scope === "lessons");

    const isStudentSelf = user.id === student_id;

    let isParent = false;
    if (!isAdmin && !isStaff && !isStudentSelf) {
      const { data: famLink } = await admin
        .from("family_links")
        .select("id")
        .eq("parent_user_id", user.id)
        .eq("child_user_id", student_id)
        .maybeSingle();
      if (famLink) {
        isParent = true;
      } else if (user.email) {
        const { data: grant } = await admin
          .from("parent_access_grants")
          .select("id")
          .eq("student_id", student_id)
          .is("revoked_at", null)
          .ilike("parent_email", user.email)
          .maybeSingle();
        if (grant) isParent = true;
      }
    }

    if (!isAdmin && !isStaff && !isParent && !isStudentSelf) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Students generating their own lesson reports are capped per calendar month.
    const isStudentGenerated = isStudentSelf && !isAdmin && !isStaff;
    if (isStudentGenerated) {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { count } = await admin
        .from("student_reports")
        .select("id", { count: "exact", head: true })
        .eq("student_id", student_id)
        .eq("report_type", "lesson")
        .eq("generated_by_student", true)
        .gte("created_at", monthStart);
      if ((count ?? 0) >= MAX_STUDENT_LESSON_REPORTS_PER_MONTH) {
        return new Response(
          JSON.stringify({ error: "lesson_report_limit", limit: MAX_STUDENT_LESSON_REPORTS_PER_MONTH }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const lang: "en" | "es" = language === "es" ? "es" : "en";

    // In Spanish, only two lesson types exist in reports.
    const normalizeLessonType = (t: string | null | undefined) => {
      if (lang !== "es") return t || "Standard";
      const v = (t || "").toLowerCase();
      if (v.includes("campo") || v.includes("playing") || v.includes("field")) {
        return "Clase en campo";
      }
      return "Clase en tiro de práctica";
    };

    // Historical window start (6 months before date_end) for trend/theme analysis only.
    const histStart = (() => {
      const d = new Date(date_end + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - 6);
      return d.toISOString().slice(0, 10);
    })();

    // Fetch all student data for the date range
    const [
      profileRes, lessonsRes, videosRes, mediaRes, roundsRes, packagesRes,
      handicapRes, standaloneNotesRes, histLessonsRes, histVideosRes,
    ] = await Promise.all([
      admin.from("profiles").select("full_name, email, plan_tier, handicap, manual_plan_override").eq("id", student_id).single(),
      admin.from("lessons").select("id, lesson_date, lesson_time, lesson_type, status, coach_notes, student_notes, duration_minutes, package_id").eq("student_id", student_id).eq("skipped", false).eq("status", "completed").gte("lesson_date", date_start).lte("lesson_date", date_end).order("lesson_date"),
      admin.from("videos").select("id, title, description, coach_feedback, next_steps, upload_date, category, lesson_id").eq("student_id", student_id).gte("upload_date", date_start + "T00:00:00").lte("upload_date", date_end + "T23:59:59").order("upload_date"),
      admin.from("student_media").select("title, uploaded_at, file_type").eq("student_id", student_id).gte("uploaded_at", date_start + "T00:00:00").lte("uploaded_at", date_end + "T23:59:59").order("uploaded_at"),
      admin.from("golf_rounds").select("played_on, total_score, course_par, course_name_snapshot, holes_played, fairways_hit, fairways_total, greens_in_regulation, putts, penalties, lost_balls, round_type, notes, birdies, bogeys, pars, doubles_plus, eagles, up_downs_attempted, up_downs_converted, par3_avg, par4_avg, par5_avg").eq("student_id", student_id).gte("played_on", date_start).lte("played_on", date_end).order("played_on"),
      admin.from("class_packages").select("id, package_name, package_size, classes_remaining, is_active, price, amount_paid, payment_date, payment_status").eq("user_id", student_id).order("payment_date", { ascending: false }),
      admin.from("handicap_history").select("handicap, recorded_at").eq("user_id", student_id).order("recorded_at"),
      admin.from("student_coach_notes").select("title, body, created_at").eq("student_id", student_id).order("created_at"),
      admin.from("lessons").select("id, lesson_date, lesson_type, coach_notes, student_notes").eq("student_id", student_id).eq("skipped", false).eq("status", "completed").gte("lesson_date", histStart).lte("lesson_date", date_end),
      admin.from("videos").select("upload_date, coach_feedback, next_steps, description, lesson_id").eq("student_id", student_id).gte("upload_date", histStart + "T00:00:00").lte("upload_date", date_end + "T23:59:59"),
    ]);

    const profile = profileRes.data;
    const lessons = lessonsRes.data ?? [];
    const videos = videosRes.data ?? [];
    const media = (mediaRes.data ?? []) as any[];
    const rounds = (roundsRes.data ?? []) as any[];
    const allPackages = (packagesRes.data ?? []) as any[];
    const handicapHistory = (handicapRes.data ?? []) as any[];
    const standaloneNotes = (standaloneNotesRes.data ?? []) as any[];
    const histLessons = (histLessonsRes.data ?? []) as any[];
    const histVideos = (histVideosRes.data ?? []) as any[];

    // To compute REAL lessons used per package (the stored class_packages.classes_used
    // is known to drift), we also need the full lesson history per package for
    // each package we may show. Fetch all completed lessons for this student
    // (no date filter) and count by package_id.
    const { data: allCompletedLessons } = await admin
      .from("lessons")
      .select("id, lesson_date, lesson_type, status, package_id")
      .eq("student_id", student_id)
      .eq("status", "completed");
    // Field/Playing lessons consume 2 package slots (matches DB function)
    const slotCost = (t?: string | null) =>
      t && ["Campo", "Playing Lesson", "Field Lesson"].includes(t) ? 2 : 1;
    const usedByPkg = new Map<string, number>();
    const usedByPkgInPeriod = new Map<string, number>();
    for (const l of (allCompletedLessons ?? []) as any[]) {
      if (!l.package_id) continue;
      const cost = slotCost(l.lesson_type);
      usedByPkg.set(l.package_id, (usedByPkg.get(l.package_id) ?? 0) + cost);
      if (l.lesson_date && l.lesson_date >= date_start && l.lesson_date <= date_end) {
        usedByPkgInPeriod.set(l.package_id, (usedByPkgInPeriod.get(l.package_id) ?? 0) + cost);
      }
    }

    // Packages: include if computed-active, paid in period, or had any lesson in period.
    // Computed-active = used slots < package_size (ignore stale class_packages.is_active).
    let packages = allPackages.filter((p: any) => {
      const usedSlots = usedByPkg.get(p.id) ?? 0;
      const computedActive = (p.package_size ?? 0) > 0 && usedSlots < (p.package_size ?? 0);
      if (computedActive) return true;
      if (p.payment_date && p.payment_date >= date_start && p.payment_date <= date_end) return true;
      if ((usedByPkgInPeriod.get(p.id) ?? 0) > 0) return true;
      return false;
    });

    // When the student generates their own report, strip all package/payment
    // data so the report focuses exclusively on their game.
    if (isStudentSelf) {
      packages = [];
    }

    const studentName = profile?.full_name || profile?.email || "Unknown Student";
    const completedLessons = lessons.filter((l: any) => l.status === "completed");

    // ---- Shared package attendance: who actually took each lesson ----
    // Lessons on packages shared with this student may have been taken by
    // another member or by everyone together (taken_together).
    const sharedPkgIds = new Set<string>();
    const { data: memberRows } = await admin
      .from("package_members").select("package_id").eq("student_id", student_id);
    for (const r of (memberRows ?? []) as any[]) sharedPkgIds.add(r.package_id);
    const ownedIds = allPackages.map((p: any) => p.id);
    if (ownedIds.length) {
      const { data: otherMemberRows } = await admin
        .from("package_members").select("package_id").in("package_id", ownedIds);
      for (const r of (otherMemberRows ?? []) as any[]) sharedPkgIds.add(r.package_id);
    }
    let sharedAttendanceBlock = "";
    if (sharedPkgIds.size > 0) {
      const { data: sharedLessons } = await admin
        .from("lessons")
        .select("id, lesson_date, lesson_time, lesson_type, student_id, taken_together")
        .in("package_id", [...sharedPkgIds])
        .eq("skipped", false)
        .eq("status", "completed")
        .gte("lesson_date", date_start)
        .lte("lesson_date", date_end)
        .order("lesson_date");
      const attendeeIds = [...new Set((sharedLessons ?? []).map((l: any) => l.student_id).filter(Boolean))] as string[];
      const nameById = new Map<string, string>();
      if (attendeeIds.length) {
        const { data: profs } = await admin
          .from("profiles").select("id, full_name, email").in("id", attendeeIds);
        for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name || p.email || "Unknown");
      }
      const attendanceLines = (sharedLessons ?? []).map((l: any) => {
        const who = l.taken_together
          ? (lang === "es" ? "juntos (todos los miembros)" : "together (all members)")
          : (nameById.get(l.student_id) || "Unknown");
        return `- ${l.lesson_date} ${l.lesson_time || ""} | ${normalizeLessonType(l.lesson_type)} | ${lang === "es" ? "la tomó" : "taken by"}: ${who}`;
      });
      if (attendanceLines.length) {
        sharedAttendanceBlock = `### Shared Package Attendance (who took each lesson on shared packages)
${attendanceLines.join("\n")}`;
      }
    }

    // ---- Handicap bracket ----
    const hcRaw = profile?.handicap;
    const hcNum = typeof hcRaw === "number" ? hcRaw : (hcRaw != null ? Number(hcRaw) : null);
    let hcBracket = "unknown";
    let nextBracketTarget = "single-digit handicap";
    if (hcNum != null && !isNaN(hcNum)) {
      if (hcNum <= 0) { hcBracket = "scratch (≤0)"; nextBracketTarget = "PGA Tour benchmarks"; }
      else if (hcNum <= 9) { hcBracket = "single-digit (1–9)"; nextBracketTarget = "scratch level"; }
      else if (hcNum <= 15) { hcBracket = "mid (10–15)"; nextBracketTarget = "single-digit handicap"; }
      else if (hcNum <= 22) { hcBracket = "high (16–22)"; nextBracketTarget = "mid handicap (10–15)"; }
      else { hcBracket = "beginner (23+)"; nextBracketTarget = "high handicap (16–22)"; }
    }

    // ---- Handicap trend (in period) ----
    const hcInPeriod = handicapHistory.filter((h: any) => {
      const d = (h.recorded_at || "").slice(0, 10);
      return d >= date_start && d <= date_end;
    });
    const hcFirst = hcInPeriod[0]?.handicap;
    const hcLast = hcInPeriod[hcInPeriod.length - 1]?.handicap;
    const hcDelta = (hcFirst != null && hcLast != null) ? (Number(hcLast) - Number(hcFirst)).toFixed(1) : null;
    const hcAllTimeLow = handicapHistory.length ? Math.min(...handicapHistory.map((h: any) => Number(h.handicap)).filter((n) => !isNaN(n))) : null;
    const handicapTrendBlock = handicapHistory.length ? `### Handicap Trend
- Bracket: ${hcBracket}
- Current: ${hcNum ?? "N/A"}
- In-period first: ${hcFirst ?? "N/A"} | last: ${hcLast ?? "N/A"} | delta: ${hcDelta ?? "N/A"}
- All-time low on record: ${hcAllTimeLow ?? "N/A"}` : "";

    // ---- Working themes (6-month notes corpus) ----
    const themeKeywords: Record<string, string[]> = {
      "swing path": ["swing path", "path", "plano", "plane"],
      "putting": ["putt", "putting", "putter"],
      "grip": ["grip", "agarre"],
      "alignment": ["alignment", "aim", "alinea"],
      "tempo": ["tempo", "rhythm", "ritmo"],
      "contact": ["contact", "strike", "compresi", "contacto"],
      "short game": ["short game", "chip", "pitch", "wedge", "juego corto"],
      "mental": ["mental", "focus", "confidence", "mentalidad"],
      "distance control": ["distance control", "distancia", "yardage"],
      "ball flight": ["ball flight", "draw", "fade", "slice", "hook", "vuelo"],
    };
    const histCorpus = [
      ...histLessons.map((l: any) => `${l.coach_notes || ""} ${l.student_notes || ""}`),
      ...histVideos.map((v: any) => `${v.coach_feedback || ""} ${v.next_steps || ""} ${v.description || ""}`),
      ...standaloneNotes.map((n: any) => `${n.title || ""} ${n.body || ""}`),
    ].join(" ").toLowerCase();
    const themeTally = Object.entries(themeKeywords)
      .map(([theme, kws]) => {
        let count = 0;
        for (const kw of kws) {
          const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
          count += (histCorpus.match(re) || []).length;
        }
        return { theme, count };
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
    const workingThemesBlock = themeTally.length ? `### Working Themes (last 6 months, keyword frequency)
${themeTally.map((t) => `- ${t.theme}: ${t.count}`).join("\n")}` : "";

    // ---- Video ↔ coach-notes correlation (in-period videos) ----
    const lessonsById = new Map<string, any>();
    for (const l of lessons) lessonsById.set(l.id, l);
    const videoCorrelationLines: string[] = [];
    for (const v of videos as any[]) {
      const sameLesson = v.lesson_id ? lessonsById.get(v.lesson_id) : null;
      const vDate = v.upload_date;
      const nearby = standaloneNotes.filter((n: any) => {
        if (!vDate || !n.created_at) return false;
        const nd = new Date(n.created_at).getTime();
        const vd = new Date(vDate).getTime();
        return Math.abs(nd - vd) <= 7 * 86400000;
      });
      const parts = [`- ${vDate} | ${v.title || "Untitled"}${v.category ? ` [${v.category}]` : ""}`];
      if (v.coach_feedback?.trim()) parts.push(`video coach feedback: "${truncate(v.coach_feedback.trim(), 400)}"`);
      if (sameLesson?.coach_notes?.trim()) parts.push(`same-lesson coach note: "${truncate(sameLesson.coach_notes.trim(), 400)}"`);
      for (const n of nearby) {
        parts.push(`±7d note (${(n.created_at || "").slice(0,10)}): "${truncate((n.body || "").trim(), 300)}"`);
      }
      videoCorrelationLines.push(parts.join(" | "));
    }
    const videoCorrelationBlock = videoCorrelationLines.length ? `### Video ↔ Coach Notes Correlation
${videoCorrelationLines.join("\n")}` : "";

    // ---- Standalone coach notes block ----
    const standaloneNotesBlock = standaloneNotes.length ? `### Standalone Coach Notes (full history, ${standaloneNotes.length})
${standaloneNotes.slice(-20).map((n: any) => `- ${(n.created_at || "").slice(0,10)} | ${n.title || ""}: "${truncate((n.body || "").trim(), 240)}"`).join("\n")}` : "";

    // ---- Package lifecycle (current OR most recent) ----
    const lessonsByPkg = new Map<string, any[]>();
    for (const l of (allCompletedLessons ?? []) as any[]) {
      if (!l.package_id) continue;
      if (!lessonsByPkg.has(l.package_id)) lessonsByPkg.set(l.package_id, []);
      lessonsByPkg.get(l.package_id)!.push(l);
    }
    const pkgLifecycleLines: string[] = [];
    for (const p of packages) {
      const used = usedByPkg.get(p.id) ?? 0;
      const size = p.package_size ?? 0;
      const remaining = Math.max(0, size - used);
      const active = size > 0 && remaining > 0;
      const status = active ? (lang === "es" ? "activo" : "active") : (lang === "es" ? "completado" : "completed");
      const lsns = (lessonsByPkg.get(p.id) || []).filter((l: any) => l.lesson_date)
        .sort((a: any, b: any) => a.lesson_date.localeCompare(b.lesson_date));
      const firstLesson = lsns[0]?.lesson_date || "N/A";
      const lastLesson = lsns[lsns.length - 1]?.lesson_date || "N/A";
      pkgLifecycleLines.push(
        `- ${p.package_name || "Package"} | size ${size} | used ${used} | remaining ${remaining} | start (paid) ${p.payment_date || "N/A"} | first lesson ${firstLesson} | last lesson ${lastLesson} | amount paid $${p.amount_paid ?? 0} | ${p.payment_status || ""} | ${status}`
      );
    }
    const packageLifecycleBlock = pkgLifecycleLines.length ? `### Package Lifecycle (merged into Lessons & Packages)
${pkgLifecycleLines.join("\n")}` : "";

    // ---- Package single-sentence summary (active OR most recent) ----
    let packageSentence = "";
    let packageSentenceEn = "";
    if (!isStudentSelf) {
      const activePkgs = allPackages.filter((p: any) => {
        const usedSlots = usedByPkg.get(p.id) ?? 0;
        const size = p.package_size ?? 0;
        return size > 0 && usedSlots < size;
      });
      if (activePkgs.length > 0) {
        const p = [...activePkgs].sort((a: any, b: any) => (b.payment_date || "").localeCompare(a.payment_date || ""))[0];
        const size = p.package_size ?? 0;
        const used = usedByPkg.get(p.id) ?? 0;
        const lsns = (lessonsByPkg.get(p.id) || []).filter((l: any) => l.lesson_date)
          .sort((a: any, b: any) => a.lesson_date.localeCompare(b.lesson_date));
        const firstLesson = lsns[0]?.lesson_date || "N/A";
        const fieldLessons = lsns.filter((l: any) => {
          const t = (l.lesson_type || "").toLowerCase();
          return t.includes("campo") || t.includes("playing") || t.includes("field");
        });
        packageSentence = `Actualmente cursa un paquete de ${size} clases iniciado el ${firstLesson}, llevando ${used} de ${size} clases tomadas.${fieldLessons.length > 0 ? ` Incluye salida a campo el ${fieldLessons[0].lesson_date}.` : ""}`;
        packageSentenceEn = `Currently taking a package of ${size} lessons started on ${firstLesson}, having taken ${used} of ${size} lessons.${fieldLessons.length > 0 ? ` Includes a field round on ${fieldLessons[0].lesson_date}.` : ""}`;
      } else {
        const completedPkgs = allPackages.filter((p: any) => {
          const usedSlots = usedByPkg.get(p.id) ?? 0;
          const size = p.package_size ?? 0;
          return size > 0 && usedSlots >= size;
        });
        if (completedPkgs.length > 0) {
          const p = [...completedPkgs].sort((a: any, b: any) => (b.payment_date || "").localeCompare(a.payment_date || ""))[0];
          const size = p.package_size ?? 0;
          const lsns = (lessonsByPkg.get(p.id) || []).filter((l: any) => l.lesson_date)
            .sort((a: any, b: any) => a.lesson_date.localeCompare(b.lesson_date));
          const firstLesson = lsns[0]?.lesson_date || "N/A";
          const lastLesson = lsns[lsns.length - 1]?.lesson_date || "N/A";
          packageSentence = `Último paquete: ${size} clases iniciado el ${firstLesson}, finalizado el ${lastLesson}.`;
          packageSentenceEn = `Last package: ${size} lessons started on ${firstLesson}, completed on ${lastLesson}.`;
        }
      }
    }

    // Build a notes corpus for synthesis (NOT for verbatim display)
    const lessonNotesLines = [...lessons]
      .filter((l: any) => (l.coach_notes && l.coach_notes.trim()) || (l.student_notes && l.student_notes.trim()))
      .sort((a: any, b: any) => (b.lesson_date || "").localeCompare(a.lesson_date || ""))
      .map((l: any) => {
        const parts = [`- ${l.lesson_date} ${normalizeLessonType(l.lesson_type)}`];
        if (l.coach_notes?.trim()) parts.push(`coach: "${truncate(l.coach_notes.trim(), 400)}"`);
        if (l.student_notes?.trim()) parts.push(`student: "${truncate(l.student_notes.trim(), 400)}"`);
        return parts.join(" | ");
      });
    const videoNotesLines = [...videos]
      .filter((v: any) => (v.description && v.description.trim()) || (v.coach_feedback && v.coach_feedback.trim()) || (v.next_steps && v.next_steps.trim()))
      .sort((a: any, b: any) => (b.upload_date || "").localeCompare(a.upload_date || ""))
      .map((v: any) => {
        const parts = [`- ${v.upload_date} ${v.title || "Untitled"}${v.category ? ` (${v.category})` : ""}`];
        if (v.description?.trim()) parts.push(`description: "${truncate(v.description.trim(), 400)}"`);
        if (v.coach_feedback?.trim()) parts.push(`coach feedback: "${truncate(v.coach_feedback.trim(), 400)}"`);
        if (v.next_steps?.trim()) parts.push(`next steps: "${truncate(v.next_steps.trim(), 400)}"`);
        return parts.join(" | ");
      });
    const notesCorpus = (lessonNotesLines.length || videoNotesLines.length)
      ? `
### Notes Corpus (for synthesis only — DO NOT paste verbatim)
${lessonNotesLines.length ? `Lesson notes (${lessonNotesLines.length}):\n${lessonNotesLines.join("\n")}` : ""}
${videoNotesLines.length ? `\nVideo notes (${videoNotesLines.length}):\n${videoNotesLines.join("\n")}` : ""}`
      : "";

    // Pre-calculate round aggregates
    let roundAggregates = "";
    if (rounds.length > 0) {
      const avgScoreVsPar = rounds.reduce((s: number, r: any) => s + (r.total_score - r.course_par), 0) / rounds.length;
      const girRounds = rounds.filter((r: any) => r.greens_in_regulation != null);
      const avgGir = girRounds.length ? (girRounds.reduce((s: number, r: any) => s + r.greens_in_regulation, 0) / girRounds.length).toFixed(1) : "N/A";
      const firRounds = rounds.filter((r: any) => r.fairways_hit != null && r.fairways_total != null && r.fairways_total > 0);
      const firPct = firRounds.length ? ((firRounds.reduce((s: number, r: any) => s + r.fairways_hit, 0) / firRounds.reduce((s: number, r: any) => s + r.fairways_total, 0)) * 100).toFixed(1) + "%" : "N/A";
      const puttRounds = rounds.filter((r: any) => r.putts != null);
      const avgPutts = puttRounds.length ? (puttRounds.reduce((s: number, r: any) => s + r.putts, 0) / puttRounds.length).toFixed(1) : "N/A";
      const birdieRounds = rounds.filter((r: any) => r.birdies != null);
      const avgBirdies = birdieRounds.length ? (birdieRounds.reduce((s: number, r: any) => s + r.birdies, 0) / birdieRounds.length).toFixed(1) : "N/A";
      const bogeyRounds = rounds.filter((r: any) => r.bogeys != null);
      const avgBogeys = bogeyRounds.length ? (bogeyRounds.reduce((s: number, r: any) => s + r.bogeys, 0) / bogeyRounds.length).toFixed(1) : "N/A";
      const udRounds = rounds.filter((r: any) => r.up_downs_attempted != null && r.up_downs_attempted > 0);
      const udPct = udRounds.length ? ((udRounds.reduce((s: number, r: any) => s + (r.up_downs_converted ?? 0), 0) / udRounds.reduce((s: number, r: any) => s + r.up_downs_attempted, 0)) * 100).toFixed(1) + "%" : "N/A";
      const lbRounds = rounds.filter((r: any) => r.lost_balls != null);
      const avgLB = lbRounds.length ? (lbRounds.reduce((s: number, r: any) => s + r.lost_balls, 0) / lbRounds.length).toFixed(1) : "N/A";
      const bestScore = Math.min(...rounds.map((r: any) => r.total_score));
      const bestRound = rounds.find((r: any) => r.total_score === bestScore);

      roundAggregates = `
### Round Stats (${rounds.length} rounds)
**Aggregated Averages:**
- Avg Score vs Par: ${avgScoreVsPar >= 0 ? "+" : ""}${avgScoreVsPar.toFixed(1)}
- Avg GIR: ${avgGir}
- FIR %: ${firPct}
- Avg Putts/Round: ${avgPutts}
- Avg Birdies/Round: ${avgBirdies}
- Avg Bogeys/Round: ${avgBogeys}
- Up & Down %: ${udPct}
- Avg Lost Balls/Round: ${avgLB}
- Best Round: ${bestScore} at ${bestRound?.course_name_snapshot || "Unknown"} on ${bestRound?.played_on}

**Individual Rounds:**
${rounds.map((r: any) => `- ${r.played_on} | ${r.course_name_snapshot || "Unknown"} | Score: ${r.total_score} (Par ${r.course_par}) | ${r.holes_played || 18}h | FIR: ${r.fairways_hit ?? "N/A"}/${r.fairways_total ?? "?"} | GIR: ${r.greens_in_regulation ?? "N/A"} | Putts: ${r.putts ?? "N/A"} | Birdies: ${r.birdies ?? "N/A"} | Bogeys: ${r.bogeys ?? "N/A"} | Lost balls: ${r.lost_balls ?? "N/A"} | ${r.round_type || "practice"}${r.notes ? ` | Notes: ${r.notes}` : ""}`).join("\n")}`;
    }

    // ---- Round trend deltas (first half vs second half of period) ----
    let roundTrendBlock = "";
    if (rounds.length >= 4) {
      const mid = Math.floor(rounds.length / 2);
      const first = rounds.slice(0, mid);
      const second = rounds.slice(mid);
      const avg = (arr: any[], pick: (r: any) => number | null) => {
        const v = arr.map(pick).filter((n) => n != null && !isNaN(n as number)) as number[];
        return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null;
      };
      const fmt = (n: number | null) => n == null ? "N/A" : n.toFixed(1);
      const delta = (a: number | null, b: number | null) => (a == null || b == null) ? "N/A" : ((b - a) >= 0 ? "+" : "") + (b - a).toFixed(1);
      const sP_a = avg(first, (r) => r.total_score - r.course_par);
      const sP_b = avg(second, (r) => r.total_score - r.course_par);
      const pu_a = avg(first, (r) => r.putts);
      const pu_b = avg(second, (r) => r.putts);
      const gi_a = avg(first, (r) => r.greens_in_regulation);
      const gi_b = avg(second, (r) => r.greens_in_regulation);
      const firPct_ = (arr: any[]) => {
        const a = arr.filter((r) => r.fairways_hit != null && r.fairways_total);
        if (!a.length) return null;
        return (a.reduce((s, r) => s + r.fairways_hit, 0) / a.reduce((s, r) => s + r.fairways_total, 0)) * 100;
      };
      const fi_a = firPct_(first); const fi_b = firPct_(second);
      roundTrendBlock = `### Round Trend (first ${first.length} vs second ${second.length})
- Score vs Par: ${fmt(sP_a)} → ${fmt(sP_b)} (delta ${delta(sP_a, sP_b)})
- Putts: ${fmt(pu_a)} → ${fmt(pu_b)} (delta ${delta(pu_a, pu_b)})
- GIR: ${fmt(gi_a)} → ${fmt(gi_b)} (delta ${delta(gi_a, gi_b)})
- FIR %: ${fmt(fi_a)} → ${fmt(fi_b)} (delta ${delta(fi_a, fi_b)})`;
    }

    // ---- PGA Tour reference card (static, vetted) ----
    const pgaReferenceBlock = `### PGA Tour Reference Card (you may ONLY cite numbers from this card)
- PGA Tour avg GIR: 11.7 of 18 (~65%)
- PGA Tour avg fairways hit (FIR): ~60%
- PGA Tour avg scrambling (up & down %): ~60%
- PGA Tour avg putts per round: ~29
- PGA Tour avg putts per GIR: ~1.77
- PGA Tour avg driving distance: ~299 yards
- PGA Tour avg proximity from 100–125 yards: ~18 ft
- PGA Tour avg proximity from 175–200 yards: ~34 ft
- PGA Tour avg score vs par per round: roughly -0.5 to -1`;

    // Lesson totals by status & type
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const l of lessons) {
      byStatus[l.status || "scheduled"] = (byStatus[l.status || "scheduled"] || 0) + 1;
      const tLabel = normalizeLessonType(l.lesson_type);
      byType[tLabel] = (byType[tLabel] || 0) + 1;
    }
    const statusLine = Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";
    const typeLine = Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";

    // Build data context for AI

    // ---- Chronological timeline (only lessons with notes or linked video) ----
    const tlVideosByLesson = new Map<string, any[]>();
    for (const v of histVideos) if (v.lesson_id) { if (!tlVideosByLesson.has(v.lesson_id)) tlVideosByLesson.set(v.lesson_id, []); tlVideosByLesson.get(v.lesson_id)!.push(v); }
    const tlRows = [...histLessons]
      .filter((l: any) => l.lesson_date)
      .sort((a: any, b: any) => a.lesson_date.localeCompare(b.lesson_date))
      .map((l: any) => {
        const vids = tlVideosByLesson.get(l.id) || [];
        const parts: string[] = [];
        if (l.coach_notes?.trim()) parts.push(`coach: "${truncate(l.coach_notes.trim(), 250)}"`);
        if (l.student_notes?.trim()) parts.push(`student: "${truncate(l.student_notes.trim(), 150)}"`);
        for (const v of vids) {
          const t = [v.coach_feedback, v.next_steps, v.description].filter((x: any) => x && String(x).trim()).join(" / ");
          parts.push(t ? `video: "${truncate(t, 200)}"` : "video sin notas");
        }
        return parts.length ? `- ${l.lesson_date} | ${normalizeLessonType(l.lesson_type)} | ${parts.join(" | ")}` : null;
      })
      .filter(Boolean) as string[];
    const timelineBlock = tlRows.length ? `### Chronological Timeline (oldest → newest; ONLY these lessons may appear in the timeline section)
${tlRows.slice(-20).join("\n")}` : "";

    const dataContext = `
${timelineBlock}

## Student: ${studentName}
## Report Period: ${date_start} to ${date_end}
## Plan: ${profile?.manual_plan_override || profile?.plan_tier || "free"}
## Handicap: ${profile?.handicap ?? "Not recorded"} (bracket: ${hcBracket}; next bracket up: ${nextBracketTarget})

${lessons.length > 0 ? `### Lessons (${completedLessons.length} completed, ${lessons.length} total)
By status: ${statusLine}
By type: ${typeLine}
${lessons.map((l: any) => `- ${l.lesson_date} ${l.lesson_time || ""} | ${normalizeLessonType(l.lesson_type)} | ${l.status} | ${l.duration_minutes || 60}min${l.coach_notes ? ` | coach: ${truncate(l.coach_notes, 300)}` : ""}${l.student_notes ? ` | student: ${truncate(l.student_notes, 300)}` : ""}`).join("\n")}` : ""}

${videos.length > 0 ? `### Videos (${videos.length})
${videos.map((v: any) => `- ${v.upload_date} | ${v.title || "Untitled"}${v.category ? ` [${v.category}]` : ""}${v.description ? ` | desc: ${truncate(v.description, 500)}` : ""}${v.coach_feedback ? ` | coach: ${truncate(v.coach_feedback, 500)}` : ""}${v.next_steps ? ` | next: ${truncate(v.next_steps, 500)}` : ""}`).join("\n")}` : ""}

${media.length > 0 ? `### Media Uploads (${media.length})
${media.map((m: any) => `- ${m.uploaded_at?.split("T")[0]} | ${m.title || "Untitled"} | ${m.file_type || "file"}`).join("\n")}` : ""}

${roundAggregates}

${roundTrendBlock}

${packageSentence ? `### Package Summary (EXACT sentence for Lessons & Packages / Clases y Paquetes — paste verbatim as one plain sentence, NOT as a bullet, do not add extra package info)
${lang === "es" ? packageSentence : packageSentenceEn}` : ""}

${packageLifecycleBlock}

${sharedAttendanceBlock}

${handicapTrendBlock}

${handicapHistory.length > 0 ? `### Handicap History
${handicapHistory.map((h: any) => `- ${h.recorded_at?.split("T")[0]}: ${h.handicap}`).join("\n")}` : ""}

${standaloneNotesBlock}

${videoCorrelationBlock}

${workingThemesBlock}

${pgaReferenceBlock}
${notesCorpus}
`;

    const systemPrompt = `You are Santiago Castilla, head coach at Margea Golf Academy. 
LANGUAGE LOCK — The entire report MUST be written in English. Translate any Spanish coach/student notes to English when paraphrasing. Do not output Spanish words except proper nouns (student or course names).

DATA RULE (CRITICAL): Never invent facts. Use only the data provided above; if something is not recorded (for example a handicap goal), do not mention it. Capitalize plan names: Pro, Scratch, Apex Level.

BREVITY (CRITICAL):
- Whole report target: 350–500 words, hard cap 700.
- Every section: 2–4 sentences OR up to 4 bullets. No section longer than ~80 words.
- One line per bullet. No nested bullets. No filler phrases ("In conclusion…", "It is worth noting…", "Overall…").
- Paraphrase tightly — combine related themes into a single bullet instead of listing each one.
- If two sections would say nearly the same thing, merge them and drop one.

Write a professional student performance report based ONLY on the provided data.

RULES:
- Do NOT invent, infer, embellish, or fabricate any data, stats, narrative, or observations not explicitly present in the provided context. Zero tolerance for invented sentences.
- ALWAYS render EVERY section listed in REPORT STRUCTURE below, in the exact order given, even if empty.
- If a section has no supporting data in the context, output exactly one line under the heading: "No data available for this period." (Spanish: "Sin datos disponibles para este periodo."). Do NOT write filler narrative.
- Every bullet must be traceable to a concrete data row in the provided context (a date, a number, a note theme, a package row, a round row). If you cannot point to a data row, do not write the bullet.
- Be specific — reference actual dates, scores, coach-note themes, and video observations from the data.
- Keep the tone professional, encouraging, and coach-like.
- Write in English.
- Output ONLY the finished report. Do not include any reasoning, analysis, draft notes, or meta-commentary.
- Use markdown formatting.
- DO NOT use any emojis or non-ASCII symbols anywhere in the report (the PDF renderer cannot display them).
- DO NOT use bold markdown (**text**) anywhere. Never wrap labels in asterisks.
- For emphasis or labels inside bullets, use a plain text label followed by an em dash. Example: "Trend Detection — Lesson frequency peaked..."
- For section subtitles inside paragraphs, use plain text followed by a colon.
- NOTES HANDLING: Do NOT paste lesson or video notes verbatim. Paraphrase and group by recurring themes (e.g. swing path, putting, mental game, contact). Avoid quoted phrases longer than ~6 words. The notes corpus is provided for your synthesis, not for direct reproduction.
- SHARED PACKAGE ATTENDANCE: If a "Shared Package Attendance" block is present, when you reference lessons from it you MUST state who took each lesson ("taken by [name]" or "taken together"). Do not attribute a lesson to the report's student if the block says another member took it.

REPORT STRUCTURE (render ALL sections, in this order, always — even when empty):
# Performance Report: [Student Name]
**Period:** [date range]

## Student Overview
2–3 sentences. MUST include: plan/subscription, current handicap + delta vs start of period (use Handicap Trend block), lesson count, round count.

## Progress & Advancements
Max 5 bullets. Each MUST paraphrase a specific coach note, video coach feedback, or measurable stat improvement present in the data, and may use 1–2 sentences to develop the point with a concrete example from the data. No general statements. If none: "No data available for this period."

## Areas for Improvement
Max 5 bullets. Each MUST be grounded in a recurring theme from coach notes, video next_steps, or a weak stat (low GIR, high putts, etc.) present in the data, and may use 1–2 sentences to develop the point with a concrete example from the data. If none: "No data available for this period."

## Video Review & Coach Feedback
Up to 8 bullets combining two groups (no sub-headings, no duplication):
(a) Video/coach-notes bullets — each ties a video from the "Video ↔ Coach Notes Correlation" block to its matched same-lesson coach note or ±7-day standalone note. Paraphrased, no quotes. Max 5.
(b) Working-themes bullets — sourced from "Working Themes" tally, "Handicap Trend", and "Round Trend" blocks. Each bullet must name the theme or stat and cite the count/delta from the data. Max 3.
If neither group has data: "No data available for this period."

## Progress Timeline
Chronological list (oldest first) built ONLY from the "Chronological Timeline" block. One bullet per lesson: "YYYY-MM-DD · [lesson type] — [one short phrase of what was worked on]". Never add lessons not in that block. If several consecutive lessons share the same focus, you may merge them ("YYYY-MM-DD a YYYY-MM-DD"). Max 12 bullets. If the block is absent: "No data available for this period."

## Round Stats Summary
3–5 short bullets using the pre-calculated averages, best round, and first-half vs second-half trend deltas (score-vs-par, putts, GIR, FIR). One number per bullet. If no rounds: "No data available for this period."
`;

    const spanishOverlay = `

LANGUAGE LOCK — The entire report MUST be written in Mexican Spanish (professional coaching tone). All headings, body, and bullets must be in Spanish. Translate any English notes to Spanish when paraphrasing. Do not output English words except proper nouns. Use these exact section titles:
# Reporte de Desempeño: [Nombre del Estudiante]
**Periodo:** [rango de fechas]
## Resumen del Estudiante
## Avances y Mejoras
## Áreas de Mejora
## Revisión de Video y Notas del Coach
## Avance Cronológico
## Resumen de Estadísticas de Rondas

Escribe SOLO el reporte terminado. No incluyas razonamientos, análisis, borradores ni comentarios sobre el reporte.

REGLA DE DATOS (CRÍTICO): No inventes nada. Usa únicamente los datos incluidos arriba; si algo no está registrado (por ejemplo una meta de handicap), no lo menciones. Escribe los nombres de plan con mayúscula: Pro, Scratch, Apex Level.

EXTENSIÓN: El reporte completo debe tener 550–800 palabras (tope 950). En Avance Cronológico usa "2026-10-27 · Clase en tiro de práctica — frase corta". Cada sección: 3–5 oraciones o hasta 8 viñetas; cada viñeta puede tener 1–2 oraciones para desarrollar el punto con un ejemplo concreto del dato (qué se observó, qué ejercicio se hizo, qué se busca). Sin viñetas anidadas. Sin frases de relleno. Parafrasea y combina temas relacionados. Si el periodo tiene pocos datos, profundiza en los que hay: desglosa cada nota en sus componentes (por ejemplo, cada corrección del swing por separado) y da un plan de práctica concreto con ejercicios. Límites: Resumen del Estudiante 2–3 oraciones; Avances 4–5; Áreas de Mejora 4–5; Revisión de Video y Notas del Coach máx 8 viñetas (hasta 5 de video/notas + hasta 3 de tendencias de trabajo, sin sub-encabezados, sin duplicar); Estadísticas de Rondas 3–5 viñetas.

ESTRUCTURA OBLIGATORIA: Renderiza SIEMPRE todas las secciones en el orden listado, aunque no haya datos. Si una sección no tiene datos en el contexto, escribe exactamente: "Sin datos disponibles para este periodo." Nunca inventes narrativa de relleno. Cada viñeta debe ser trazable a una fila concreta del contexto (fecha, número, nota, paquete, ronda). Prohibido mencionar Trackman.

TIPOS DE CLASE — Solo existen dos tipos de clase en este reporte: "Clase en campo" y "Clase en tiro de práctica". Nunca uses "Range", "Standard", "Putting", "Chipping", "Lesson", "Field Lesson", "Playing Lesson" ni ningún otro nombre. Si una clase no es "Clase en campo", entonces es "Clase en tiro de práctica". Sin excepciones.

PROHIBIDO PAQUETES Y CLASES — No incluyas ninguna sección, viñeta ni mención de "Clases y Paquetes", conteo de clases por estatus, paquetes, tamaño de paquete, clases restantes, fechas de pago, montos ni estatus de pago. Omite por completo esa sección.

ASISTENCIA EN PAQUETES COMPARTIDOS — Si existe el bloque "Shared Package Attendance", al mencionar esas clases indica quién la tomó ("la tomó [nombre]" o "la tomaron juntos"). Nunca atribuyas al alumno del reporte una clase que tomó otro miembro.

Keep all rules above (no emojis, no bold markdown, paraphrase notes, do not invent data). Numbers, dates, names, and package names stay as-is.`;

    const studentSelfOverlay = `

STUDENT-AUTHORED REPORT — This report is being generated by the student for themselves. Focus ONLY on their game. Hard rules:
- Do NOT mention packages, package names, amounts paid, payment status, payment dates, or any financial/billing information.
- Do NOT mention how many total packages they have taken or purchased.
- All other sections and rules (brevity, structure, no emojis, no bold, no fabrication) still apply.
- Talk about lessons, swing themes, progress, videos, rounds, recommendations — the game only.`;

    // Language lock must come FIRST and be repeated at the end: Gemini has
    // ignored the Spanish overlay appended after the long English base
    // prompt (the base prompt itself says "Write in English"), so reports
    // came out in English even with a Spanish UI. Remove that contradiction
    // and lead with the Spanish instruction.
    let finalSystemPrompt = lang === "es" ? systemPrompt + spanishOverlay : systemPrompt;
    if (lang === "es") {
      finalSystemPrompt = finalSystemPrompt.replace("- Write in English.", "- Write in Mexican Spanish.");
      finalSystemPrompt = "ESCRIBE TODO EL REPORTE EN ESPAÑOL MEXICANO. No escribas ninguna palabra en inglés excepto nombres propios.\n\n" + finalSystemPrompt;
    }
    if (isStudentSelf) finalSystemPrompt += studentSelfOverlay;

    // Gemini generateContent: mismo prompt y mismos datos que antes, solo
    // cambia el proveedor (la instruccion va como texto, no hay "system" aparte).
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${finalSystemPrompt}\n\n${lang === "es" ? "Genera un reporte de desempeño en español mexicano con estos datos:" : "Generate a performance report using this data:"}\n${dataContext}` }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("Gemini error:", status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    // Thinking tokens count against maxOutputTokens on Gemini 3.x: if the
    // model burns the budget reasoning, the report comes back cut off
    // mid-sentence (or empty). thinkingBudget 0 is set above; log the
    // finish reason + usage so a future truncation is diagnosable.
    console.log("Gemini finishReason:", aiData.candidates?.[0]?.finishReason, "usage:", JSON.stringify(aiData.usageMetadata));
    const reportContent =
      aiData.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ||
      "Report generation failed.";

    // Student-generated lesson reports are stored server-side (RLS only lets
    // students insert scoring reports) so they show up in their Reports tab.
    let savedId: string | null = null;
    if (isStudentGenerated && persist) {
      const { data: saved, error: saveErr } = await admin
        .from("student_reports")
        .insert({
          student_id,
          created_by: user.id,
          title: typeof title === "string" && title.trim() ? title.trim() : studentName,
          content: reportContent,
          date_range_start: date_start,
          date_range_end: date_end,
          report_type: "lesson",
          generated_by_student: true,
          shared_with_student: false,
          hidden_by_student: false,
        })
        .select("id")
        .single();
      if (saveErr) console.error("save student report error:", saveErr);
      savedId = saved?.id ?? null;
    }

    return new Response(JSON.stringify({ report: reportContent, studentName, savedId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-student-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
