import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { hasPaidAccess } from "../_shared/paid-plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Max managed (account-less) family members a paid account may create. */
const MAX_MANAGED = 3;

/**
 * Creates a family member WITHOUT a usable account (e.g. a child), owned by
 * the caller. Reuses the placeholder-user mechanism already used by
 * create-student, and links the new profile to the caller (and to every
 * partner already linked to the caller) through family_links.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const onBehalfOf = body.onBehalfOf ? String(body.onBehalfOf).trim() : null;
    const fullName = String(body.fullName || "").trim();
    const birthDate = String(body.birthDate || "").trim();
    const photoUrl = body.photoUrl ? String(body.photoUrl).trim() : null;

    if (fullName.length < 2 || fullName.length > 120) {
      return json({ error: "invalid_name" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
      return json({ error: "invalid_birth_date" }, 400);
    }

    const service = createClient(SUPABASE_URL, SERVICE);

    // Owner of the new member. Inside the coach/owner student preview the
    // caller acts on behalf of the previewed student; authorization uses the
    // same server-side check that gates the preview itself.
    let ownerId = callerId;
    let staffActing = false;
    if (onBehalfOf && onBehalfOf !== callerId) {
      const { data: canPreview, error: previewErr } = await anonClient.rpc(
        "can_preview_student",
        { _student_id: onBehalfOf },
      );
      if (previewErr || canPreview !== true) return json({ error: "Not authorized" }, 403);
      ownerId = onBehalfOf;
      staffActing = true;
    }

    // Paid plan (or active trial) required — except when an admin/coach creates
    // the member from the student's profile on their behalf.
    if (!staffActing && !(await hasPaidAccess(service, ownerId))) {
      return json({ error: "plan_required" }, 403);
    }


    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("managed_by", ownerId);
    if ((count ?? 0) >= MAX_MANAGED) return json({ error: "limit_reached", max: MAX_MANAGED }, 409);

    // Owner profile: the managed member inherits the assigned coach.
    const { data: creator } = await service
      .from("profiles")
      .select("assigned_coach_id")
      .eq("id", ownerId)
      .maybeSingle();

    const slug = fullName
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9.]/g, "");
    const placeholderEmail = `${slug || "familiar"}.${Date.now()}@placeholder.sc`;

    const { data: newUser, error: createErr } = await service.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      password: crypto.randomUUID(), // never used — this member does not sign in
      user_metadata: { full_name: fullName },
    });
    if (createErr || !newUser?.user?.id) {
      return json({ error: createErr?.message || "create_failed" }, 400);
    }
    const newId = newUser.user.id;

    // handle_new_user created the profile + student role; fill in the rest.
    const { error: updErr } = await service
      .from("profiles")
      .update({
        full_name: fullName,
        birth_date: birthDate,
        photo_url: photoUrl,
        is_managed: true,
        managed_by: ownerId,
        plan_tier: "free",
        assigned_coach_id: creator?.assigned_coach_id || null,
      })
      .eq("id", newId);
    if (updErr) return json({ error: updErr.message }, 400);

    // Link to the owner and to every partner already linked to the owner.
    const { data: partnerRows } = await service
      .from("family_links")
      .select("parent_user_id, child_user_id")
      .eq("relationship", "pareja")
      .or(`parent_user_id.eq.${ownerId},child_user_id.eq.${ownerId}`);

    const parents = new Set<string>([ownerId]);
    for (const row of partnerRows || []) {
      const other = row.parent_user_id === ownerId ? row.child_user_id : row.parent_user_id;
      if (other) parents.add(other as string);
    }

    for (const parentId of parents) {
      const { error: insErr } = await service.from("family_links").insert({
        parent_user_id: parentId,
        child_user_id: newId,
        relationship: "hijo",
        created_by: callerId,
      });
      if (insErr && insErr.code !== "23505") return json({ error: insErr.message }, 400);
    }

    return json({ ok: true, id: newId, linked_parents: parents.size });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
