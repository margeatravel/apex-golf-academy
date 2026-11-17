
DROP POLICY "Authenticated users can insert courses" ON public.courses;

CREATE POLICY "Users with a profile can insert courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));
