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
 * CONVENTION: the SENDER (from_user_id) picks the relationship of the
 * INVITEE (to_user_id) *relative to the sender*.
 *   relationship='hijo'        -> invitee is the sender's child
 *                                 parent=from, child=to
 *   relationship='papa'|'mama' -> invitee is the sender's father/mother
 *                                 parent=to, child=from
 *   relationship='pareja'      -> symmetric: two rows (from->to and to->from)
 */
function linkRowsFor(
  relationship: string,
  from: string,
  to: string,
): Array<{ parent_user_id: string; child_user_id: string; relationship: string }> {
  if (relationship === "hijo") {
    return [{ parent_user_id: from, child_user_id: to, relationship }];
  }
  if (relationship === "papa" || relationship === "mama") {
    return [{ parent_user_id: to, child_user_id: from, relationship }];
  }
  // pareja — symmetric
  return [
    { parent_user_id: from, child_user_id: to, relationship },
    { parent_user_id: to, child_user_id: from, relationship },
  ];
}

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
    const requestId = String(body.requestId || "").trim();
    if (!requestId) return json({ error: "requestId required" }, 400);

    const service = createClient(SUPABASE_URL, SERVICE);

    const { data: reqRow, error: reqErr } = await service
      .from("family_link_requests")
      .select("id, from_user_id, to_user_id, relationship, status")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) return json({ error: reqErr.message }, 400);
    if (!reqRow) return json({ error: "Request not found" }, 404);
    if (reqRow.to_user_id !== callerId) return json({ error: "Not authorized" }, 403);
    if (reqRow.status !== "pending") return json({ error: "Request already resolved" }, 409);

    // Mark accepted first, scoped to status='pending' so concurrent calls
    // cannot both proceed (acts as the atomic guard).
    const { data: updated, error: updErr } = await service
      .from("family_link_requests")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updErr) return json({ error: updErr.message }, 400);
    if (!updated) return json({ error: "Request already resolved" }, 409);

    const rows = linkRowsFor(reqRow.relationship, reqRow.from_user_id, reqRow.to_user_id);

    const created: string[] = [];
    for (const row of rows) {
      const { data: existing } = await service
        .from("family_links")
        .select("id")
        .eq("parent_user_id", row.parent_user_id)
        .eq("child_user_id", row.child_user_id)
        .maybeSingle();
      if (existing) continue;
      const { data: ins, error: insErr } = await service
        .from("family_links")
        .insert({ ...row, created_by: callerId })
        .select("id")
        .maybeSingle();
      // Ignore unique-violation races; surface anything else.
      if (insErr && insErr.code !== "23505") {
        return json({ error: insErr.message }, 400);
      }
      if (ins?.id) created.push(ins.id);
    }

    // When a partnership is accepted, share each side's managed (account-less)
    // family members with the other partner.
    if (reqRow.relationship === "pareja") {
      const pair = [reqRow.from_user_id, reqRow.to_user_id];
      for (const owner of pair) {
        const other = owner === pair[0] ? pair[1] : pair[0];
        const { data: managed } = await service
          .from("family_links")
          .select("child_user_id, profiles:child_user_id(is_managed)")
          .eq("parent_user_id", owner);
        for (const row of managed || []) {
          // deno-lint-ignore no-explicit-any
          const isManaged = (row as any).profiles?.is_managed === true;
          if (!isManaged) continue;
          const childId = row.child_user_id as string;
          const { data: exists } = await service
            .from("family_links")
            .select("id")
            .eq("parent_user_id", other)
            .eq("child_user_id", childId)
            .maybeSingle();
          if (exists) continue;
          const { error: shareErr } = await service.from("family_links").insert({
            parent_user_id: other,
            child_user_id: childId,
            relationship: "hijo",
            created_by: callerId,
          });
          if (shareErr && shareErr.code !== "23505") {
            return json({ error: shareErr.message }, 400);
          }
          created.push(childId);
        }
      }
    }

    return json({ ok: true, request_id: requestId, links_created: created.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
