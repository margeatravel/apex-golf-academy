CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_admin_lesson_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_student_email text;
  v_supabase_url text := 'https://rlynhhrriskauwvfczkx.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o';
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email), email
      INTO v_student_name, v_student_email
    FROM public.profiles
    WHERE id = NEW.student_id;
  END IF;

  v_student_name  := COALESCE(v_student_name,  NEW.invitee_name,  'Unknown student');
  v_student_email := COALESCE(v_student_email, NEW.invitee_email);

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'eventType',   'lesson_booked',
      'studentName',  v_student_name,
      'studentEmail', v_student_email,
      'lessonDate',   to_char(NEW.lesson_date, 'YYYY-MM-DD'),
      'lessonTime',   to_char(NEW.lesson_time, 'HH24:MI'),
      'lessonType',   NEW.lesson_type
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notify_admin_lesson_booked failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_lesson_booked ON public.lessons;
CREATE TRIGGER trg_notify_admin_lesson_booked
AFTER INSERT ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_lesson_booked();