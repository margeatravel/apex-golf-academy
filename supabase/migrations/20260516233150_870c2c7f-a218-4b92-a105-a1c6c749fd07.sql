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
  v_completed_used int;
  v_lesson_status text;
  v_is_apex boolean := false;
  v_plan_tier text;
  v_override text;
  v_override_expires timestamptz;
  v_supabase_url text := 'https://rlynhhrriskauwvfczkx.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o';
BEGIN
  IF COALESCE(NEW.auto_generated, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email), email, plan_tier, manual_plan_override, override_expires_at
      INTO v_student_name, v_student_email, v_plan_tier, v_override, v_override_expires
    FROM public.profiles
    WHERE id = NEW.student_id;

    v_is_apex := (v_plan_tier = 'apex')
              OR (v_override = 'apex' AND (v_override_expires IS NULL OR v_override_expires > now()));
  END IF;

  v_student_name  := COALESCE(v_student_name,  NEW.invitee_name,  'Unknown student');
  v_student_email := COALESCE(v_student_email, NEW.invitee_email);

  IF NEW.lesson_date > CURRENT_DATE THEN
    v_lesson_status := 'scheduled';
  ELSE
    v_lesson_status := COALESCE(NEW.status::text, 'scheduled');
  END IF;

  IF NEW.package_id IS NOT NULL THEN
    v_paid_with := 'package';
    SELECT package_size INTO v_package_size
      FROM public.class_packages WHERE id = NEW.package_id;
    SELECT COALESCE(SUM(CASE WHEN lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END), 0)
      INTO v_completed_used
      FROM public.lessons
      WHERE package_id = NEW.package_id AND status = 'completed';
    v_lessons_remaining := GREATEST(COALESCE(v_package_size,0) - v_completed_used, 0);
  ELSIF NEW.coach_notes ILIKE 'Payment:%card%' THEN
    v_paid_with := 'card';
  ELSIF NEW.coach_notes ILIKE 'Payment:%cash%' OR NEW.coach_notes ILIKE 'Payment:%transfer%' THEN
    v_paid_with := 'cash_transfer';
  ELSIF v_is_apex THEN
    v_paid_with := 'membership';
  ELSE
    v_paid_with := 'unpaid';
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
      'packageSize',       v_package_size,
      'lessonStatus',      v_lesson_status
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notify_admin_lesson_booked failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Retroactively fix existing in-app notifications: any lesson_booked notification
-- marked as 'membership' for a student who is NOT actually Apex should be 'unpaid'.
UPDATE public.notifications n
SET metadata = jsonb_set(n.metadata, '{paid_with}', '"unpaid"'::jsonb)
FROM public.profiles p
WHERE n.type = 'lesson_booked'
  AND n.metadata->>'paid_with' = 'membership'
  AND lower(p.email) = lower(n.metadata->>'student_email')
  AND NOT (
    p.plan_tier = 'apex'
    OR (p.manual_plan_override = 'apex' AND (p.override_expires_at IS NULL OR p.override_expires_at > now()))
  );