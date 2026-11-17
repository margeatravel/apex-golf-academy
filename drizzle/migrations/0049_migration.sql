CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.gcal_sync_queue (
  user_id uuid PRIMARY KEY,
  pending boolean NOT NULL DEFAULT true,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gcal_sync_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gcal_sync_queue TO service_role;

INSERT INTO public.internal_cron_tokens (name, token)
VALUES ('gcal_sync', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.gcal_request_sync(_user_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ids uuid[];
  _token text;
BEGIN
  SELECT array_agg(DISTINCT c.user_id) INTO _ids
  FROM app_user_connections c
  WHERE c.connector_id = 'google_calendar' AND c.user_id = ANY(_user_ids);
  IF _ids IS NULL THEN RETURN; END IF;

  INSERT INTO gcal_sync_queue (user_id, pending, updated_at)
  SELECT unnest(_ids), true, now()
  ON CONFLICT (user_id) DO UPDATE SET pending = true, updated_at = now();

  SELECT token INTO _token FROM internal_cron_tokens WHERE name = 'gcal_sync';
  PERFORM net.http_post(
    url := 'https://rlynhhrriskauwvfczkx.supabase.co/functions/v1/sync-my-google-calendar',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _token),
    body := jsonb_build_object('user_ids', to_jsonb(_ids))
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'gcal_request_sync failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.gcal_request_sync(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gcal_lessons_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(x) INTO _ids FROM (SELECT coach_id x FROM new_rows UNION SELECT student_id FROM new_rows) s WHERE x IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(x) INTO _ids FROM (SELECT coach_id x FROM old_rows UNION SELECT student_id FROM old_rows) s WHERE x IS NOT NULL;
  ELSE
    SELECT array_agg(x) INTO _ids FROM (
      SELECT coach_id x FROM new_rows UNION SELECT student_id FROM new_rows
      UNION SELECT coach_id FROM old_rows UNION SELECT student_id FROM old_rows) s WHERE x IS NOT NULL;
  END IF;
  IF _ids IS NOT NULL THEN PERFORM gcal_request_sync(_ids); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gcal_blocks_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT coach_id) INTO _ids FROM new_rows WHERE coach_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT coach_id) INTO _ids FROM old_rows WHERE coach_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT x) INTO _ids FROM (SELECT coach_id x FROM new_rows UNION SELECT coach_id FROM old_rows) s WHERE x IS NOT NULL;
  END IF;
  IF _ids IS NOT NULL THEN PERFORM gcal_request_sync(_ids); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER gcal_lessons_ins AFTER INSERT ON public.lessons REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_lessons_changed();
CREATE TRIGGER gcal_lessons_upd AFTER UPDATE ON public.lessons REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_lessons_changed();
CREATE TRIGGER gcal_lessons_del AFTER DELETE ON public.lessons REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_lessons_changed();
CREATE TRIGGER gcal_blocks_ins AFTER INSERT ON public.coach_availability_blocks REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_blocks_changed();
CREATE TRIGGER gcal_blocks_upd AFTER UPDATE ON public.coach_availability_blocks REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_blocks_changed();
CREATE TRIGGER gcal_blocks_del AFTER DELETE ON public.coach_availability_blocks REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.gcal_blocks_changed();