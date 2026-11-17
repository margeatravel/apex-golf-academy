import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

/**
 * Edits a managed (account-less) family member: name, birth date, photo.
 * Allowed only for accounts linked to that member through family_links,
 * and only when the target profile is actually managed.
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
    const memberId = String(body.memberId || "").trim();
    const fullName = body.fullName === undefined ? undefined : String(body.fullName).trim();
    const birthDate = body.birthDate === undefined ? undefined : String(body.birthDate).trim();
    const photoUrl = body.photoUrl === undefined ? undefined : String(body.photoUrl).trim();

    if (!memberId) return json({ error: "memberId required" }, 400);
    if (fullName !== undefined && (fullName.length < 2 || fullName.length > 120)) {
      return json({ error: "invalid_name" }, 400);
    }
    if (
      birthDate !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)))
    ) {
      return json({ error: "invalid_birth_date" }, 400);
    }

    const service = createClient(SUPABASE_URL, SERVICE);

    const { data: member } = await service
      .from("profiles")
      .select("id, is_managed, managed_by")
      .eq("id", memberId)
      .maybeSingle();
    if (!member) return json({ error: "not_found" }, 404);
    if (!member.is_managed) return json({ error: "not_managed" }, 403);

    const { data: link } = await service
      .from("family_links")
      .select("id")
      .or(
        `and(parent_user_id.eq.${callerId},child_user_id.eq.${memberId}),` +
          `and(child_user_id.eq.${callerId},parent_user_id.eq.${memberId})`,
      )
      .limit(1)
      .maybeSingle();

    // Owner/coach editing from the student preview: authorized by the same
    // server-side check that gates the preview of the member's owner.
    let allowed = !!link;
    if (!allowed && member.managed_by) {
      const { data: canPreview } = await anonClient.rpc("can_preview_student", {
        _student_id: member.managed_by,
      });
      allowed = canPreview === true;
    }
    if (!allowed) return json({ error: "Not authorized" }, 403);

    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.full_name = fullName;
    if (birthDate !== undefined) updates.birth_date = birthDate;
    if (photoUrl !== undefined) updates.photo_url = photoUrl || null;
    if (!Object.keys(updates).length) return json({ ok: true, updated: false });

    const { error: updErr } = await service.from("profiles").update(updates).eq("id", memberId);
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, updated: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
