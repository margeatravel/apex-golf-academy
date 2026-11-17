-- Add a "lesson_id" column to point_transactions metadata isn't structured;
-- We'll use a trigger that runs on lessons.status change.
-- Strategy:
--  * On INSERT with status='completed' OR UPDATE where status changes to 'completed'
--    from a non-completed state -> call process_lesson_completion (which adds points,
--    decrements oldest active package, awards monthly streak).
--    Also stamp point_transactions row with metadata.lesson_id for idempotency tracking.
--  * On UPDATE where status changes FROM 'completed' to something else -> reverse:
--    refund 10 points, restore 1 to the package previously consumed (best-effort:
--    increment the package linked to this lesson if any, else most recently consumed).
--
-- We add a small helper to ensure idempotency: if a point_transactions row with
-- reason='lesson_completed' and metadata.lesson_id = NEW.id already exists, skip.

-- 1) New idempotent completion function (per lesson)
CREATE OR REPLACE FUNCTION public.process_lesson_completion_for_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_package_id uuid;
  v_lessons_this_month integer;
  v_streak_already_awarded boolean;
  v_already_processed boolean;
  v_lesson_date date;
BEGIN
  SELECT student_id, package_id, lesson_date
    INTO v_user_id, v_package_id, v_lesson_date
  FROM public.lessons
  WHERE id = p_lesson_id;

  IF v_user_id IS NULL THEN
    RETURN; -- no student linked, nothing to do
  END IF;

  -- Idempotency: skip if we already processed this lesson
  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = v_user_id
      AND reason = 'lesson_completed'
      AND (metadata->>'lesson_id')::uuid = p_lesson_id
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN;
  END IF;

  -- Add 10 points and increment lifetime + total_lessons_ever
  INSERT INTO public.student_points (user_id, total_points, lifetime_points, total_lessons_ever)
  VALUES (v_user_id, 10, 10, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 10,
    lifetime_points = student_points.lifetime_points + 10,
    total_lessons_ever = student_points.total_lessons_ever + 1,
    reward_available = CASE WHEN student_points.total_points + 10 >= 50 THEN true ELSE student_points.reward_available END,
    updated_at = now();

  -- Log the lesson_completed transaction with lesson_id for idempotency
  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (v_user_id, 10, 'lesson_completed', jsonb_build_object('lesson_id', p_lesson_id));

  -- Decrement from the lesson's package if linked, else oldest active package
  IF v_package_id IS NOT NULL THEN
    UPDATE public.class_packages
    SET classes_remaining = GREATEST(classes_remaining - 1, 0),
        classes_used = classes_used + 1,
        is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
        updated_at = now()
    WHERE id = v_package_id;
  ELSE
    -- Find oldest active package and link the lesson to it as well
    UPDATE public.class_packages
    SET classes_remaining = GREATEST(classes_remaining - 1, 0),
        classes_used = classes_used + 1,
        is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
        updated_at = now()
    WHERE id = (
      SELECT id FROM public.class_packages
      WHERE user_id = v_user_id AND is_active = true AND classes_remaining > 0
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING id INTO v_package_id;

    IF v_package_id IS NOT NULL THEN
      UPDATE public.lessons SET package_id = v_package_id WHERE id = p_lesson_id;
    END IF;
  END IF;

  -- Monthly streak: 3+ completed lessons in calendar month
  SELECT COUNT(*) INTO v_lessons_this_month
  FROM public.lessons
  WHERE student_id = v_user_id
    AND status = 'completed'
    AND lesson_date >= date_trunc('month', COALESCE(v_lesson_date, CURRENT_DATE))
    AND lesson_date <  date_trunc('month', COALESCE(v_lesson_date, CURRENT_DATE)) + interval '1 month';

  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = v_user_id
      AND reason = 'monthly_streak'
      AND created_at >= date_trunc('month', COALESCE(v_lesson_date, CURRENT_DATE))
      AND created_at <  date_trunc('month', COALESCE(v_lesson_date, CURRENT_DATE)) + interval '1 month'
  ) INTO v_streak_already_awarded;

  IF v_lessons_this_month >= 3 AND NOT v_streak_already_awarded THEN
    UPDATE public.student_points
    SET total_points = total_points + 15,
        lifetime_points = lifetime_points + 15,
        updated_at = now()
    WHERE user_id = v_user_id;

    INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
    VALUES (v_user_id, 15, 'monthly_streak', jsonb_build_object('lessons_this_month', v_lessons_this_month));
  END IF;
END;
$$;

-- 2) Reversal function (when a completed lesson is un-completed)
CREATE OR REPLACE FUNCTION public.reverse_lesson_completion_for_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_package_id uuid;
  v_was_processed boolean;
BEGIN
  SELECT student_id, package_id INTO v_user_id, v_package_id
  FROM public.lessons WHERE id = p_lesson_id;

  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = v_user_id
      AND reason = 'lesson_completed'
      AND (metadata->>'lesson_id')::uuid = p_lesson_id
  ) INTO v_was_processed;

  IF NOT v_was_processed THEN RETURN; END IF;

  -- Refund points and decrement total_lessons_ever
  UPDATE public.student_points
  SET total_points = GREATEST(total_points - 10, 0),
      lifetime_points = GREATEST(lifetime_points - 10, 0),
      total_lessons_ever = GREATEST(total_lessons_ever - 1, 0),
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Log reversal transaction
  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (v_user_id, -10, 'lesson_completion_reversed', jsonb_build_object('lesson_id', p_lesson_id));

  -- Restore package count if package linked
  IF v_package_id IS NOT NULL THEN
    UPDATE public.class_packages
    SET classes_remaining = classes_remaining + 1,
        classes_used = GREATEST(classes_used - 1, 0),
        is_active = true,
        updated_at = now()
    WHERE id = v_package_id;
  END IF;
END;
$$;

-- 3) Trigger function on lessons table
CREATE OR REPLACE FUNCTION public.lessons_status_change_handler()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    END IF;
    -- Transition OUT of completed
    IF OLD.status = 'completed' AND (NEW.status IS DISTINCT FROM 'completed') AND OLD.student_id IS NOT NULL THEN
      PERFORM public.reverse_lesson_completion_for_lesson(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lessons_status_change ON public.lessons;
CREATE TRIGGER trg_lessons_status_change
AFTER INSERT OR UPDATE OF status ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.lessons_status_change_handler();

-- 4) Backfill: process any already-completed lessons that have NOT yet been recorded
--    in point_transactions (e.g., the Cummings April 19 lesson the user just marked).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT l.id
    FROM public.lessons l
    WHERE l.status = 'completed'
      AND l.student_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.point_transactions pt
        WHERE pt.user_id = l.student_id
          AND pt.reason = 'lesson_completed'
          AND (pt.metadata->>'lesson_id')::uuid = l.id
      )
    ORDER BY l.lesson_date ASC
  LOOP
    PERFORM public.process_lesson_completion_for_lesson(r.id);
  END LOOP;
END $$;