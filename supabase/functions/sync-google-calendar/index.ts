import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GCAL_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY_1');
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

/**
 * Coach-side Google Calendar sync.
 *
 * Actions (all mutate Coach Santi's Google Calendar via the Lovable connector
 * gateway, which handles OAuth token refresh transparently):
 *
 *   - "create"   { lessonId }            → creates an event, stores its id on lessons.google_calendar_event_id
 *   - "update"   { lessonId }            → patches the existing event (or creates if missing)
 *   - "delete"   { lessonId }            → deletes the event from Google Calendar
 *   - "delete_event_id" { eventId }      → low-level: delete by event id (used after row already deleted)
 *   - "test"                             → verifies credentials + lists calendars (used by admin "Connect" button)
 *   - "backfill"                         → push all upcoming scheduled lessons to Santi's calendar
 *
 * The function is a no-op (returns { skipped: 'sync_disabled' }) unless the
 * academy_settings.google_calendar_sync.enabled flag is true.
 */

function buildEventBody(lesson: any, studentName: string) {
  const date = lesson.lesson_date as string;
  const rawTime = ((lesson.lesson_time as string) || '00:00:00').slice(0, 8);
  // Normalize to HH:MM:SS (Cancun local clock time)
  const parts = rawTime.split(':');
  const sH = parseInt(parts[0] || '0', 10);
  const sM = parseInt(parts[1] || '0', 10);
  const sS = parseInt(parts[2] || '0', 10);
  const duration = lesson.duration_minutes ?? 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const startLocal = `${date}T${pad(sH)}:${pad(sM)}:${pad(sS)}`;

  // Compute end purely in local clock terms — no UTC round-trip — to avoid
  // double-applying the Cancun offset when we append `-05:00` below.
  const totalEndMinutes = sH * 60 + sM + duration;
  const dayCarry = Math.floor(totalEndMinutes / (24 * 60));
  const minutesInDay = ((totalEndMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const eH = Math.floor(minutesInDay / 60);
  const eM = minutesInDay % 60;

  let endDate = date;
  if (dayCarry !== 0) {
    const [y, mo, d] = date.split('-').map(Number);
    const base = new Date(Date.UTC(y, mo - 1, d));
    base.setUTCDate(base.getUTCDate() + dayCarry);
    endDate = `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
  }
  const endLocal = `${endDate}T${pad(eH)}:${pad(eM)}:${pad(sS)}`;

  const summary = `${lesson.lesson_type || 'Lesson'} · ${studentName}`;
  const descriptionLines = [
    `Student: ${studentName}`,
    `Type: ${lesson.lesson_type ?? 'Lesson'}`,
    `Duration: ${duration} min`,
  ];
  if (lesson.coach_notes) descriptionLines.push(`Coach notes: ${lesson.coach_notes}`);
  if (lesson.student_notes) descriptionLines.push(`Student notes: ${lesson.student_notes}`);
  descriptionLines.push('', 'Synced from SC Golf Academy');

  return {
    summary,
    description: descriptionLines.join('\n'),
    start: { dateTime: `${startLocal}-05:00`, timeZone: 'America/Cancun' },
    end: { dateTime: `${endLocal}-05:00`, timeZone: 'America/Cancun' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 24 * 60 },
      ],
    },
    extendedProperties: {
      private: { sc_lesson_id: lesson.id },
    },
  };
}

async function gcalFetch(path: string, init: RequestInit = {}) {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  if (!GCAL_API_KEY) throw new Error('GOOGLE_CALENDAR_API_KEY_1 is not configured');
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GCAL_API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function readSyncSettings(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from('academy_settings')
    .select('value')
    .eq('key', 'google_calendar_sync')
    .maybeSingle();
  const value = (data?.value ?? {}) as {
    enabled?: boolean;
    calendar_id?: string;
  };
  return {
    enabled: !!value.enabled,
    calendarId: value.calendar_id || 'primary',
  };
}

async function loadLesson(admin: ReturnType<typeof createClient>, lessonId: string) {
  const { data: lesson, error } = await admin
    .from('lessons')
    .select('id, student_id, lesson_date, lesson_time, lesson_type, duration_minutes, coach_notes, student_notes, google_calendar_event_id, status, skipped, invitee_name')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) return null;
  let studentName = lesson.invitee_name as string | null;
  if (lesson.student_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', lesson.student_id)
      .maybeSingle();
    studentName = profile?.full_name || profile?.email || studentName || 'Student';
  }
  return { ...lesson, _studentName: studentName ?? 'Student' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token !== SERVICE_KEY) {
      const { data, error } = await admin.auth.getClaims(token ?? '');
      const callerId = data?.claims?.sub;
      if (error || !callerId) throw new Error('Unauthorized');
      const [{ data: owner }, { data: staff }] = await Promise.all([
        admin.rpc('has_role', { _user_id: callerId, _role: 'admin' }),
        admin.rpc('has_staff_permission', { _user_id: callerId, _scope: 'google_calendar' }),
      ]);
      if (!owner && !staff) throw new Error('Google Calendar access required');
    }

    // "test" doesn't require sync to be enabled — it's the admin connect button
    if (action === 'test') {
      const res = await gcalFetch('/users/me/calendarList?maxResults=10');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, status: res.status, error: json }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          calendars: (json.items ?? []).map((c: any) => ({ id: c.id, summary: c.summary, primary: !!c.primary })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const settings = await readSyncSettings(admin);
    if (!settings.enabled && action !== 'force_create') {
      return new Response(JSON.stringify({ skipped: 'sync_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const calendarId = encodeURIComponent(settings.calendarId);

    if (action === 'delete_event_id') {
      const eventId = body?.eventId as string | undefined;
      if (!eventId) return new Response(JSON.stringify({ error: 'eventId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const res = await gcalFetch(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      return new Response(JSON.stringify({ ok: res.ok || res.status === 404 || res.status === 410 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'backfill') {
      const today = new Date().toISOString().slice(0, 10);
      const { data: lessons = [] } = await admin
        .from('lessons')
        .select('id')
        .eq('status', 'scheduled')
        .eq('skipped', false)
        .gte('lesson_date', today)
        .is('google_calendar_event_id', null);
      let created = 0;
      let failed = 0;
      for (const row of lessons || []) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ action: 'create', lessonId: row.id }),
          });
          if (r.ok) created++; else failed++;
        } catch { failed++; }
      }
      return new Response(JSON.stringify({ ok: true, created, failed, total: (lessons || []).length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lessonId = body?.lessonId as string | undefined;
    if (!lessonId) {
      return new Response(JSON.stringify({ error: 'lessonId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const lesson = await loadLesson(admin, lessonId);
      const eventId = lesson?.google_calendar_event_id as string | null;
      if (!eventId) {
        return new Response(JSON.stringify({ ok: true, skipped: 'no_event' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const res = await gcalFetch(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404 || res.status === 410) {
        await admin.from('lessons').update({ google_calendar_event_id: null }).eq('id', lessonId);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // create / update / force_create
    const lesson = await loadLesson(admin, lessonId);
    if (!lesson) {
      return new Response(JSON.stringify({ error: 'Lesson not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const eventBody = buildEventBody(lesson, lesson._studentName);
    const existingEventId = lesson.google_calendar_event_id as string | null;

    let res: Response;
    if (existingEventId && (action === 'update' || action === 'create')) {
      res = await gcalFetch(
        `/calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}`,
        { method: 'PATCH', body: JSON.stringify(eventBody) },
      );
      if (res.status === 404 || res.status === 410) {
        // Event was removed externally — fall through to create
        res = await gcalFetch(`/calendars/${calendarId}/events`, { method: 'POST', body: JSON.stringify(eventBody) });
      }
    } else {
      res = await gcalFetch(`/calendars/${calendarId}/events`, { method: 'POST', body: JSON.stringify(eventBody) });
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('gcal sync failed', res.status, json);
      return new Response(JSON.stringify({ error: 'gcal_failed', status: res.status, detail: json }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (json.id && json.id !== existingEventId) {
      await admin.from('lessons').update({ google_calendar_event_id: json.id }).eq('id', lessonId);
    }

    return new Response(JSON.stringify({ ok: true, eventId: json.id, htmlLink: json.htmlLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('sync-google-calendar error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});