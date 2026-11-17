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

type Item = { id: string; source: "videos" | "media" };

/** Extracts the object path of a stored public/signed URL for a bucket. */
function pathInBucket(url: string, bucket: string): string | null {
  const m = String(url).match(
    new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`),
  );
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Moves already-uploaded videos / media from a student to one of their linked
 * family members (including managed members without an account). Rows change
 * owner, files are physically moved to the destination folder and the stored
 * URLs are rewritten, so storage policies keep working. Idempotent.
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
    const fromStudentId = String(body.fromStudentId || "").trim();
    const toStudentId = String(body.toStudentId || "").trim();
    const items = (Array.isArray(body.items) ? body.items : []) as Item[];

    if (!fromStudentId || !toStudentId) return json({ error: "missing_ids" }, 400);
    if (fromStudentId === toStudentId) return json({ error: "same_student" }, 400);
    if (!items.length) return json({ error: "no_items" }, 400);

    const service = createClient(SUPABASE_URL, SERVICE);

    // Authorization: owner/admin, staff with lessons scope, or the coach the
    // student is assigned to (the same rule that gates the student preview).
    const { data: canPreview } = await anonClient.rpc("can_preview_student", {
      _student_id: fromStudentId,
    });
    if (canPreview !== true) return json({ error: "Not authorized" }, 403);

    // The destination must be linked to the student through family_links.
    const { data: link } = await service
      .from("family_links")
      .select("id")
      .or(
        `and(parent_user_id.eq.${fromStudentId},child_user_id.eq.${toStudentId}),` +
          `and(child_user_id.eq.${fromStudentId},parent_user_id.eq.${toStudentId})`,
      )
      .limit(1)
      .maybeSingle();
    if (!link) return json({ error: "not_family" }, 403);

    const summary = { moved: 0, files_moved: 0, skipped: 0, errors: [] as string[] };

    const moveFile = async (bucket: string, url: string | null): Promise<string | null> => {
      if (!url) return null;
      const from = pathInBucket(url, bucket);
      if (!from || !from.startsWith(`${fromStudentId}/`)) return null;
      const to = `${toStudentId}${from.slice(fromStudentId.length)}`;
      const { error } = await service.storage.from(bucket).move(from, to);
      if (error && !/exist|not found/i.test(String(error.message || ""))) {
        summary.errors.push(`${bucket}:${from}: ${error.message}`);
        return null;
      }
      if (!error) summary.files_moved++;
      return url.split(`/${fromStudentId}/`).join(`/${toStudentId}/`);
    };

    for (const item of items) {
      const table = item.source === "media" ? "student_media" : "videos";
      const bucket = item.source === "media" ? "golf-media" : "lesson-videos";

      const { data: row } = await service
        .from(table)
        .select("id, student_id, file_url, thumbnail_url")
        .eq("id", item.id)
        .maybeSingle();
      if (!row || (row as any).student_id !== fromStudentId) {
        summary.skipped++;
        continue;
      }

      // `videos` rows may live in either bucket depending on the upload path.
      const buckets = item.source === "media"
        ? [bucket]
        : ["lesson-videos", "golf-media"];

      let fileUrl = (row as any).file_url as string | null;
      let thumbUrl = (row as any).thumbnail_url as string | null;
      for (const b of buckets) {
        const nf = await moveFile(b, fileUrl);
        if (nf) fileUrl = nf;
        const nt = await moveFile(b, thumbUrl);
        if (nt) thumbUrl = nt;
      }

      const patch: Record<string, unknown> = { student_id: toStudentId };
      if (fileUrl) patch.file_url = fileUrl;
      if (thumbUrl !== undefined) patch.thumbnail_url = thumbUrl;
      // The lesson belongs to the original student, so the link is dropped.
      if (item.source === "media") {
        patch.lesson_id = null;
        patch.is_general = true;
      } else {
        patch.lesson_id = null;
      }

      const { error: updErr } = await service.from(table).update(patch).eq("id", item.id);
      if (updErr) {
        summary.errors.push(`${table}:${item.id}: ${updErr.message}`);
        summary.skipped++;
        continue;
      }
      summary.moved++;
    }

    return json({ ok: true, ...summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
