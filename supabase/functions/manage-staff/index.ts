import { ALLOWED_STAFF_SCOPES, STAFF_ACCESS_AREAS } from '../_shared/staff-scopes.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SCOPES = ALLOWED_STAFF_SCOPES;
const SCOPE_LABELS: Record<string, string> = Object.fromEntries(
  STAFF_ACCESS_AREAS.map(area => [area.id, area.label]),
);

const FROM_EMAIL = "Margea Golf Academy <admin@margeagolfacademy.com>";
const APP_URL = "https://margeagolfacademy.com";
const RESEND_API_URL = "https://api.resend.com/emails";

async function sendStaffWelcomeEmail(
  service: ReturnType<typeof createClient>,
  opts: { email: string; fullName: string; pin: string; scopes: string[]; loginUrl: string | null },
) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.log("[manage-staff] RESEND_API_KEY missing, skipping welcome email");
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const scopeList = opts.scopes.map((s) => SCOPE_LABELS[s] ?? s).map((l) => `<li style="padding:2px 0;">${l}</li>`).join("");
  const greeting = opts.fullName ? `Hola ${opts.fullName},` : "Hola,";
  const loginHref = opts.loginUrl || `${APP_URL}/auth`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0d1f18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1f18;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(255,255,255,0.04);border:1px solid rgba(240,192,64,0.2);border-radius:16px;padding:32px;">
        <tr><td align="center" style="padding-bottom:20px;">
          <div style="width:56px;height:56px;border-radius:14px;background:#0d1f18;border:2px solid #F0C040;color:#F0C040;font-weight:800;font-size:28px;line-height:52px;text-align:center;">A</div>
        </td></tr>
        <tr><td style="color:#F4ECD8;font-size:22px;font-weight:700;text-align:center;padding-bottom:8px;">
          Bienvenido al equipo de Margea Golf Academy
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.8);font-size:15px;line-height:1.5;padding-bottom:20px;">
          ${greeting}<br/><br/>
          Tu cuenta de staff en <strong style="color:#F4ECD8;">Margea Golf Academy</strong> ya está lista.
          Inicia sesión con tu correo y el PIN de abajo (el PIN es tu contraseña).
        </td></tr>
        <tr><td style="padding-bottom:16px;">
          <div style="color:rgba(244,236,216,0.6);font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;">Correo</div>
          <div style="color:#F4ECD8;font-size:16px;font-weight:600;padding-bottom:14px;">${opts.email}</div>
          <div style="color:rgba(244,236,216,0.6);font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;">PIN (contraseña)</div>
          <div style="display:inline-block;background:#0d1f18;border:1px solid #F0C040;color:#F0C040;font-weight:800;font-size:22px;letter-spacing:4px;padding:10px 18px;border-radius:10px;">${opts.pin}</div>
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.8);font-size:14px;line-height:1.5;padding:8px 0 8px 0;">
          <strong style="color:#F4ECD8;">Áreas de acceso concedidas:</strong>
          <ul style="margin:8px 0 0 18px;padding:0;color:rgba(244,236,216,0.85);">${scopeList}</ul>
        </td></tr>
        <tr><td align="center" style="padding:20px 0 8px 0;">
          <a href="${loginHref}" style="display:inline-block;background:#F0C040;color:#0d1f18;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Iniciar sesión</a>
        </td></tr>
        <tr><td style="color:rgba(244,236,216,0.5);font-size:12px;line-height:1.5;text-align:center;padding-top:12px;">
          Guarda este correo en un lugar seguro. Si necesitas cambiar tu PIN, contacta al administrador.
        </td></tr>
      </table>
      <div style="color:rgba(244,236,216,0.35);font-size:11px;text-align:center;padding-top:16px;">Margea Golf Academy · ${APP_URL}</div>
    </td></tr>
  </table>
</body></html>`;

  try {
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [opts.email],
        subject: "Tu cuenta de staff en Margea Golf Academy",
        html,
      }),
    });
    const resendJson = await resendRes.json().catch(() => ({}));
    try {
      await service.from("email_send_log").insert({
        template_name: "staff_welcome",
        recipient_email: opts.email,
        status: resendRes.ok ? "sent" : "failed",
        message_id: resendJson?.id ?? null,
        error_message: resendRes.ok ? null : JSON.stringify(resendJson).slice(0, 500),
        metadata: { scopes: opts.scopes },
      });
    } catch (_) {}
    if (!resendRes.ok) {
      console.error("[manage-staff] Resend failed", resendJson);
      return { sent: false, reason: resendJson?.message || "Resend error" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[manage-staff] welcome email exception", e);
    return { sent: false, reason: (e as Error).message };
  }
}

async function findAuthUserIdByEmail(
  service: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  // listUsers is paginated; scan up to a few pages to find the email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

type Action =
  | { action: "list" }
  | { action: "invite"; email: string; full_name?: string; scopes: string[]; pin?: string }
  | { action: "set_pin"; user_id: string; pin?: string }
  | { action: "clear_pin"; user_id: string }
  | { action: "grant"; user_id: string; scope: string }
  | { action: "revoke"; user_id: string; scope: string }
  | { action: "remove"; user_id: string }
  | { action: "revoke_staff"; user_id: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generatePin(length = 6): string {
  const digits = "0123456789";
  const buffer = new Uint32Array(length);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => digits[value % digits.length]).join("");
}

function normalizePin(raw?: string | null): { pin: string | null; error?: string } {
  const cleaned = (raw ?? "").replace(/\D/g, "");
  if (!cleaned) return { pin: null };
  if (!/^\d{6,8}$/.test(cleaned)) {
    return { pin: null, error: "PIN must be 6 to 8 digits" };
  }
  return { pin: cleaned };
}

function sanitizeScopes(scopes: string[] | undefined): string[] {
  return Array.from(new Set((scopes ?? []).filter((scope) => ALLOWED_SCOPES.includes(scope as (typeof ALLOWED_SCOPES)[number]))));
}

async function ensureStaffAccess(
  service: ReturnType<typeof createClient>,
  params: {
    userId: string;
    email: string;
    fullName?: string;
    scopes: string[];
    callerId: string;
  },
) {
  const { userId, email, fullName, scopes, callerId } = params;

  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    plan_tier: "free",
  };

  if (fullName) {
    profilePayload.full_name = fullName;
  }

  const { error: profileErr } = await service
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileErr) {
    throw new Error(profileErr.message);
  }

  if (scopes.length > 0) {
    const permissionRows = scopes.map((scope) => ({
      user_id: userId,
      scope,
      granted_by: callerId,
    }));

    const { error: permissionErr } = await service
      .from("staff_permissions")
      .upsert(permissionRows, { onConflict: "user_id,scope" });

    if (permissionErr) {
      throw new Error(permissionErr.message);
    }
  }

  // Staff get the dedicated 'staff' role — never 'student'. They do NOT
  // get the 'admin' role — that would grant full access to everything,
  // defeating the point of scoped staff permissions.
  const { error: roleErr } = await service
    .from("user_roles")
    .upsert({ user_id: userId, role: "staff" }, { onConflict: "user_id,role" });

  if (roleErr) {
    throw new Error(roleErr.message);
  }

  // Defensive cleanup: if this user previously had a 'student' role row
  // (e.g. they signed up as a student first), strip it now that they're staff.
  await service
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "student");

  await service
    .from("pending_staff_invites")
    .delete()
    .eq("email", email.toLowerCase());
}

async function removeStaffAccount(service: ReturnType<typeof createClient>, userId: string) {
  let targetEmail: string | null = null;

  try {
    const { data: authUser } = await service.auth.admin.getUserById(userId);
    targetEmail = authUser?.user?.email ?? null;
  } catch {
    targetEmail = null;
  }

  await service.from("staff_permissions").delete().eq("user_id", userId);
  await service.from("user_roles").delete().eq("user_id", userId);
  await service.from("notifications").delete().eq("user_id", userId);
  await service.from("student_media").delete().eq("student_id", userId);
  await service.from("student_drills").delete().eq("student_id", userId);
  await service.from("videos").delete().eq("student_id", userId);
  await service.from("student_points").delete().eq("user_id", userId);
  await service.from("handicap_history").delete().eq("user_id", userId);
  await service.from("lessons").delete().eq("student_id", userId);
  await service.from("payments").delete().eq("student_id", userId);
  await service.from("analysis_requests").delete().eq("student_id", userId);

  const { data: packages } = await service
    .from("class_packages")
    .select("id")
    .eq("user_id", userId);

  if (packages?.length) {
    await service
      .from("package_payments")
      .delete()
      .in("package_id", packages.map((row: { id: string }) => row.id));
  }

  await service.from("class_packages").delete().eq("user_id", userId);
  await service
    .from("dismissed_duplicates")
    .delete()
    .or(`student_id_a.eq.${userId},student_id_b.eq.${userId}`);
  await service.from("profiles").delete().eq("id", userId);

  if (targetEmail) {
    await service
      .from("pending_staff_invites")
      .delete()
      .eq("email", targetEmail.toLowerCase());
  }

  const { error: deleteErr } = await service.auth.admin.deleteUser(userId);
  if (deleteErr) throw new Error(deleteErr.message);
}

/**
 * Non-destructive: removes ONLY the staff access surface (scopes + the
 * 'staff' role row + any pending staff invite). The auth user, profile,
 * lessons, videos and every other data table are left untouched, so the
 * person keeps their account and signs in as a normal student.
 */
async function revokeStaffAccessOnly(
  service: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  let targetEmail: string | null = null;
  try {
    const { data: authUser } = await service.auth.admin.getUserById(userId);
    targetEmail = authUser?.user?.email ?? null;
  } catch {
    targetEmail = null;
  }

  const { error: scopeErr } = await service
    .from("staff_permissions")
    .delete()
    .eq("user_id", userId);
  if (scopeErr) throw new Error(scopeErr.message);

  const { error: roleErr } = await service
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "staff");
  if (roleErr) throw new Error(roleErr.message);

  if (targetEmail) {
    await service
      .from("pending_staff_invites")
      .delete()
      .eq("email", targetEmail.toLowerCase());
  }
}

async function autoRemoveIfNoScopes(
  service: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ removed: boolean }> {
  const { data: remainingScopes, error: scopeErr } = await service
    .from("staff_permissions")
    .select("scope")
    .eq("user_id", userId)
    .limit(1);

  if (scopeErr) {
    throw new Error(scopeErr.message);
  }

  if ((remainingScopes ?? []).length > 0) {
    return { removed: false };
  }

  // No scopes left → strip the staff access surface only. We must NEVER
  // delete the account here: staff members are often students too and
  // deleting would erase their lessons, videos and payment history.
  await revokeStaffAccessOnly(service, userId);
  return { removed: true };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Not authenticated" }, 401);
    }

    const caller = {
      id: claimsData.claims.sub as string,
      email: (claimsData.claims.email as string | undefined) ?? "",
    };

    const { data: roleCheck } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) return json({ error: "Not authorized" }, 403);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as Action;

    if (body.action === "list") {
      const { data: perms, error: pErr } = await service
        .from("staff_permissions")
        .select("user_id, scope");

      if (pErr) return json({ error: pErr.message }, 500);

      const userIds = Array.from(new Set((perms ?? []).map((permission) => permission.user_id)));
      if (userIds.length === 0) return json({ staff: [] });

      const { data: profiles, error: profileErr } = await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profileErr) return json({ error: profileErr.message }, 500);

      const byUser: Record<string, { user_id: string; full_name: string | null; email: string; scopes: string[] }> = {};

      for (const id of userIds) {
        const profile = profiles?.find((row) => row.id === id);
        byUser[id] = {
          user_id: id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? "",
          scopes: [],
        };
      }

      for (const permission of perms ?? []) {
        if (byUser[permission.user_id]) {
          byUser[permission.user_id].scopes.push(permission.scope);
        }
      }

      return json({ staff: Object.values(byUser) });
    }

    if (body.action === "invite") {
      const email = (body.email || "").trim().toLowerCase();
      const fullName = (body.full_name || "").trim();
      const scopes = sanitizeScopes(body.scopes);
      const pinResult = normalizePin(body.pin);

      if (!email) return json({ error: "Email is required" }, 400);
      if (pinResult.error) return json({ error: pinResult.error }, 400);
      if (scopes.length === 0) return json({ error: "Pick at least one scope" }, 400);

      const pin = pinResult.pin ?? generatePin();

      const { data: existingProfile, error: existingProfileErr } = await service
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (existingProfileErr) return json({ error: existingProfileErr.message }, 500);

      let userId = existingProfile?.id ?? null;

      if (!userId) {
        const createPayload: {
          email: string;
          email_confirm: true;
          password: string;
          user_metadata?: { full_name: string };
        } = {
          email,
          email_confirm: true,
          password: pin,
        };

        if (fullName) {
          createPayload.user_metadata = { full_name: fullName };
        }

        const { data: createdUser, error: createErr } = await service.auth.admin.createUser(createPayload);
        if (createErr || !createdUser?.user) {
          // Common case: auth user already exists (no matching profile row).
          // Fall back to looking up the auth user by email and switching to the update path.
          const existingAuthId = await findAuthUserIdByEmail(service, email);
          if (!existingAuthId) {
            console.error("[manage-staff] createUser failed and no existing auth user found", createErr);
            return json({ ok: false, error: createErr?.message || "Failed to create staff user" });
          }
          const updatePayload: {
            password: string;
            email_confirm: true;
            user_metadata?: { full_name: string };
          } = { password: pin, email_confirm: true };
          if (fullName) updatePayload.user_metadata = { full_name: fullName };
          const { error: updateErr } = await service.auth.admin.updateUserById(existingAuthId, updatePayload);
          if (updateErr) {
            console.error("[manage-staff] updateUserById (fallback) failed", updateErr);
            return json({ ok: false, error: updateErr.message });
          }
          userId = existingAuthId;
        } else {
          userId = createdUser.user.id;
        }
      } else {
        const updatePayload: {
          password: string;
          email_confirm: true;
          user_metadata?: { full_name: string };
        } = {
          password: pin,
          email_confirm: true,
        };

        if (fullName) {
          updatePayload.user_metadata = { full_name: fullName };
        }

        const { error: updateErr } = await service.auth.admin.updateUserById(userId, updatePayload);
        if (updateErr) {
          console.error("[manage-staff] updateUserById (existing profile) failed", { userId, message: updateErr.message });
          return json({ ok: false, error: updateErr.message });
        }
      }

      await ensureStaffAccess(service, {
        userId,
        email,
        fullName: fullName || undefined,
        scopes,
        callerId: caller.id,
      });

      const origin = req.headers.get("origin") || "";
      const loginUrl = origin ? `${origin}/auth?staff=1&invite=${encodeURIComponent(email)}` : null;
      const emailResult = await sendStaffWelcomeEmail(service, {
        email,
        fullName,
        pin,
        scopes,
        loginUrl,
      });
      return json({
        user_id: userId,
        email,
        scopes,
        pin,
        login_url: loginUrl,
        email_sent: emailResult.sent,
        email_error: emailResult.sent ? null : emailResult.reason,
      });
    }

    if (body.action === "set_pin") {
      const pinResult = normalizePin(body.pin);
      if (pinResult.error) return json({ error: pinResult.error }, 400);
      const pin = pinResult.pin ?? generatePin();

      const { data: profile, error: profileErr } = await service
        .from("profiles")
        .select("email")
        .eq("id", body.user_id)
        .maybeSingle();

      if (profileErr) return json({ error: profileErr.message }, 500);
      if (!profile?.email) return json({ error: "Staff account not found" }, 404);

      const { error: updateErr } = await service.auth.admin.updateUserById(body.user_id, {
        password: pin,
        email_confirm: true,
      });

      if (updateErr) return json({ error: updateErr.message }, 400);

      return json({ ok: true, email: profile.email, pin });
    }

    if (body.action === "clear_pin") {
      // Disable login by setting an unusable random password the admin never sees.
      // Staff will be locked out until the admin sets a new PIN.
      const { data: profile, error: profileErr } = await service
        .from("profiles")
        .select("email")
        .eq("id", body.user_id)
        .maybeSingle();

      if (profileErr) return json({ error: profileErr.message }, 500);
      if (!profile?.email) return json({ error: "Staff account not found" }, 404);

      const lockout = `LOCKED-${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const { error: updateErr } = await service.auth.admin.updateUserById(body.user_id, {
        password: lockout,
        email_confirm: true,
      });
      if (updateErr) return json({ error: updateErr.message }, 400);

      return json({ ok: true, email: profile.email });
    }

    if (body.action === "grant") {
      if (!ALLOWED_SCOPES.includes(body.scope as (typeof ALLOWED_SCOPES)[number])) {
        return json({ error: "Invalid scope" }, 400);
      }

      const { data: profile, error: profileErr } = await service
        .from("profiles")
        .select("email, full_name")
        .eq("id", body.user_id)
        .maybeSingle();

      if (profileErr) return json({ error: profileErr.message }, 500);
      if (!profile?.email) return json({ error: "Staff account not found" }, 404);

      await ensureStaffAccess(service, {
        userId: body.user_id,
        email: profile.email,
        fullName: profile.full_name ?? undefined,
        scopes: [body.scope],
        callerId: caller.id,
      });

      return json({ ok: true });
    }

    if (body.action === "revoke") {
      const { error } = await service
        .from("staff_permissions")
        .delete()
        .eq("user_id", body.user_id)
        .eq("scope", body.scope);

      if (error) return json({ error: error.message }, 500);

      const { removed } = await autoRemoveIfNoScopes(service, body.user_id);
      return json({ ok: true, removed });
    }

    if (body.action === "revoke_staff") {
      try {
        await revokeStaffAccessOnly(service, body.user_id);
        return json({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to revoke staff access";
        return json({ error: message }, 500);
      }
    }

    if (body.action === "remove") {
      try {
        await removeStaffAccount(service, body.user_id);
        return json({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to remove staff";
        return json({ error: message }, 500);
      }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
