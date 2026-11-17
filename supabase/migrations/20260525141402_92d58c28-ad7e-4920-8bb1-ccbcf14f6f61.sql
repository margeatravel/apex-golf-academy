-- Add ar_status to class_packages
ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS ar_status text NOT NULL DEFAULT 'active'
  CHECK (ar_status IN ('draft','active'));

-- Add ar_status to lessons
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS ar_status text NOT NULL DEFAULT 'active'
  CHECK (ar_status IN ('draft','active'));

CREATE INDEX IF NOT EXISTS idx_class_packages_ar_status_draft
  ON public.class_packages (ar_status) WHERE ar_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_lessons_ar_status_draft
  ON public.lessons (ar_status) WHERE ar_status = 'draft';

-- Update lessons_status_change_handler to skip drafts
CREATE OR REPLACE FUNCTION public.lessons_status_change_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_deduct integer;
  v_new_deduct integer;
  v_delta integer;
  v_pkg_id uuid;
  v_recorded_deduct integer;
BEGIN
  -- Skip drafts entirely
  IF COALESCE(NEW.ar_status, 'active') = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If transitioning out of draft into active+completed, process completion
    IF COALESCE(OLD.ar_status,'active') = 'draft' AND NEW.ar_status = 'active' THEN
      IF NEW.status = 'completed' AND NEW.student_id IS NOT NULL THEN
        PERFORM public.process_lesson_completion_for_lesson(NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    IF OLD.status = 'completed' AND (NEW.status IS DISTINCT FROM 'completed') AND OLD.student_id IS NOT NULL THEN
      PERFORM public.reverse_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    IF NEW.status = 'completed' AND OLD.status = 'completed'
       AND NEW.student_id IS NOT NULL
       AND NEW.lesson_type IS DISTINCT FROM OLD.lesson_type
    THEN
      v_old_deduct := CASE WHEN OLD.lesson_type IN ('Campo', 'Playing Lesson', 'Field Lesson') THEN 2 ELSE 1 END;
      v_new_deduct := CASE WHEN NEW.lesson_type IN ('Campo', 'Playing Lesson', 'Field Lesson') THEN 2 ELSE 1 END;

      SELECT COALESCE((metadata->>'deducted')::int, v_old_deduct)
        INTO v_recorded_deduct
      FROM public.point_transactions
      WHERE reason = 'lesson_completed'
        AND (metadata->>'lesson_id')::uuid = NEW.id
      LIMIT 1;

      v_delta := v_new_deduct - v_recorded_deduct;
      v_pkg_id := COALESCE(NEW.package_id, OLD.package_id);

      IF v_delta <> 0 AND v_pkg_id IS NOT NULL THEN
        UPDATE public.class_packages
        SET classes_remaining = GREATEST(classes_remaining - v_delta, 0),
            classes_used = GREATEST(classes_used + v_delta, 0),
            is_active = CASE WHEN classes_remaining - v_delta <= 0 THEN false ELSE true END,
            updated_at = now()
        WHERE id = v_pkg_id;
      END IF;

      UPDATE public.point_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{deducted}', to_jsonb(v_new_deduct))
      WHERE reason = 'lesson_completed'
        AND (metadata->>'lesson_id')::uuid = NEW.id;

      IF v_delta <> 0 THEN
        INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
        VALUES (NEW.student_id, 0, 'lesson_type_changed', jsonb_build_object(
          'lesson_id', NEW.id,
          'old_type', OLD.lesson_type,
          'new_type', NEW.lesson_type,
          'package_delta', v_delta
        ));
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- Also patch notify_admin_lesson_booked to skip drafts
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
  IF COALESCE(NEW.ar_status,'active') = 'draft' THEN
    RETURN NEW;
  END IF;
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