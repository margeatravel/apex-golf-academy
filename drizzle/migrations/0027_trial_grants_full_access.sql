CREATE OR REPLACE FUNCTION public.has_apex_ai_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT bp.apex_ai_enabled
      FROM public.billing_plans bp
      WHERE bp.plan_type IN ('subscription', 'internal')
        AND lower(btrim(bp.name)) = CASE public.get_effective_plan(_user_id)
              WHEN 'scratch' THEN 'scratch'
              WHEN 'pro' THEN 'pro'
              WHEN 'apex' THEN 'apex level'
              WHEN 'family' THEN 'familiar'
              ELSE 'gratis'
            END
      LIMIT 1
    ),
    false
  )
  -- Active free trial unlocks the whole portal.
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_pro_zone_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
      SELECT bp.pro_zone_enabled
      FROM public.billing_plans bp
      WHERE bp.tier_key = CASE public.get_effective_plan(_user_id)
              WHEN 'free' THEN 'member'
              ELSE public.get_effective_plan(_user_id)
            END
      LIMIT 1
    ), false)
    -- Active free trial unlocks the whole portal.
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now()
    )
    OR public.has_role(_user_id, 'admin'::app_role)
    OR public.has_staff_permission(_user_id, 'pro_zone');
$function$;