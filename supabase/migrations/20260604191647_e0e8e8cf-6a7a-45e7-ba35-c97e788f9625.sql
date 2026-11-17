
CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service role (edge functions using SUPABASE_SERVICE_ROLE_KEY)
  IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

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
$function$;
