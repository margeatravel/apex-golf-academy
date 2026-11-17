
-- Per-coach Google Calendar OAuth tokens
CREATE TABLE public.coach_google_calendar_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  access_token text,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  scope text,
  sync_enabled boolean NOT NULL DEFAULT true,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.coach_google_calendar_tokens TO authenticated;
GRANT ALL ON public.coach_google_calendar_tokens TO service_role;

ALTER TABLE public.coach_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches read own token row"
  ON public.coach_google_calendar_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Coaches can only update sync_enabled / calendar_id on their own row (not tokens)
CREATE POLICY "Coaches update own sync preferences"
  ON public.coach_google_calendar_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.protect_coach_google_calendar_tokens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.access_token IS DISTINCT FROM OLD.access_token
     OR NEW.refresh_token_encrypted IS DISTINCT FROM OLD.refresh_token_encrypted
     OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
     OR NEW.google_email IS DISTINCT FROM OLD.google_email
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only backend can modify token fields';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_coach_google_calendar_tokens
  BEFORE UPDATE ON public.coach_google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.protect_coach_google_calendar_tokens();

-- Sync attempt log
CREATE TABLE public.google_calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid,
  action text NOT NULL,
  status text NOT NULL,
  error text,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcal_sync_log_coach_created ON public.google_calendar_sync_log(coach_id, created_at DESC);
CREATE INDEX idx_gcal_sync_log_lesson ON public.google_calendar_sync_log(lesson_id);

GRANT SELECT ON public.google_calendar_sync_log TO authenticated;
GRANT ALL ON public.google_calendar_sync_log TO service_role;

ALTER TABLE public.google_calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach or admin reads own sync log"
  ON public.google_calendar_sync_log FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Per-coach event id on lessons (separate from the shared academy google_calendar_event_id)
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS coach_google_event_id text;
