CREATE POLICY "Authenticated users can view settings"
ON public.academy_settings
FOR SELECT
TO authenticated
USING (true);