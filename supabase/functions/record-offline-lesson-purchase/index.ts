import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function todayInCancun(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric', month: '2-digit', day: '2-digit',
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
    const method = body?.method as 'Transfer' | 'Cash';
    const concept = (body?.concept as string) || 'Individual Lesson';
    const totalAmount = Number(body?.totalAmount);
    const lessonsCredited = Math.floor(Number(body?.lessonsCredited));
    const packageName = (body?.packageName as string) || concept;

    if (!['Transfer', 'Cash'].includes(method)) {
      return new Response(JSON.stringify({ error: 'Invalid method' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return new Response(JSON.stringify({ error: 'Invalid totalAmount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isFinite(lessonsCredited) || lessonsCredited < 1 || lessonsCredited > 100) {
      return new Response(JSON.stringify({ error: 'Invalid lessonsCredited' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve coach from profile
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('id, assigned_coach_id, full_name, email')
      .eq('id', studentId)
      .maybeSingle();
    if (profErr) throw profErr;
    const coachId = (profile as any)?.assigned_coach_id;
    if (!coachId) {
      return new Response(JSON.stringify({ error: 'No assigned coach' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = todayInCancun();
    const noteText = method === 'Transfer'
      ? 'Pago por transferencia — pendiente de confirmación'
      : 'Pago en efectivo — pendiente de confirmación';

    // 1) Insert payment record (pending confirmation by admin)
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        student_id: studentId,
        coach_id: coachId,
        payment_date: today,
        amount: totalAmount,
        payment_method: method,
        concept,
        notes: noteText,
      })
      .select('id')
      .single();
    if (payErr) throw payErr;

    // 2) Credit lessons immediately so student can book
    const { data: pkg, error: pkgErr } = await admin
      .from('class_packages')
      .insert({
        user_id: studentId,
        package_size: lessonsCredited,
        classes_remaining: lessonsCredited,
        classes_used: 0,
        is_active: true,
        payment_status: 'pending',
        amount_paid: totalAmount,
        price: totalAmount,
        package_name: packageName,
        payment_date: today,
      })
      .select('id')
      .single();
    if (pkgErr) throw pkgErr;

    // 3) Notify admin (best-effort)
    try {
      await admin.functions.invoke('notify-admin', {
        body: {
          eventType: 'offline_payment_recorded',
          payload: {
            studentId,
            studentName: (profile as any)?.full_name,
            studentEmail: (profile as any)?.email,
            method,
            concept,
            totalAmount,
            lessonsCredited,
            packageId: pkg.id,
            paymentId: payment.id,
          },
        },
      });
    } catch (e) {
      console.warn('[record-offline-lesson-purchase] notify-admin failed', e);
    }

    return new Response(
      JSON.stringify({ success: true, packageId: pkg.id, paymentId: payment.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[record-offline-lesson-purchase] error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});