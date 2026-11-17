
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

CREATE POLICY "Users can upload to own folder in golf-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Staff can upload anywhere in golf-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'golf-media'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  )
);

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'staff'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.stripe_customer_id      IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.subscription_status   IS DISTINCT FROM OLD.subscription_status
     OR NEW.plan_tier             IS DISTINCT FROM OLD.plan_tier
     OR NEW.manual_plan_override  IS DISTINCT FROM OLD.manual_plan_override
     OR NEW.override_expires_at   IS DISTINCT FROM OLD.override_expires_at
     OR NEW.is_sc_student         IS DISTINCT FROM OLD.is_sc_student
     OR NEW.trial_ends_at         IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.clabe                 IS DISTINCT FROM OLD.clabe
     OR NEW.assigned_coach_id     IS DISTINCT FROM OLD.assigned_coach_id
  THEN
    RAISE EXCEPTION 'Permission denied: cannot modify protected profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_sensitive_profile_updates ON public.profiles;
CREATE TRIGGER trg_prevent_sensitive_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_sensitive_profile_updates();
