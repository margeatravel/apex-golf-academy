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
  v_old_consumes boolean;
  v_new_consumes boolean;
BEGIN
  IF COALESCE(NEW.ar_status, 'active') = 'draft' THEN
    RETURN NEW;
  END IF;

  v_new_consumes := NEW.status IN ('completed', 'no_show');

  IF TG_OP = 'INSERT' THEN
    IF v_new_consumes AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_consumes := OLD.status IN ('completed', 'no_show');

    IF COALESCE(OLD.ar_status, 'active') = 'draft' AND NEW.ar_status = 'active' THEN
      IF v_new_consumes AND NEW.student_id IS NOT NULL THEN
        PERFORM public.process_lesson_completion_for_lesson(NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    IF v_new_consumes AND NOT v_old_consumes AND NEW.student_id IS NOT NULL THEN
      PERFORM public.process_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    IF v_old_consumes AND NOT v_new_consumes AND OLD.student_id IS NOT NULL THEN
      PERFORM public.reverse_lesson_completion_for_lesson(NEW.id);
      RETURN NEW;
    END IF;

    IF v_new_consumes AND v_old_consumes
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

      v_delta := v_new_deduct - COALESCE(v_recorded_deduct, v_old_deduct);
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