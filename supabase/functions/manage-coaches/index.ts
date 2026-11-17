import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | { action: "list" }
  | { action: "students"; coach_id: string }
  | { action: "create"; email: string; password: string; full_name?: string }
  | { action: "remove"; user_id: string; unassign_students?: boolean }
  | { action: "reset_password"; user_id: string; password: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const service = createClient(supabaseUrl, serviceKey);

    // Only admins may call this function.
    const { data: roles } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const body = (await req.json()) as Action;

    if (body.action === "list") {
      const { data: coachRoles, error: rolesErr } = await service
        .from("user_roles")
        .select("user_id")
        .eq("role", "coach");
      if (rolesErr) return json({ error: rolesErr.message }, 500);

      const ids = (coachRoles ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return json({ coaches: [] });

      const { data: profiles, error: profErr } = await service
        .from("profiles")
        .select("id, email, full_name, photo_url, created_at")
        .in("id", ids);
      if (profErr) return json({ error: profErr.message }, 500);

      // Students per coach with subscription breakdown
      const { data: students } = await service
        .from("profiles")
        .select("assigned_coach_id, plan_tier, manual_plan_override, override_expires_at")
        .in("assigned_coach_id", ids);

      const nowMs = Date.now();
      const effectiveTier = (s: any): string => {
        if (
          s.manual_plan_override &&
          ["scratch", "pro", "apex"].includes(s.manual_plan_override) &&
          (!s.override_expires_at || new Date(s.override_expires_at).getTime() > nowMs)
        ) return s.manual_plan_override;
        if (["scratch", "pro", "apex"].includes(s.plan_tier)) return s.plan_tier;
        if (s.manual_plan_override) return "sc";
        return "free";
      };

      const countMap: Record<string, number> = {};
      const tierMap: Record<string, Record<string, number>> = {};
      (students ?? []).forEach((row: any) => {
        const cid = row.assigned_coach_id;
        if (!cid) return;
        countMap[cid] = (countMap[cid] ?? 0) + 1;
        const t = effectiveTier(row);
        tierMap[cid] = tierMap[cid] ?? {};
        tierMap[cid][t] = (tierMap[cid][t] ?? 0) + 1;
      });

      const coaches = (profiles ?? []).map((p: any) => ({
        ...p,
        student_count: countMap[p.id] ?? 0,
        tier_breakdown: tierMap[p.id] ?? {},
      }));
      return json({ coaches });
    }

    if (body.action === "students") {
      if (!body.coach_id) return json({ error: "coach_id required" }, 400);
      const { data: students, error: sErr } = await service
        .from("profiles")
        .select("id, email, full_name, photo_url, plan_tier, manual_plan_override, override_expires_at, trial_ends_at")
        .eq("assigned_coach_id", body.coach_id)
        .order("full_name", { ascending: true });
      if (sErr) return json({ error: sErr.message }, 500);
      return json({ students: students ?? [] });
    }

    if (body.action === "create") {
      const email = (body.email ?? "").trim().toLowerCase();
      const password = (body.password ?? "").trim();
      const fullName = (body.full_name ?? "").trim();
      if (!email || !password) return json({ error: "Email and password required" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

      // Create the auth user (email pre-confirmed)
      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (createErr || !created?.user) return json({ error: createErr?.message ?? "Failed to create user" }, 400);

      const userId = created.user.id;

      // Upsert profile (handle_new_user trigger already creates it; we just enrich)
      await service
        .from("profiles")
        .upsert(
          { id: userId, email, full_name: fullName || email, plan_tier: "free", trial_ends_at: null },
          { onConflict: "id" },
        );

      // Remove default 'student' role granted by handle_new_user, add 'coach'
      await service.from("user_roles").delete().eq("user_id", userId).eq("role", "student");
      const { error: roleErr } = await service
        .from("user_roles")
        .insert({ user_id: userId, role: "coach" });
      if (roleErr) return json({ error: roleErr.message }, 500);

      return json({ ok: true, user_id: userId, email });
    }

    if (body.action === "reset_password") {
      if (!body.user_id || !body.password) return json({ error: "user_id and password required" }, 400);
      if (body.password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      const { error } = await service.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "remove") {
      if (!body.user_id) return json({ error: "user_id required" }, 400);
      if (body.unassign_students) {
        await service.from("profiles").update({ assigned_coach_id: null }).eq("assigned_coach_id", body.user_id);
      }
      await service.from("user_roles").delete().eq("user_id", body.user_id).eq("role", "coach");
      // Delete auth user entirely
      const { error: delErr } = await service.auth.admin.deleteUser(body.user_id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});