
CREATE POLICY "Coaches can view settings"
ON public.academy_settings FOR SELECT
USING (public.is_coach(auth.uid()));

CREATE POLICY "Coaches can insert settings"
ON public.academy_settings FOR INSERT
WITH CHECK (public.is_coach(auth.uid()));

CREATE POLICY "Coaches can update settings"
ON public.academy_settings FOR UPDATE
USING (public.is_coach(auth.uid()));
