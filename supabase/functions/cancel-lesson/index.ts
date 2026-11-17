import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function todayInCancun(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

    const body = await req.json().catch(() => ({}));
    const lessonId = body?.lessonId as string | undefined;
    if (!lessonId) {
      return new Response(JSON.stringify({ error: 'lessonId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load lesson and verify ownership + eligibility
    const { data: lesson, error: lessonErr } = await admin
      .from('lessons')
      .select('id, student_id, lesson_date, lesson_time, lesson_type, status, package_id, recurring_slot_id, duration_minutes')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonErr) throw lessonErr;
    if (!lesson) {
      return new Response(JSON.stringify({ error: 'Lesson not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // A lesson of a SHARED package belongs to the package, not to a person:
    // its owner and every member may cancel it. Individual-package lessons and
    // unlinked lessons stay private to their own student.
    let sharedMemberIds: string[] = [];
    let isSharedPackageLesson = false;
    if (lesson.package_id) {
      const [{ data: pkgRow }, { data: memberRows }] = await Promise.all([
        admin.from('class_packages').select('user_id').eq('id', lesson.package_id).maybeSingle(),
        admin.from('package_members').select('student_id').eq('package_id', lesson.package_id),
      ]);
      const members = (memberRows ?? []).map((m: any) => m.student_id as string);
      isSharedPackageLesson = members.length > 0;
      sharedMemberIds = Array.from(
        new Set([...(pkgRow?.user_id ? [pkgRow.user_id as string] : []), ...members]),
      );
    }
    const allowed =
      lesson.student_id === studentId ||
      (isSharedPackageLesson && sharedMemberIds.includes(studentId));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Not your lesson' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (lesson.status !== 'scheduled') {
      return new Response(JSON.stringify({ error: 'Only scheduled lessons can be cancelled' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const today = todayInCancun();
    if ((lesson.lesson_date as string) < today) {
      return new Response(JSON.stringify({ error: 'Past lessons cannot be cancelled' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 24-hour cancellation policy (students only). Lesson_date/time are stored
    // in Cancun local time (UTC-5, no DST). Treat as -05:00.
    const startIso = `${lesson.lesson_date}T${(lesson.lesson_time as string).slice(0, 8)}-05:00`;
    const startMs = new Date(startIso).getTime();
    const hoursUntil = (startMs - Date.now()) / 3_600_000;
    if (hoursUntil < 24) {
      return new Response(JSON.stringify({
        error: 'too_soon',
        message: 'Cancellations must be made at least 24 hours in advance. Please contact your Coach directly.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const packageId = lesson.package_id as string | null;
    // Capture the Google Calendar event id before deleting the row, so we can
    // remove the matching event from Coach Santi's calendar afterwards.
    const { data: eventRow } = await admin
      .from('lessons')
      .select('google_calendar_event_id')
      .eq('id', lessonId)
      .maybeSingle();
    const gcalEventId = eventRow?.google_calendar_event_id as string | null;

    // Delete the lesson. The lessons_before_delete_handler trigger reverses any
    // completion bookkeeping; for scheduled lessons it's a no-op. We refund the
    // package slot manually below since the lesson was scheduled (not completed).
    const { error: delErr } = await admin.from('lessons').delete().eq('id', lessonId);
    if (delErr) throw delErr;

    // Refund 1 slot to the package (if linked)
    if (packageId) {
      const { data: pkg } = await admin
        .from('class_packages')
        .select('id, classes_remaining, classes_used, package_size')
        .eq('id', packageId)
        .maybeSingle();
      if (pkg) {
        const newRemaining = (pkg.classes_remaining ?? 0) + 1;
        const newUsed = Math.max((pkg.classes_used ?? 0) - 1, 0);
        await admin
          .from('class_packages')
          .update({
            classes_remaining: newRemaining,
            classes_used: newUsed,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId);
      }
    }

    // Look up student profile + remaining lessons after refund
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', studentId)
      .maybeSingle();
    const studentName = profile?.full_name || profile?.email || 'A student';
    const studentEmail = profile?.email as string | undefined;

    let lessonsRemaining: number | null = null;
    if (packageId) {
      const { data: pkg2 } = await admin
        .from('class_packages')
        .select('classes_remaining')
        .eq('id', packageId)
        .maybeSingle();
      lessonsRemaining = pkg2?.classes_remaining ?? null;
    }

    // Shared package: tell every OTHER member (bell notification, best-effort).
    if (isSharedPackageLesson) {
      try {
        const recipients = Array.from(
          new Set([...sharedMemberIds, lesson.student_id as string]),
        ).filter((id) => id && id !== studentId);
        if (recipients.length) {
          await admin.from('notifications').insert(
            recipients.map((uid) => ({
              user_id: uid,
              type: 'lesson_cancelled',
              title: 'Clase de paquete compartido cancelada',
              message: `${studentName} canceló la clase del ${lesson.lesson_date} a las ${String(lesson.lesson_time).slice(0, 5)}. El crédito regresó al paquete compartido.`,
              link: '/lessons',
              metadata: { package_id: packageId, cancelled_by: studentId },
            })),
          );
        }
      } catch (e) {
        console.warn('cancel-lesson: shared member notifications failed', e);
      }
    }



    // Notify admin (best-effort)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          eventType: 'lesson_cancelled',
          studentName,
          studentEmail,
          lessonDate: lesson.lesson_date,
          lessonTime: lesson.lesson_time,
          lessonType: lesson.lesson_type,
        }),
      });
    } catch (e) {
      console.warn('cancel-lesson: notify-admin failed', e);
    }

    // Email student (best-effort)
    if (studentEmail) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            to: studentEmail,
            studentName,
            notificationType: 'lesson_cancelled',
            lessonDate: lesson.lesson_date,
            lessonTime: lesson.lesson_time,
            lessonType: lesson.lesson_type,
            lessonsRemaining,
          }),
        });
      } catch (e) {
        console.warn('cancel-lesson: student email failed', e);
      }
    }

    // Remove the matching event from Coach Santi's Google Calendar (best-effort)
    if (gcalEventId) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'delete_event_id', eventId: gcalEventId }),
        });
      } catch (e) {
        console.warn('cancel-lesson: gcal delete failed', e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, lessonsRemaining }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('cancel-lesson error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});