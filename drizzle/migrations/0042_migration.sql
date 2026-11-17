DROP POLICY IF EXISTS "Coaches can update settings" ON public.academy_settings;

DROP POLICY IF EXISTS "Admins and coaches can read recurring package link log" ON public.recurring_slot_package_link_log;
CREATE POLICY "Admins and own coaches read recurring package link log" ON public.recurring_slot_package_link_log
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (is_coach(auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = student_id AND p.assigned_coach_id = auth.uid()))
);

DROP POLICY IF EXISTS "Coaches and admins manage plan content" ON public.membership_plan_content;
CREATE POLICY "Admins manage plan content" ON public.membership_plan_content
FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Coaches view user roles" ON public.user_roles;
CREATE POLICY "Coaches view roles of own students" ON public.user_roles
FOR SELECT TO authenticated USING (
  is_coach(auth.uid()) AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.assigned_coach_id = auth.uid()))
);