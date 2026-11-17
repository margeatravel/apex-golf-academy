ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS apex_ai_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.has_apex_ai_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_apex_ai_access(uuid) TO authenticated, service_role;