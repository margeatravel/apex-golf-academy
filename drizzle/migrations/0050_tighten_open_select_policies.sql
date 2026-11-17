CREATE OR REPLACE FUNCTION public.my_assigned_coach()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_coach_id FROM public.profiles WHERE id = auth.uid()
$$;

-- coach_availability_rules
DROP POLICY IF EXISTS "Authenticated can view availability rules" ON public.coach_availability_rules;
CREATE POLICY "Scoped users can view availability rules"
ON public.coach_availability_rules FOR SELECT TO authenticated
USING (
  coach_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_staff_permission(auth.uid(), 'lessons'::text)
  OR coach_id = public.staff_access_coach(auth.uid(), 'calendar'::text)
  OR coach_id = public.my_assigned_coach()
);

-- coach_availability_blocks (reasons can be private; no student access)
DROP POLICY IF EXISTS "Authenticated can view availability blocks" ON public.coach_availability_blocks;
CREATE POLICY "Scoped users can view availability blocks"
ON public.coach_availability_blocks FOR SELECT TO authenticated
USING (
  coach_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_staff_permission(auth.uid(), 'lessons'::text)
  OR coach_id = public.staff_access_coach(auth.uid(), 'calendar'::text)
);

-- coach_lesson_pricing: own coach, staff, admin, or the academy default (admin coach) pricing
DROP POLICY IF EXISTS "Authenticated can view coach pricing" ON public.coach_lesson_pricing;
CREATE POLICY "Scoped users can view coach pricing"
ON public.coach_lesson_pricing FOR SELECT TO authenticated
USING (
  coach_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR coach_id = public.staff_access_coach(auth.uid(), 'lesson_pricing'::text)
  OR coach_id = public.my_assigned_coach()
  OR public.has_role(coach_id, 'admin'::app_role)
);

-- booking_settings: only staff-side users (edge functions use service role)
DROP POLICY IF EXISTS "Authenticated can view booking settings" ON public.booking_settings;
CREATE POLICY "Coaches and staff can view booking settings"
ON public.booking_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_coach(auth.uid())
  OR public.has_role(auth.uid(), 'staff'::app_role)
);

-- notification_settings: admin/coach settings only
DROP POLICY IF EXISTS "Authenticated can read notification settings" ON public.notification_settings;
CREATE POLICY "Admins and coaches can read notification settings"
ON public.notification_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_coach(auth.uid())
);

-- membership_plan_content: only active content for regular users (admins keep full access via manage policy)
DROP POLICY IF EXISTS "Authenticated can read plan content" ON public.membership_plan_content;
CREATE POLICY "Authenticated can read active plan content"
ON public.membership_plan_content FOR SELECT TO authenticated
USING (is_active = true);

-- broadcast_notifications: Pro Zone broadcasts only to users with Pro Zone access
DROP POLICY IF EXISTS "Authenticated can read broadcasts" ON public.broadcast_notifications;
CREATE POLICY "Eligible users can read broadcasts"
ON public.broadcast_notifications FOR SELECT TO authenticated
USING (
  audience <> 'pro_zone'
  OR public.has_pro_zone_access(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_coach(auth.uid())
);