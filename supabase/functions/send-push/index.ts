import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@margeagolfacademy.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payloadIn = await req.json().catch(() => ({}));
    const record = payloadIn?.record ?? payloadIn;

    const title = String(record?.title || 'Margea Golf Academy').slice(0, 120);
    const body = String(record?.body || '').slice(0, 300);
    const url = String(record?.link_url || '/');
    const tag = String(record?.id || record?.type || 'apex-broadcast');

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');
    if (error) throw error;

    const message = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    const stale: string[] = [];

    await Promise.allSettled(
      (subs ?? []).map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message,
          );
          sent++;
        } catch (err: any) {
          const status = err?.statusCode ?? err?.status;
          if (status === 404 || status === 410) stale.push(s.id);
          else console.error('[send-push] delivery failed', s.endpoint, status, err?.message);
        }
      }),
    );

    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('id', stale);
    }

    return new Response(JSON.stringify({ ok: true, total: subs?.length ?? 0, sent, removed: stale.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    console.error('[send-push] error', e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || 'unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
