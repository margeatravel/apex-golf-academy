
-- Add payment tracking columns to class_packages
ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_name TEXT;

-- Update process_lesson_completion to prefer oldest active package
CREATE OR REPLACE FUNCTION public.process_lesson_completion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Upsert student_points: add 10 points, increment total_lessons_ever
  INSERT INTO public.student_points (user_id, total_points, total_lessons_ever)
  VALUES (p_user_id, 10, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 10,
    total_lessons_ever = student_points.total_lessons_ever + 1,
    reward_available = CASE WHEN student_points.total_points + 10 >= 100 THEN true ELSE student_points.reward_available END,
    updated_at = now();

  -- Decrement from the OLDEST active package with remaining lessons
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
END;
$$;
