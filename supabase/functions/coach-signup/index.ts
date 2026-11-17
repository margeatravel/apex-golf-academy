import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Public endpoint used by the "Create coach account" screen at /auth when the
// user selected "Soy Coach". Mirrors staff-signup but assigns the 'coach' role
// instead of 'staff'. Email is pre-confirmed so the coach can sign in
// immediately with no verification step.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email: rawEmail, password, full_name } = (await req.json()) as {
      email?: string;
      password?: string;
      full_name?: string;
    };

    const email = (rawEmail ?? "").trim().toLowerCase();
    if (!email || !password || password.length < 6) {
      return json({ error: "Email and a password of at least 6 characters are required" }, 400);
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const promoteToCoach = async (userId: string) => {
      // Ensure 'coach' role present
      await service
        .from("user_roles")
        .upsert({ user_id: userId, role: "coach" }, { onConflict: "user_id,role" });
      // Remove default 'student' role assigned by handle_new_user
      await service.from("user_roles").delete().eq("user_id", userId).eq("role", "student");
      // Coaches don't need the student trial / assigned coach / plan artifacts
      await service
        .from("profiles")
        .update({
          trial_ends_at: null,
          assigned_coach_id: null,
          plan_tier: "free",
          manual_plan_override: null,
          override_expires_at: null,
          full_name: full_name || undefined,
        })
        .eq("id", userId);
      // Clean any accidental student-side artifacts
      const { data: pkgs } = await service
        .from("class_packages")
        .select("id")
        .eq("user_id", userId);
      const pkgIds = (pkgs ?? []).map((p: { id: string }) => p.id);
      if (pkgIds.length > 0) {
        await service.from("package_payments").delete().in("package_id", pkgIds);
        await service.from("class_packages").delete().in("id", pkgIds);
      }
    };

    // Try to create the auth user with email pre-confirmed.
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    });

    if (created?.user) {
      await promoteToCoach(created.user.id);
      return json({ ok: true, user_id: created.user.id, mode: "created" });
    }

    // If user already exists, locate them and (re)set password + promote.
    const message = createErr?.message ?? "Failed to create coach user";
    if (!/already/i.test(message)) return json({ error: message }, 400);

    for (let page = 1; page <= 20; page++) {
      const { data: listData, error: listErr } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) break;
      const match = listData.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (match) {
        const { error: updErr } = await service.auth.admin.updateUserById(match.id, {
          password,
          email_confirm: true,
          user_metadata: full_name ? { full_name } : undefined,
        });
        if (updErr) return json({ error: updErr.message }, 400);
        await promoteToCoach(match.id);
        return json({ ok: true, user_id: match.id, mode: "updated" });
      }
      if (listData.users.length < 200) break;
    }
    return json({ error: message }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});