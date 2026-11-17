
-- Replace the fixed_schedule_slots claim handler so a claim ALSO mirrors into
-- recurring_lesson_slots (Coach's Recurring tab) and pre-creates 8 weeks of
-- scheduled lessons for the student (their Upcoming tab).

CREATE OR REPLACE FUNCTION public.handle_fixed_schedule_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_name TEXT;
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
BEGIN
  -- Only act on a new claim by the student themself
  IF TG_OP = 'UPDATE'
     AND OLD.student_id IS NULL
     AND NEW.student_id IS NOT NULL
     AND NEW.student_id = auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT has_staff_permission(auth.uid(), 'lessons'::text)
  THEN
    -- Verify paid plan
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

    -- 1) Mirror into recurring_lesson_slots so Coach's Recurring tab sees it
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

    -- 2) Pre-create 8 weeks of scheduled lessons for the student's Upcoming tab
    -- Find the next occurrence on/after today for this weekday (PG dow: 0=Sun..6=Sat)
    v_cursor := v_today + ((NEW.day_of_week - EXTRACT(DOW FROM v_today)::int + 7) % 7);
    FOR v_week IN 0..7 LOOP
      -- Skip if a lesson already exists for this student at this date+time
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
      END IF;
      v_cursor := v_cursor + INTERVAL '7 days';
    END LOOP;

    -- 3) Notify all admins
    v_day_label := (ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[NEW.day_of_week + 1];
    v_time_label := to_char(NEW.start_time, 'HH12:MI AM');

    SELECT COALESCE(full_name, email) INTO v_student_name
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
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
