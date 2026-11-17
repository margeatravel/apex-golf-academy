-- Adjust package deduction when lesson_type changes on a completed lesson.
-- Playing/Field lessons consume 2 slots; others consume 1. When a coach
-- edits the lesson type after completion, we need to apply the delta to
-- the linked package and update the stored "deducted" count.

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
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Transition INTO completed
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    -- Transition OUT of completed
    IF OLD.status = 'completed' AND (NEW.status IS DISTINCT FROM 'completed') AND OLD.student_id IS NOT NULL THEN
      PERFORM public.reverse_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    -- Already completed: handle lesson_type change → adjust package usage delta
    IF NEW.status = 'completed' AND OLD.status = 'completed'
       AND NEW.student_id IS NOT NULL
       AND NEW.lesson_type IS DISTINCT FROM OLD.lesson_type
    THEN
      v_old_deduct := CASE WHEN OLD.lesson_type IN ('Campo', 'Playing Lesson', 'Field Lesson') THEN 2 ELSE 1 END;
      v_new_deduct := CASE WHEN NEW.lesson_type IN ('Campo', 'Playing Lesson', 'Field Lesson') THEN 2 ELSE 1 END;

      -- Use what was actually recorded on the original completion if present
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

      -- Update the original completion transaction so future reversals refund correctly
      UPDATE public.point_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{deducted}', to_jsonb(v_new_deduct))
      WHERE reason = 'lesson_completed'
        AND (metadata->>'lesson_id')::uuid = NEW.id;

      -- Audit trail
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

-- Ensure the trigger exists (in case it was missing)
DROP TRIGGER IF EXISTS lessons_status_change_handler_trg ON public.lessons;
CREATE TRIGGER lessons_status_change_handler_trg
AFTER INSERT OR UPDATE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.lessons_status_change_handler();