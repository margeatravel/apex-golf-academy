-- 1) Skip individual lesson_booked notifications for auto-generated recurring lessons.
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


-- 2) Update handle_fixed_schedule_claim to send ONE recurring_schedule_created email
--    in addition to in-app admin notifications.
CREATE OR REPLACE FUNCTION public.handle_fixed_schedule_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_student_email TEXT;
  v_plan TEXT;
  v_is_sc BOOLEAN;
  v_override TEXT;
  v_day_label TEXT;
  v_time_label TEXT;
  v_admin RECORD;
  v_recurring_id UUID;
  v_today DATE := CURRENT_DATE;
  v_cursor DATE;
  v_week INT;
  v_weeks_generated INT := 0;
  v_supabase_url text := 'https://rlynhhrriskauwvfczkx.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o';
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.student_id IS NULL
     AND NEW.student_id IS NOT NULL
     AND NEW.student_id = auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT has_staff_permission(auth.uid(), 'lessons'::text)
  THEN
    SELECT plan_tier, is_sc_student, manual_plan_override
      INTO v_plan, v_is_sc, v_override
    FROM public.profiles
    WHERE id = NEW.student_id;

    IF NOT (
      v_plan IN ('scratch','pro')
      OR v_override IN ('scratch','pro')
      OR v_is_sc = true
    ) THEN
      RAISE EXCEPTION 'Only Scratch or Pro members can claim fixed schedule spots';
    END IF;

    NEW.claimed_at := now();
    NEW.is_available := false;

    INSERT INTO public.recurring_lesson_slots (
      student_id, weekday, start_time, duration_minutes, lesson_type, is_active, notes
    ) VALUES (
      NEW.student_id,
      NEW.day_of_week,
      NEW.start_time,
      NEW.duration_minutes,
      NEW.lesson_type,
      true,
      COALESCE(NEW.notes, 'From Fixed Schedule claim')
    )
    RETURNING id INTO v_recurring_id;

    v_cursor := v_today + ((NEW.day_of_week - EXTRACT(DOW FROM v_today)::int + 7) % 7);
    FOR v_week IN 0..7 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.lessons
        WHERE student_id = NEW.student_id
          AND lesson_date = v_cursor
          AND lesson_time = NEW.start_time
      ) THEN
        INSERT INTO public.lessons (
          student_id, lesson_date, lesson_time, duration_minutes, lesson_type,
          status, recurring_slot_id, auto_generated, currency
        ) VALUES (
          NEW.student_id, v_cursor, NEW.start_time, NEW.duration_minutes, NEW.lesson_type,
          'scheduled', v_recurring_id, true, 'MXN'
        );
        v_weeks_generated := v_weeks_generated + 1;
      END IF;
      v_cursor := v_cursor + INTERVAL '7 days';
    END LOOP;

    v_day_label := (ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[NEW.day_of_week + 1];
    v_time_label := to_char(NEW.start_time, 'HH12:MI AM');

    SELECT COALESCE(full_name, email), email
      INTO v_student_name, v_student_email
    FROM public.profiles WHERE id = NEW.student_id;

    FOR v_admin IN
      SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        v_admin.user_id,
        'fixed_schedule_claim',
        'Fixed Schedule spot claimed',
        v_student_name || ' has booked the ' || v_day_label || ' ' || v_time_label || ' fixed schedule spot.',
        '/admin/fixed-schedule',
        jsonb_build_object(
          'slot_id', NEW.id,
          'recurring_slot_id', v_recurring_id,
          'student_id', NEW.student_id,
          'day_of_week', NEW.day_of_week,
          'start_time', NEW.start_time
        )
      );
    END LOOP;

    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/notify-admin',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
          'eventType',       'recurring_schedule_created',
          'studentName',      v_student_name,
          'studentEmail',     v_student_email,
          'dayOfWeek',        v_day_label,
          'spotTime',         to_char(NEW.start_time, 'HH24:MI'),
          'lessonTime',       to_char(NEW.start_time, 'HH24:MI'),
          'durationMinutes',  NEW.duration_minutes,
          'lessonType',       NEW.lesson_type,
          'weeksGenerated',   v_weeks_generated
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recurring_schedule_created notify failed: %', SQLERRM;
    END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;