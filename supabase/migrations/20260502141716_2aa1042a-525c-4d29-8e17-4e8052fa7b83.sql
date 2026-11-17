CREATE OR REPLACE FUNCTION public.get_assigned_coach_clabe()
RETURNS TABLE(clabe text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coach.clabe, coach.full_name
  FROM public.profiles AS student
  JOIN public.profiles AS coach
    ON coach.id = student.assigned_coach_id
  WHERE student.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_assigned_coach_clabe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assigned_coach_clabe() TO authenticated;