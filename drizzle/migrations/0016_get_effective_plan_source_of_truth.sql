-- Canonical server-side plan resolver: active manual override > plan_tier > 'free'.
-- The 30-day trial is NOT a plan and never promotes a student to 'pro'.
CREATE OR REPLACE FUNCTION public.get_effective_plan(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p.manual_plan_override IS NOT NULL
             AND (p.override_expires_at IS NULL OR p.override_expires_at > now())
          THEN p.manual_plan_override
        ELSE COALESCE(p.plan_tier, 'free')
      END
      FROM public.profiles p
      WHERE p.id = _user_id
    ),
    'free'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_plan(uuid) TO authenticated, service_role;

-- Keep the existing subscriber gate derived from the same single source of truth.
CREATE OR REPLACE FUNCTION public.is_active_subscriber(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_effective_plan(_user_id) IN ('scratch', 'pro', 'apex');
$$;