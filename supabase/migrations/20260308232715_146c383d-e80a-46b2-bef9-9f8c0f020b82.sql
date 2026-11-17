
-- Class packages table
CREATE TABLE public.class_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_size integer NOT NULL DEFAULT 10,
  classes_remaining integer NOT NULL DEFAULT 10,
  classes_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own packages" ON public.class_packages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all packages" ON public.class_packages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all packages" ON public.class_packages
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Student points table
CREATE TABLE public.student_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points integer NOT NULL DEFAULT 0,
  total_lessons_ever integer NOT NULL DEFAULT 0,
  reward_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own points" ON public.student_points
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own points" ON public.student_points
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can view all points" ON public.student_points
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all points" ON public.student_points
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own points" ON public.student_points
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Function to process lesson completion (points + package)
CREATE OR REPLACE FUNCTION public.process_lesson_completion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Decrement active package if exists
  UPDATE public.class_packages
  SET classes_remaining = classes_remaining - 1,
      classes_used = classes_used + 1,
      is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
      updated_at = now()
  WHERE user_id = p_user_id AND is_active = true
  AND classes_remaining > 0;
END;
$$;
