-- Additive: private token table used to authenticate internal pg_cron -> edge function calls.
CREATE TABLE IF NOT EXISTS public.internal_cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.internal_cron_tokens TO service_role;

ALTER TABLE public.internal_cron_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) can read it.

INSERT INTO public.internal_cron_tokens (name)
VALUES ('daily_lesson_reminders')
ON CONFLICT (name) DO NOTHING;

-- Re-point the daily reminder cron at a working Authorization header.
-- The previous job read vault secret 'email_queue_service_role_key', which no
-- longer exists (vault.secrets is empty), so the header was NULL -> 401.
SELECT cron.unschedule('send-daily-lesson-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-lesson-reminders');

SELECT cron.schedule(
  'send-daily-lesson-reminders',
  '0 11 * * *', -- 06:00 America/Cancun (UTC-5, no DST)
  $$
  SELECT net.http_post(
    url := 'https://rlynhhrriskauwvfczkx.supabase.co/functions/v1/send-daily-lesson-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT token FROM public.internal_cron_tokens WHERE name = 'daily_lesson_reminders')
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 55000
  );
  $$
);
