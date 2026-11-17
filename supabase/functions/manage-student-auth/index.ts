import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Action =
  | { action: "send_reset"; user_id: string; redirect_to?: string }
  | { action: "set_temp_password"; user_id: string }
  | { action: "repair_email"; user_id: string; new_email?: string }
  | {
      action: "delete_user";
      user_id: string;
      // Optional: when this user owns shared packages, transfer each one to
      // another member instead of deleting the package. Defaults to true.
      reassign_shared?: boolean;
      // Optional explicit new owner for ALL shared packages owned by user_id.
      // If omitted, the oldest other member is chosen automatically.
      new_owner_id?: string;
    };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Generate a readable but secure 12-char temp password.
// Uses an unambiguous alphabet (no 0/O/1/l/I) and guarantees one of each class.
function generateTempPassword(): string {
  const lowers = "abcdefghijkmnpqrstuvwxyz";
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = lowers + uppers + digits + symbols;

  const pickFrom = (set: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };

  const required = [pickFrom(lowers), pickFrom(uppers), pickFrom(digits), pickFrom(symbols)];
  const rest: string[] = [];
  for (let i = 0; i < 8; i++) rest.push(pickFrom(all));
  const arr = [...required, ...rest];
  // Fisher-Yates shuffle with crypto randomness
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    // Only full admins (coach) may use this — staff scopes are NOT enough.
    const { data: roleCheck } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) return json({ error: "Not authorized" }, 403);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as Action;

    if (!body || !("action" in body) || !body.user_id) {
      return json({ ok: false, error: "Invalid request" }, 200);
    }

    // Look up the target user — ensure they exist before doing anything.
    const { data: targetUser, error: getErr } =
      await service.auth.admin.getUserById(body.user_id);
    if (getErr || !targetUser?.user) {
      return json({ error: "Student not found" }, 404);
    }
    const email = targetUser.user.email;

    // Recognize placeholder addresses created during imports / merges / splits.
    const isPlaceholderEmail = (e?: string | null) => {
      if (!e) return true;
      return (
        /^import_\d+_\d+@scgolf\.placeholder$/i.test(e) ||
        /^split-.*@placeholder\.local$/i.test(e) ||
        /^no-email-.*@placeholder\.local$/i.test(e) ||
        /^merged\+.*@archived\.local$/i.test(e) ||
        /@placeholder\.sc$/i.test(e)
      );
    };

    // repair_email exists to fix placeholder emails, and delete_user must
    // also work on imported/manual students (which always have placeholder
    // emails). Every OTHER action requires a real email on file.
    if (body.action !== "repair_email" && body.action !== "delete_user") {
      if (!email) {
        return json({ ok: false, error: "Student has no email on file" }, 200);
      }
      if (isPlaceholderEmail(email)) {
        // Auto-repair: try syncing from profiles.email before failing.
        const { data: profile } = await service
          .from("profiles")
          .select("email")
          .eq("id", body.user_id)
          .maybeSingle();
        const target = (profile?.email || "").trim().toLowerCase();
        const isValid =
          target &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) &&
          !isPlaceholderEmail(target);
        if (!isValid) {
          return json(
            {
              ok: false,
              error:
                "This student has no real email on file. Edit their profile and add a valid email first.",
            },
            200,
          );
        }
        // Free the email if another auth user owns it.
        try {
          const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
          const conflict = list?.users?.find(
            (u) => u.id !== body.user_id && (u.email || "").toLowerCase() === target,
          );
          if (conflict) {
            await service.auth.admin.updateUserById(conflict.id, {
              email: `archived+${conflict.id}@archived.local`,
              email_confirm: true,
            });
          }
        } catch (_) {
          // best-effort
        }
        const { error: syncErr } = await service.auth.admin.updateUserById(body.user_id, {
          email: target,
          email_confirm: true,
        });
        if (syncErr) {
          return json(
            { ok: false, error: `Could not sync login email: ${syncErr.message}` },
            200,
          );
        }
        await service.from("profiles").update({ email: target }).eq("id", body.user_id);
        // Use the repaired email for the action below.
        (targetUser.user as any).email = target;
      }
    }

    if (body.action === "send_reset") {
      const redirectTo =
        body.redirect_to && /^https?:\/\//.test(body.redirect_to)
          ? body.redirect_to
          : undefined;

      const effectiveEmail = targetUser.user.email!;
      const { error } = await service.auth.resetPasswordForEmail(effectiveEmail, {
        redirectTo,
      });
      if (error) return json({ ok: false, error: error.message }, 200);
      return json({ ok: true, email: effectiveEmail });
    }

    if (body.action === "set_temp_password") {
      const tempPassword = generateTempPassword();
      const { error } = await service.auth.admin.updateUserById(body.user_id, {
        password: tempPassword,
      });
      if (error) return json({ ok: false, error: error.message }, 200);
      return json({ ok: true, email: targetUser.user.email, temp_password: tempPassword });
    }

    if (body.action === "repair_email") {
      // Sync the auth-side email with the real address. The new email may be
      // provided explicitly, or we fall back to whatever profiles.email holds
      // (which is what the merge / manual edits write to today).
      let target = (body.new_email || "").trim().toLowerCase();
      if (!target) {
        const { data: profile } = await service
          .from("profiles")
          .select("email")
          .eq("id", body.user_id)
          .maybeSingle();
        target = (profile?.email || "").trim().toLowerCase();
      }

      if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        return json({ ok: false, error: "No valid email available to sync" }, 200);
      }
      if (isPlaceholderEmail(target)) {
        return json({ ok: false, error: "Refusing to set auth email to a placeholder address" }, 200);
      }
      if (target === (email || "").toLowerCase()) {
        return json({ ok: true, email: target, unchanged: true });
      }

      // If another auth user already owns this email, free that one first
      // by parking it on a unique archived address.
      try {
        const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
        const conflict = list?.users?.find(
          (u) => u.id !== body.user_id && (u.email || "").toLowerCase() === target,
        );
        if (conflict) {
          await service.auth.admin.updateUserById(conflict.id, {
            email: `archived+${conflict.id}@archived.local`,
            email_confirm: true,
          });
        }
      } catch (_) {
        // best-effort — if listUsers fails we still try the update below
      }

      const { error: updErr } = await service.auth.admin.updateUserById(body.user_id, {
        email: target,
        email_confirm: true,
      });
      if (updErr) return json({ ok: false, error: updErr.message }, 200);

      // Mirror to profiles so the two stay in sync.
      await service.from("profiles").update({ email: target }).eq("id", body.user_id);

      return json({ ok: true, email: target, previous_email: email });
    }

    if (body.action === "delete_user") {
      const uid = body.user_id;
      const reassignShared = body.reassign_shared !== false; // default true
      const explicitNewOwner = body.new_owner_id || null;

      // ---------------------------------------------------------------
      // 1) Transfer ownership of shared packages BEFORE the cascade
      //    delete would wipe them. A "shared" package is one that has
      //    at least one other student in package_members.
      // ---------------------------------------------------------------
      if (reassignShared) {
        const { data: ownedPkgs } = await service
          .from("class_packages")
          .select("id")
          .eq("user_id", uid);
        for (const pkg of ownedPkgs ?? []) {
          const { data: members } = await service
            .from("package_members")
            .select("student_id, added_at")
            .eq("package_id", pkg.id)
            .order("added_at", { ascending: true });
          const others = (members ?? []).filter(
            (m: any) => m.student_id !== uid,
          );
          if (others.length === 0) continue; // not shared, will be deleted normally
          let newOwner = explicitNewOwner;
          if (!newOwner || !others.some((m: any) => m.student_id === newOwner)) {
            newOwner = others[0].student_id;
          }
          await service
            .from("class_packages")
            .update({ user_id: newOwner })
            .eq("id", pkg.id);
          // The new owner shouldn't also be listed as a member.
          await service
            .from("package_members")
            .delete()
            .eq("package_id", pkg.id)
            .eq("student_id", newOwner);
          // Re-attribute any lessons that still record the departing user
          // as the attendee on this shared package, so history stays.
          await service
            .from("lessons")
            .update({ student_id: newOwner })
            .eq("package_id", pkg.id)
            .eq("student_id", uid);
        }
      }

      // ---------------------------------------------------------------
      // 2) Wipe all DB rows tied to this user (best-effort).
      //    Order is forgiving — there are no FKs to auth.users, only
      //    logical references, plus a few NO-ACTION FKs to profiles we
      //    must clear explicitly so the final auth delete can succeed.
      // ---------------------------------------------------------------
      await service.from("staff_permissions").delete().eq("user_id", uid);
      await service.from("notifications").delete().eq("user_id", uid);
      await service.from("student_media").delete().eq("student_id", uid);
      await service.from("student_drills").delete().eq("student_id", uid);
      await service.from("videos").delete().eq("student_id", uid);
      await service.from("student_points").delete().eq("user_id", uid);
      await service.from("handicap_history").delete().eq("user_id", uid);
      await service.from("lessons").delete().eq("student_id", uid);
      await service.from("payments").delete().eq("student_id", uid);
      await service.from("analysis_requests").delete().eq("student_id", uid);
      // Detach this user from any shared package they were a guest on.
      await service.from("package_members").delete().eq("student_id", uid);
      const { data: pkgs } = await service
        .from("class_packages")
        .select("id")
        .eq("user_id", uid);
      if (pkgs?.length) {
        await service
          .from("package_payments")
          .delete()
          .in("package_id", pkgs.map((p: any) => p.id));
      }
      await service.from("class_packages").delete().eq("user_id", uid);
      // Scheduling / recurring
      await service.from("recurring_lesson_slots").delete().eq("student_id", uid).then(() => {}, () => {});
      await service
        .from("fixed_schedule_slots")
        .update({ student_id: null, is_available: true, claimed_at: null })
        .eq("student_id", uid);
      await service.from("fixed_schedule_slots").delete().eq("created_by", uid);
      // Billing / Stripe (NO-ACTION FK to profiles)
      await service.from("subscriptions").delete().eq("student_id", uid);
      await service.from("stripe_payments").delete().eq("student_id", uid);
      // AI / coaching artifacts
      await service.from("ai_coach_sessions").delete().eq("student_id", uid);
      await service.from("ai_training_plans").delete().eq("student_id", uid);
      await service.from("coach_ai_conversations").delete().eq("coach_id", uid);
      // Golf data
      await service.from("golf_rounds").delete().eq("student_id", uid);
      await service.from("golf_courses").delete().eq("student_id", uid);
      await service.from("student_courses").delete().eq("student_id", uid);
      // Family / parent access
      await service
        .from("family_links")
        .delete()
        .or(`parent_user_id.eq.${uid},child_user_id.eq.${uid}`);
      await service.from("parent_access_grants").delete().eq("student_id", uid);
      // Invites
      await service.from("student_invites").delete().eq("inviter_id", uid);
      await service.from("invite_redemptions").delete().eq("accepted_by", uid);
      await service
        .from("dismissed_duplicates")
        .delete()
        .or(`student_id_a.eq.${uid},student_id_b.eq.${uid}`);
      await service.from("user_roles").delete().eq("user_id", uid);
      await service.from("profiles").delete().eq("id", uid);

      if (email) {
        await service
          .from("pending_staff_invites")
          .delete()
          .eq("email", email.toLowerCase());
      }

      // Finally remove the auth user so the email becomes free again.
      const { error: delErr } = await service.auth.admin.deleteUser(uid);
      if (delErr) return json({ error: delErr.message }, 500);

      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});