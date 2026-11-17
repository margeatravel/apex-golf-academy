CREATE OR REPLACE FUNCTION public.notify_admin_lesson_booked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_name text;
  v_student_email text;
  v_paid_with text;
  v_lessons_remaining int;
  v_package_size int;
  v_supabase_url text := 'https://rlynhhrriskauwvfczkx.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o';
BEGIN
  -- Suppress per-lesson notifications for auto-generated lessons (recurring/priority bulk).
  IF COALESCE(NEW.auto_generated, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email), email
      INTO v_student_name, v_student_email
    FROM public.profiles
    WHERE id = NEW.student_id;
  END IF;

  v_student_name  := COALESCE(v_student_name,  NEW.invitee_name,  'Unknown student');
  v_student_email := COALESCE(v_student_email, NEW.invitee_email);

  -- Derive payment pathway from booking artifacts
  IF NEW.package_id IS NOT NULL THEN
    v_paid_with := 'package';
    SELECT classes_remaining, package_size
      INTO v_lessons_remaining, v_package_size
    FROM public.class_packages
    WHERE id = NEW.package_id;
  ELSIF NEW.coach_notes ILIKE 'Payment:%card%' THEN
    v_paid_with := 'card';
  ELSIF NEW.coach_notes ILIKE 'Payment:%cash%' OR NEW.coach_notes ILIKE 'Payment:%transfer%' THEN
    v_paid_with := 'cash_transfer';
  ELSE
    v_paid_with := 'membership';
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'eventType',        'lesson_booked',
      'studentName',       v_student_name,
      'studentEmail',      v_student_email,
      'lessonDate',        to_char(NEW.lesson_date, 'YYYY-MM-DD'),
      'lessonTime',        to_char(NEW.lesson_time, 'HH24:MI'),
      'lessonType',        NEW.lesson_type,
      'paidWith',          v_paid_with,
      'lessonsRemaining',  v_lessons_remaining,
      'packageSize',       v_package_size
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notify_admin_lesson_booked failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;