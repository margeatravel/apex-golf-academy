import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { appUserReconnectRequired, callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { GOOGLE_CALENDAR_SCOPES } from "../_shared/appUserScopes.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";
const TZ = "America/Cancun";
const DAYS_AHEAD = 90;
const TIME_BUDGET_MS = 110000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Cancún is fixed UTC-5 (no DST). */
function cancunIso(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00-05:00`).toISOString();
}
function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Desired = {
  key: string; // "lesson:<id>" | "block:<id>"
  summary: string;
  description: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
};

/**
 * Mirrors the signed-in user's app calendar into their own Google Calendar.
 * Every event we create is tagged with extendedProperties.private.apexKey, so
 * each run creates missing events, updates changed ones, and deletes events
 * whose lesson/block was cancelled, skipped or deleted in the app.
 * Coaches get their lessons + blocked times; students get their own lessons.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

    // Automatic mode: database trigger posts { user_ids } with the internal token.
    const { data: tok } = await admin.from("internal_cron_tokens").select("token").eq("name", "gcal_sync").maybeSingle();
    if (tok?.token && bearer === tok.token) {
      const body = await req.json().catch(() => ({}));
      const ids = Array.isArray(body?.user_ids) ? body.user_ids.filter((x: unknown) => typeof x === "string").slice(0, 50) : [];
      const results: Record<string, unknown> = {};
      for (const uid of ids) results[uid] = await runQueued(admin, uid);
      return json({ results });
    }

    const authed = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Sign in required" }, 401);
    const result = await syncUser(admin, user.id);
    return json(result, (result as any).status ?? 200);
  } catch (error) {
    console.error("sync-my-google-calendar failed:", error);
    return json({ error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});

/** Runs a sync for one user unless one is already running; re-runs while changes keep arriving. */
async function runQueued(admin: any, userId: string) {
  const lockUntil = new Date(Date.now() + 3 * 60000).toISOString();
  const { data: claimed } = await admin
    .from("gcal_sync_queue")
    .update({ locked_until: lockUntil, pending: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
    .select("user_id");
  if (!claimed?.length) return { skipped: "already_running" };
  let last: unknown = null;
  try {
    for (let i = 0; i < 3; i++) {
      last = await syncUser(admin, userId);
      const { data: q } = await admin.from("gcal_sync_queue").select("pending").eq("user_id", userId).maybeSingle();
      if (!q?.pending) break;
      await admin.from("gcal_sync_queue").update({ pending: false }).eq("user_id", userId);
    }
  } finally {
    await admin.from("gcal_sync_queue").update({ locked_until: null }).eq("user_id", userId);
  }
  return last;
}

async function syncUser(admin: any, userId: string): Promise<Record<string, unknown>> {
  const user = { id: userId };
  {
    const key = await getConnectionKeyForUser(user.id, CONNECTOR_ID);
    if (!key) return { error: "not_connected", status: 400 };
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString().slice(0, 10);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const call = async (path: string, init?: RequestInit) => {
      for (let attempt = 0; ; attempt++) {
        await sleep(200);
        const r = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR_ID, path, init, requiredScopes: GOOGLE_CALENDAR_SCOPES });
        if ((r.status === 403 || r.status === 429) && attempt < 4) {
          const t = await r.clone().text();
          if (/rateLimit|Rate Limit/i.test(t)) { await sleep(1000 * 2 ** attempt); continue; }
        }
        return r;
      }
    };

    // ---- Desired state from the app ----
    const { data: lessons, error } = await admin
      .from("lessons")
      .select("id, coach_id, student_id, lesson_date, lesson_time, lesson_start_at, lesson_end_at, duration_minutes, lesson_type, status, skipped, coach_google_event_id, invitee_name")
      .or(`coach_id.eq.${user.id},student_id.eq.${user.id}`)
      .gte("lesson_date", today)
      .lte("lesson_date", until);
    if (error) throw error;

    const { data: blocks } = await admin
      .from("coach_availability_blocks")
      .select("id, block_date, start_time, end_time, reason")
      .eq("coach_id", user.id)
      .gte("block_date", today)
      .lte("block_date", until);

    const peopleIds = [...new Set((lessons ?? []).flatMap((l) => [l.student_id, l.coach_id]).filter(Boolean))] as string[];
    const { data: profs } = peopleIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", peopleIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));

    const desired = new Map<string, Desired>();
    const legacyIds = new Map<string, string>(); // google event id -> key (events made before tagging)
    for (const l of lessons ?? []) {
      if (l.status !== "scheduled" || l.skipped) continue;
      const minutes = l.duration_minutes || (/playing|campo|field/i.test(l.lesson_type) ? 120 : 60);
      let start = l.lesson_start_at as string | null;
      let end = l.lesson_end_at as string | null;
      if (!start && l.lesson_date && l.lesson_time) start = cancunIso(l.lesson_date, l.lesson_time);
      if (!start) continue;
      if (!end) end = new Date(new Date(start).getTime() + minutes * 60000).toISOString();
      const asCoach = l.coach_id === user.id;
      const other = asCoach
        ? names.get(l.student_id ?? "") || l.invitee_name || "Alumno"
        : `Coach ${names.get(l.coach_id ?? "") || ""}`.trim();
      const k = `lesson:${l.id}`;
      desired.set(k, {
        key: k,
        summary: `Margea · ${other}`,
        description: `${l.lesson_type} — Margea Golf Academy`,
        start: { dateTime: new Date(start).toISOString(), timeZone: TZ },
        end: { dateTime: new Date(end).toISOString(), timeZone: TZ },
      });
      if (asCoach && l.coach_google_event_id) legacyIds.set(l.coach_google_event_id, k);
    }
    // Blocked times are not added to Google; lessons that fall inside a block
    // are removed from Google so the coach never has to clean them up by hand.
    const blockRanges = (blocks ?? []).map((b: any) => ({
      start: new Date(`${b.block_date}T${(b.start_time ?? "00:00").slice(0, 5)}:00-05:00`).getTime(),
      end: b.end_time ? new Date(`${b.block_date}T${b.end_time.slice(0, 5)}:00-05:00`).getTime()
        : new Date(`${nextDay(b.block_date)}T00:00:00-05:00`).getTime(),
    }));
    for (const [k, d] of [...desired.entries()]) {
      const s0 = new Date(d.start.dateTime!).getTime(), e0 = new Date(d.end.dateTime!).getTime();
      if (blockRanges.some((r) => s0 < r.end && e0 > r.start)) desired.delete(k);
    }

    // ---- Current state in Google (our events only) ----
    const existing = new Map<string, any>(); // key -> event
    const orphans: any[] = [];
    let pageToken = "";
    const timeMin = new Date(`${today}T00:00:00-05:00`).toISOString();
    const timeMax = new Date(`${nextDay(until)}T00:00:00-05:00`).toISOString();
    do {
      const qs = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", maxResults: "2500", showDeleted: "false" });
      if (pageToken) qs.set("pageToken", pageToken);
      const r = await call(`/calendar/v3/calendars/primary/events?${qs}`);
      if (await appUserReconnectRequired(r.clone())) return { error: "reconnect_required", status: 401 };
      if (!r.ok) {
        const body = await r.text();
        console.error(`List events failed [${r.status}]: ${body}`);
        return { error: "Provider request failed", status: r.status, details: body };
      }
      const page = await r.json();
      for (const ev of page.items ?? []) {
        const tagged = ev.extendedProperties?.private?.apexKey as string | undefined;
        const k = tagged ?? legacyIds.get(ev.id);
        if (k) {
          if (existing.has(k)) orphans.push(ev); // duplicate
          else existing.set(k, ev);
        } else if (ev.extendedProperties?.private?.apexSource === "app") {
          orphans.push(ev);
        }
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);

    // Untagged events left from the first sync for lessons that no longer exist.
    const { data: staleRows } = await admin
      .from("lessons")
      .select("id, coach_google_event_id, status, skipped")
      .eq("coach_id", user.id)
      .not("coach_google_event_id", "is", null);
    const staleLegacy = (staleRows ?? []).filter((r) => r.status !== "scheduled" || r.skipped);

    const startedAt = Date.now();
    const inBudget = () => Date.now() - startedAt < TIME_BUDGET_MS;
    let created = 0, updated = 0, removed = 0, failed = 0;
    let lastError: string | null = null;
    const headers = { "Content-Type": "application/json" };

    const same = (ev: any, d: Desired) =>
      ev.summary === d.summary &&
      ev.extendedProperties?.private?.apexKey === d.key &&
      (d.start.date ? ev.start?.date === d.start.date && ev.end?.date === d.end.date
        : new Date(ev.start?.dateTime).getTime() === new Date(d.start.dateTime!).getTime() &&
          new Date(ev.end?.dateTime).getTime() === new Date(d.end.dateTime!).getTime());

    // 1) Delete events no longer wanted
    const toDelete = [...orphans, ...[...existing.entries()].filter(([k]) => !desired.has(k)).map(([, ev]) => ev)];
    for (const ev of toDelete) {
      if (!inBudget()) break;
      const r = await call(`/calendar/v3/calendars/primary/events/${ev.id}`, { method: "DELETE" });
      if (r.ok || r.status === 404 || r.status === 410) removed++;
      else { failed++; lastError = `${r.status}: ${await r.text()}`; }
    }
    for (const row of staleLegacy) {
      if (!inBudget()) break;
      const r = await call(`/calendar/v3/calendars/primary/events/${row.coach_google_event_id}`, { method: "DELETE" });
      if (r.ok || r.status === 404 || r.status === 410) {
        await admin.from("lessons").update({ coach_google_event_id: null }).eq("id", row.id);
        if (r.ok) removed++;
      }
    }

    // 2) Create / update
    let pending = 0;
    for (const d of desired.values()) {
      if (!inBudget()) { pending++; continue; }
      const ev = existing.get(d.key);
      if (ev && same(ev, d)) continue;
      const body = JSON.stringify({
        summary: d.summary,
        description: d.description,
        start: d.start,
        end: d.end,
        extendedProperties: { private: { apexSource: "app", apexKey: d.key } },
      });
      const r = ev
        ? await call(`/calendar/v3/calendars/primary/events/${ev.id}`, { method: "PATCH", headers, body })
        : await call(`/calendar/v3/calendars/primary/events`, { method: "POST", headers, body });
      if (!r.ok) { failed++; lastError = `${r.status}: ${await r.text()}`; continue; }
      if (ev) updated++; else created++;
    }

    if (lastError) console.error("sync-my-google-calendar last error:", lastError);
    return { created, updated, removed, failed, pending, lastError };
  }
}
