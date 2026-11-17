
-- 1. Fixed schedule slots: tighten SELECT to hide claimed slots' student_id
DROP POLICY IF EXISTS "Authenticated users can view all fixed schedule slots" ON public.fixed_schedule_slots;
CREATE POLICY "Authenticated users can view available or own fixed slots"
ON public.fixed_schedule_slots
FOR SELECT
TO authenticated
USING (
  (is_available = true AND student_id IS NULL)
  OR student_id = auth.uid()
);

-- 2. Storage: remove broad upload policy on lesson-videos
DROP POLICY IF EXISTS "Authenticated users can upload to lesson-videos" ON storage.objects;

-- 3. Payments: remove students' self-insert policy
DROP POLICY IF EXISTS "Students can insert their own payments" ON public.payments;

-- 4. Profiles: restrictive policy preventing students from modifying sensitive fields
DROP POLICY IF EXISTS "Prevent students from changing sensitive profile fields" ON public.profiles;
CREATE POLICY "Prevent students from changing sensitive profile fields"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    stripe_customer_id IS NOT DISTINCT FROM (SELECT p.stripe_customer_id FROM public.profiles p WHERE p.id = profiles.id)
    AND stripe_subscription_id IS NOT DISTINCT FROM (SELECT p.stripe_subscription_id FROM public.profiles p WHERE p.id = profiles.id)
    AND subscription_status IS NOT DISTINCT FROM (SELECT p.subscription_status FROM public.profiles p WHERE p.id = profiles.id)
    AND plan_tier IS NOT DISTINCT FROM (SELECT p.plan_tier FROM public.profiles p WHERE p.id = profiles.id)
    AND manual_plan_override IS NOT DISTINCT FROM (SELECT p.manual_plan_override FROM public.profiles p WHERE p.id = profiles.id)
    AND trial_ends_at IS NOT DISTINCT FROM (SELECT p.trial_ends_at FROM public.profiles p WHERE p.id = profiles.id)
    AND clabe IS NOT DISTINCT FROM (SELECT p.clabe FROM public.profiles p WHERE p.id = profiles.id)
    AND assigned_coach_id IS NOT DISTINCT FROM (SELECT p.assigned_coach_id FROM public.profiles p WHERE p.id = profiles.id)
  )
);
