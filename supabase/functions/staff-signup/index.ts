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

// Public endpoint used by the "Create staff account" screen at /auth.
// Staff accounts are pre-authorized (admin created a pending_staff_invites
// row or the account already exists as staff), so we create the auth user
// with email_confirm=true via the service role — no email verification step
// required. Student self-signup is unaffected and still uses supabase.auth.signUp.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Authorization: this email must be a pre-approved staff account.
    // Either (a) a pending_staff_invites row was created by an admin, or
    // (b) the account already exists and has the 'staff' role.
    const { data: invite } = await service
      .from("pending_staff_invites")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    let existingUserId: string | null = null;
    if (!invite) {
      // Look up an existing profile with a staff role.
      const { data: profile } = await service
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (profile?.id) {
        const { data: roleRow } = await service
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id)
          .eq("role", "staff")
          .maybeSingle();
        if (roleRow) existingUserId = profile.id;
      }
      if (!existingUserId) {
        return json(
          { error: "This email is not authorized for staff access. Ask the admin to invite you first." },
          403,
        );
      }
    }

    if (existingUserId) {
      // Existing staff account: (re)set password and force-confirm email.
      const updatePayload: {
        password: string;
        email_confirm: true;
        user_metadata?: { full_name: string };
      } = { password, email_confirm: true };
      if (full_name) updatePayload.user_metadata = { full_name };
      const { error: updateErr } = await service.auth.admin.updateUserById(existingUserId, updatePayload);
      if (updateErr) return json({ error: updateErr.message }, 400);
      return json({ ok: true, user_id: existingUserId, mode: "updated" });
    }

    // New pre-invited staff account: create with email already confirmed
    // so the user can sign in immediately with no email verification step.
    const createPayload: {
      email: string;
      password: string;
      email_confirm: true;
      user_metadata?: { full_name: string };
    } = { email, password, email_confirm: true };
    if (full_name) createPayload.user_metadata = { full_name };

    const { data: created, error: createErr } = await service.auth.admin.createUser(createPayload);
    if (createErr || !created?.user) {
      // If user already exists in auth (no profile), fall back to update flow.
      const message = createErr?.message ?? "Failed to create staff user";
      if (/already/i.test(message)) {
        // Locate via listUsers (paged) and update password + confirm email.
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
            return json({ ok: true, user_id: match.id, mode: "updated" });
          }
          if (listData.users.length < 200) break;
        }
      }
      return json({ error: message }, 400);
    }

    return json({ ok: true, user_id: created.user.id, mode: "created" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});