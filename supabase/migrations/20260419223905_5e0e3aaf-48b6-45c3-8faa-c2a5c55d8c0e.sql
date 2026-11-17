CREATE OR REPLACE FUNCTION public.process_lesson_completion_for_lesson(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = v_user_id
      AND reason = 'lesson_completed'
      AND (metadata->>'lesson_id')::uuid = p_lesson_id
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN;
  END IF;

  INSERT INTO public.student_points (user_id, total_points, lifetime_points, total_lessons_ever)
  VALUES (v_user_id, 10, 10, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 10,
    lifetime_points = student_points.lifetime_points + 10,
    total_lessons_ever = student_points.total_lessons_ever + 1,
    reward_available = CASE WHEN student_points.total_points + 10 >= 50 THEN true ELSE student_points.reward_available END,
    updated_at = now();

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (v_user_id, 10, 'lesson_completed', jsonb_build_object('lesson_id', p_lesson_id));

  IF v_package_id IS NOT NULL THEN
    UPDATE public.class_packages
    SET classes_remaining = GREATEST(classes_remaining - 1, 0),
        classes_used = classes_used + 1,
        is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
        updated_at = now()
    WHERE id = v_package_id;
  ELSE
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

  -- Monthly streak: now requires 4+ completed lessons in calendar month
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

  IF v_lessons_this_month >= 4 AND NOT v_streak_already_awarded THEN
    UPDATE public.student_points
    SET total_points = total_points + 15,
        lifetime_points = lifetime_points + 15,
        updated_at = now()
    WHERE user_id = v_user_id;

    INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
    VALUES (v_user_id, 15, 'monthly_streak', jsonb_build_object(
      'lessons_this_month', v_lessons_this_month,
      'month_start', date_trunc('month', COALESCE(v_lesson_date, CURRENT_DATE))::date
    ));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_lesson_completion(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lessons_this_month integer;
  v_streak_already_awarded boolean;
BEGIN
  INSERT INTO public.student_points (user_id, total_points, lifetime_points, total_lessons_ever)
  VALUES (p_user_id, 10, 10, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 10,
    lifetime_points = student_points.lifetime_points + 10,
    total_lessons_ever = student_points.total_lessons_ever + 1,
    reward_available = CASE WHEN student_points.total_points + 10 >= 50 THEN true ELSE student_points.reward_available END,
    updated_at = now();

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (p_user_id, 10, 'lesson_completed', '{}'::jsonb);

  UPDATE public.class_packages
  SET classes_remaining = classes_remaining - 1,
      classes_used = classes_used + 1,
      is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.class_packages
    WHERE user_id = p_user_id AND is_active = true AND classes_remaining > 0
    ORDER BY created_at ASC
    LIMIT 1
  );

  SELECT COUNT(*) INTO v_lessons_this_month
  FROM public.lessons
  WHERE student_id = p_user_id
    AND status = 'completed'
    AND lesson_date >= date_trunc('month', CURRENT_DATE)
    AND lesson_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = p_user_id
      AND reason = 'monthly_streak'
      AND created_at >= date_trunc('month', CURRENT_DATE)
  ) INTO v_streak_already_awarded;

  IF v_lessons_this_month >= 4 AND NOT v_streak_already_awarded THEN
    UPDATE public.student_points
    SET total_points = total_points + 15,
        lifetime_points = lifetime_points + 15,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
    VALUES (p_user_id, 15, 'monthly_streak', jsonb_build_object(
      'lessons_this_month', v_lessons_this_month,
      'month_start', date_trunc('month', CURRENT_DATE)::date
    ));
  END IF;
END;
$function$;