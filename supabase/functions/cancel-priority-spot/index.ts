import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtTime12(hms: string): string {
  const [hStr, mStr] = hms.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const studentId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find this student's active recurring slots
    const { data: slots, error: slotsErr } = await admin
      .from('recurring_lesson_slots')
      .select('id, weekday, start_time, duration_minutes, lesson_type')
      .eq('student_id', studentId)
      .eq('is_active', true);
    if (slotsErr) throw slotsErr;
    if (!slots || slots.length === 0) {
      return new Response(JSON.stringify({ error: 'No active priority spot found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    const slotIds = slots.map((s) => s.id);

    // 1) Delete future auto-generated, scheduled lessons tied to these recurring slots.
    const { error: lessonDelErr } = await admin
      .from('lessons')
      .delete()
      .in('recurring_slot_id', slotIds)
      .eq('auto_generated', true)
      .eq('status', 'scheduled')
      .gt('lesson_date', todayStr);
    if (lessonDelErr) console.warn('cancel-priority-spot: lesson cleanup error', lessonDelErr);

    // 2) Release the matching fixed_schedule_slots (set student_id = null, is_available = true)
    for (const s of slots) {
      const { error: relErr } = await admin
        .from('fixed_schedule_slots')
        .update({
          student_id: null,
          is_available: true,
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('student_id', studentId)
        .eq('day_of_week', s.weekday)
        .eq('start_time', s.start_time);
      if (relErr) console.warn('cancel-priority-spot: release slot error', relErr);
    }

    // 3) Deactivate the recurring slot rows.
    const { error: deactErr } = await admin
      .from('recurring_lesson_slots')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', slotIds);
    if (deactErr) throw deactErr;

    // 4) Notify admin (best-effort).
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', studentId)
        .maybeSingle();
      const studentName = profile?.full_name || profile?.email || 'A student';
      const first = slots[0];
      const dayLabel = DAY_LABELS[first.weekday] ?? '—';
      const timeLabel = fmtTime12(first.start_time);

      await fetch(`${SUPABASE_URL}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          eventType: 'priority_spot_cancelled',
          studentName,
          studentEmail: profile?.email,
          spotDay: dayLabel,
          spotTime: first.start_time,
        }),
      });
    } catch (e) {
      console.warn('cancel-priority-spot: notify-admin failed', e);
    }

    return new Response(JSON.stringify({ success: true, cancelled: slots.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('cancel-priority-spot error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
