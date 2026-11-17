import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Merge duplicate students.
 * Body: { primaryId: string, duplicateId: string }
 *
 * All records from duplicateId are reassigned to primaryId.
 * The duplicate profile is soft-deleted (name prefixed).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roleCheck } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) return json({ error: "Admin only" }, 403);

    const { primaryId, duplicateId } = await req.json();
    if (!primaryId || !duplicateId || primaryId === duplicateId) {
      return json({ error: "Invalid primaryId / duplicateId" }, 400);
    }

    // Verify both profiles exist
    const { data: primary } = await supabase.from("profiles").select("*").eq("id", primaryId).single();
    const { data: duplicate } = await supabase.from("profiles").select("*").eq("id", duplicateId).single();
    if (!primary || !duplicate) return json({ error: "Profile not found" }, 404);

    const summary = {
      lessonsReassigned: 0,
      packagesReassigned: 0,
      paymentsReassigned: 0,
      videosReassigned: 0,
      mediaReassigned: 0,
      drillsReassigned: 0,
      pointsMerged: false,
      recurringSlotsReassigned: 0,
    };

    // 1. Reassign lessons (skip exact duplicates by date+status)
    const { data: dupLessons } = await supabase
      .from("lessons")
      .select("id, lesson_date, status")
      .eq("student_id", duplicateId);

    if (dupLessons && dupLessons.length > 0) {
      // Get existing lesson dates for primary to avoid duplicates
      const { data: primaryLessons } = await supabase
        .from("lessons")
        .select("lesson_date, status")
        .eq("student_id", primaryId);

      const existingSet = new Set(
        (primaryLessons || []).map((l: any) => `${l.lesson_date}|${l.status}`)
      );

      for (const lesson of dupLessons) {
        const key = `${lesson.lesson_date}|${lesson.status}`;
        if (existingSet.has(key)) {
          // Delete true duplicate lesson
          await supabase.from("lessons").delete().eq("id", lesson.id);
        } else {
          await supabase.from("lessons").update({ student_id: primaryId }).eq("id", lesson.id);
          summary.lessonsReassigned++;
        }
      }
    }

    // 2. Reassign class_packages (and their payments)
    const { data: dupPkgs } = await supabase
      .from("class_packages")
      .select("id")
      .eq("user_id", duplicateId);

    if (dupPkgs && dupPkgs.length > 0) {
      for (const pkg of dupPkgs) {
        await supabase.from("class_packages").update({ user_id: primaryId }).eq("id", pkg.id);
        summary.packagesReassigned++;
      }
      summary.paymentsReassigned = dupPkgs.length;
    }

    // 2b. Reassign package_members rows (dedupe if primary already a member)
    const { data: dupMembers } = await supabase
      .from("package_members")
      .select("id, package_id")
      .eq("student_id", duplicateId);

    if (dupMembers && dupMembers.length > 0) {
      const { data: primaryMembers } = await supabase
        .from("package_members")
        .select("package_id")
        .eq("student_id", primaryId);
      const primarySet = new Set((primaryMembers || []).map((m: any) => m.package_id));

      for (const m of dupMembers) {
        if (primarySet.has(m.package_id)) {
          // Both already members → drop the duplicate row
          await supabase.from("package_members").delete().eq("id", m.id);
        } else {
          await supabase
            .from("package_members")
            .update({ student_id: primaryId })
            .eq("id", m.id);
        }
      }
    }

    // 3. Reassign videos
    const { data: dupVideos } = await supabase
      .from("videos")
      .select("id")
      .eq("student_id", duplicateId);
    if (dupVideos && dupVideos.length > 0) {
      await supabase.from("videos").update({ student_id: primaryId }).in("id", dupVideos.map((v: any) => v.id));
      summary.videosReassigned = dupVideos.length;
    }

    // 4. Reassign student_media
    const { data: dupMedia } = await supabase
      .from("student_media")
      .select("id")
      .eq("student_id", duplicateId);
    if (dupMedia && dupMedia.length > 0) {
      await supabase.from("student_media").update({ student_id: primaryId }).in("id", dupMedia.map((m: any) => m.id));
      summary.mediaReassigned = dupMedia.length;
    }

    // 4b. Move the duplicate's STORAGE objects into the primary's folder.
    //
    // Root cause this fixes: video/media rows are keyed by student_id (moved in
    // steps 3 and 4), but the files themselves live at "<ownerId>/<file>" and the
    // storage SELECT policies are keyed by that first folder segment
    // (auth.uid()::text = foldername(name)[1]). After a merge the rows belong to
    // the primary but the files still sit in the duplicate's folder, so the
    // primary can see the row and never load the file. We physically move the
    // objects and rewrite the stored URLs. Idempotent: a second run finds no
    // files left in the duplicate folder and the URL rewrite is a no-op.
    const storageSummary = { filesMoved: 0, urlsRewritten: 0, errors: [] as string[] };

    const moveFolder = async (bucket: string) => {
      const listAll = async (prefix: string): Promise<string[]> => {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
        if (error || !data) return [];
        const out: string[] = [];
        for (const entry of data) {
          const path = `${prefix}/${entry.name}`;
          if ((entry as any).id === null && !(entry as any).metadata) {
            out.push(...(await listAll(path))); // nested folder
          } else {
            out.push(path);
          }
        }
        return out;
      };

      const files = await listAll(duplicateId);
      for (const from of files) {
        const to = `${primaryId}${from.slice(duplicateId.length)}`;
        const { error } = await supabase.storage.from(bucket).move(from, to);
        if (error) {
          const msg = String(error.message || "");
          // "already exists" / "not found" → nothing to do, keep going.
          if (!/exist|not found/i.test(msg)) storageSummary.errors.push(`${bucket}:${from}: ${msg}`);
        } else {
          storageSummary.filesMoved++;
        }
      }
    };

    for (const bucket of ["lesson-videos", "golf-media"]) {
      try {
        await moveFolder(bucket);
      } catch (e: any) {
        storageSummary.errors.push(`${bucket}: ${e?.message || "move failed"}`);
      }
    }

    // Rewrite any stored URL that still points at the duplicate's folder.
    const rewriteUrls = async (table: string, ownerCol: string) => {
      const { data: rows } = await supabase
        .from(table)
        .select("id, file_url, thumbnail_url")
        .eq(ownerCol, primaryId);
      for (const r of rows || []) {
        const patch: Record<string, string> = {};
        for (const col of ["file_url", "thumbnail_url"] as const) {
          const val = (r as any)[col];
          if (typeof val === "string" && val.includes(`/${duplicateId}/`)) {
            patch[col] = val.split(`/${duplicateId}/`).join(`/${primaryId}/`);
          }
        }
        if (Object.keys(patch).length) {
          await supabase.from(table).update(patch).eq("id", (r as any).id);
          storageSummary.urlsRewritten++;
        }
      }
    };

    await rewriteUrls("videos", "student_id");
    await rewriteUrls("student_media", "student_id");
    (summary as any).storage = storageSummary;

    // 5. Reassign drills
    const { data: dupDrills } = await supabase
      .from("student_drills")
      .select("id")
      .eq("student_id", duplicateId);
    if (dupDrills && dupDrills.length > 0) {
      await supabase.from("student_drills").update({ student_id: primaryId }).in("id", dupDrills.map((d: any) => d.id));
      summary.drillsReassigned = dupDrills.length;
    }

    // 6. Merge points
    const { data: dupPoints } = await supabase
      .from("student_points")
      .select("*")
      .eq("user_id", duplicateId)
      .maybeSingle();

    if (dupPoints) {
      const { data: primaryPoints } = await supabase
        .from("student_points")
        .select("*")
        .eq("user_id", primaryId)
        .maybeSingle();

      if (primaryPoints) {
        await supabase
          .from("student_points")
          .update({
            total_points: primaryPoints.total_points + dupPoints.total_points,
            total_lessons_ever: primaryPoints.total_lessons_ever + dupPoints.total_lessons_ever,
            reward_available: (primaryPoints.total_points + dupPoints.total_points) >= 100,
          })
          .eq("user_id", primaryId);
      } else {
        // Move points record to primary
        await supabase.from("student_points").update({ user_id: primaryId }).eq("user_id", duplicateId);
      }
      // Delete duplicate points row if it still exists
      await supabase.from("student_points").delete().eq("user_id", duplicateId);
      summary.pointsMerged = true;
    }

    // 7. Reassign notifications
    await supabase.from("notifications").update({ user_id: primaryId }).eq("user_id", duplicateId);

    // 8. Reassign analysis_requests
    await supabase.from("analysis_requests").update({ student_id: primaryId }).eq("student_id", duplicateId);

    // 9. Reassign payments table
    await supabase.from("payments").update({ student_id: primaryId }).eq("student_id", duplicateId);

    // 10. Reassign handicap_history
    await supabase.from("handicap_history").update({ user_id: primaryId }).eq("user_id", duplicateId);

    // 10b. Reassign recurring_lesson_slots (dedupe by weekday+start_time)
    const { data: dupSlots } = await supabase
      .from("recurring_lesson_slots")
      .select("id, weekday, start_time")
      .eq("student_id", duplicateId);

    if (dupSlots && dupSlots.length > 0) {
      const { data: primarySlots } = await supabase
        .from("recurring_lesson_slots")
        .select("weekday, start_time")
        .eq("student_id", primaryId);
      const primarySlotSet = new Set(
        (primarySlots || []).map((s: any) => `${s.weekday}|${s.start_time}`)
      );

      for (const s of dupSlots) {
        const key = `${s.weekday}|${s.start_time}`;
        if (primarySlotSet.has(key)) {
          await supabase.from("recurring_lesson_slots").delete().eq("id", s.id);
        } else {
          await supabase
            .from("recurring_lesson_slots")
            .update({ student_id: primaryId })
            .eq("id", s.id);
          summary.recurringSlotsReassigned++;
          primarySlotSet.add(key);
        }
      }
    }

    // 11. Remove duplicate's role and soft-mark profile
    await supabase.from("user_roles").delete().eq("user_id", duplicateId);
    await supabase
      .from("profiles")
      .update({
      })
      .eq("id", duplicateId);

    // 12. Preserve the "real" contact info on the primary profile.
    // Imported CSV students get auto-generated placeholder emails
    // (e.g. "import_123_456@scgolf.placeholder", "split-...@placeholder.local",
    // "no-email-...@placeholder.local"). When merging, prefer the email/phone
    // that looks real over the placeholder.
    const looksPlaceholder = (email?: string | null) => {
      if (!email) return true;
      return (
        /^import_\d+_\d+@scgolf\.placeholder$/i.test(email) ||
        /^split-.*@placeholder\.local$/i.test(email) ||
        /^no-email-.*@placeholder\.local$/i.test(email) ||
        /^merged\+.*@archived\.local$/i.test(email)
      );
    };

    const profileUpdates: Record<string, any> = {};

    // Email: if primary's email looks like a placeholder and duplicate's looks real, take duplicate's
    if (looksPlaceholder(primary.email) && !looksPlaceholder(duplicate.email)) {
      profileUpdates.email = duplicate.email;
    }

    // Phone: keep non-empty value (prefer primary, fall back to duplicate)
    if (!primary.phone && duplicate.phone) {
      profileUpdates.phone = duplicate.phone;
    }

    // Full name: fall back to duplicate's if primary is missing
    if (!primary.full_name && duplicate.full_name) {
      profileUpdates.full_name = duplicate.full_name;
    }

    // Photo: keep primary's, fall back to duplicate's
    if (!primary.photo_url && duplicate.photo_url) {
      profileUpdates.photo_url = duplicate.photo_url;
    }

    if (Object.keys(profileUpdates).length > 0) {
      // Free up the duplicate's email first if we're moving it over (email may be unique on profiles).
      if (profileUpdates.email && profileUpdates.email === duplicate.email) {
        await supabase
          .from("profiles")
          .update({ email: `merged+${duplicateId}@archived.local` })
          .eq("id", duplicateId);
      }
      await supabase.from("profiles").update(profileUpdates).eq("id", primaryId);
    }

    // 12b. CRITICAL: also keep auth.users in sync. Supabase sends
    // password-reset / magic-link emails to auth.users.email — if we only
    // update profiles.email, the student will never receive their reset
    // mail because Supabase mails to the placeholder address that was
    // generated when the auth user was first created. We update both
    // records via the admin API.
    const authSummary = { primaryEmailUpdated: false, duplicateEmailParked: false, error: null as string | null };
    try {
      // Park the duplicate's auth email so the real address is free.
      await supabase.auth.admin.updateUserById(duplicateId, {
        email: `merged+${duplicateId}@archived.local`,
        email_confirm: true,
      });
      authSummary.duplicateEmailParked = true;

      // If we decided the primary should now own the duplicate's real email,
      // mirror that change into auth.users too.
      if (profileUpdates.email && !looksPlaceholder(profileUpdates.email)) {
        const { error: primaryAuthErr } = await supabase.auth.admin.updateUserById(primaryId, {
          email: profileUpdates.email,
          email_confirm: true,
        });
        if (primaryAuthErr) {
          authSummary.error = primaryAuthErr.message;
        } else {
          authSummary.primaryEmailUpdated = true;
        }
      }
    } catch (e: any) {
      authSummary.error = e?.message || "auth admin update failed";
    }
    (summary as any).auth = authSummary;

    return json({ success: true, summary });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
