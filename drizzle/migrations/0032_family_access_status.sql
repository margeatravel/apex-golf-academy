CREATE OR REPLACE FUNCTION public.normalize_plan_key(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(_name, '')))
    WHEN '' THEN NULL
    WHEN 'free' THEN 'member'
    WHEN 'gratis' THEN 'member'
    WHEN 'member' THEN 'member'
    WHEN 'familiar' THEN 'family'
    WHEN 'family' THEN 'family'
    WHEN 'apex level' THEN 'apex'
    WHEN 'tour level' THEN 'apex'
    WHEN 'tour' THEN 'apex'
    ELSE lower(btrim(_name))
  END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_plan_key(text) TO authenticated, anon, service_role;

-- Read-only helper: how many family links the caller has, and whether any of
-- those relatives is on a paid plan (or an active trial). Needed because a
-- student cannot read another account's plan through profiles RLS.
CREATE OR REPLACE FUNCTION public.family_access_status()
RETURNS TABLE(linked_count integer, has_paid_relative boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rel AS (
    SELECT DISTINCT other FROM (
      SELECT child_user_id AS other FROM public.family_links WHERE parent_user_id = auth.uid()
      UNION
      SELECT parent_user_id AS other FROM public.family_links WHERE child_user_id = auth.uid()
    ) s
    WHERE other IS NOT NULL AND other <> auth.uid()
  ),
  paid AS (
    SELECT DISTINCT public.normalize_plan_key(COALESCE(NULLIF(btrim(bp.tier_key), ''), bp.name)) AS k
    FROM public.billing_plans bp
    WHERE COALESCE(bp.is_active, true)
      AND COALESCE(bp.price_amount, 0) > 0
      AND bp.plan_type IN ('subscription', 'internal')
  )
  SELECT
    (SELECT count(*) FROM rel)::integer,
    COALESCE((
      SELECT bool_or(
        (p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now())
        OR public.normalize_plan_key(public.get_effective_plan(rel.other)) IN (SELECT k FROM paid WHERE k IS NOT NULL)
      )
      FROM rel
      LEFT JOIN public.profiles p ON p.id = rel.other
    ), false);
$$;

GRANT EXECUTE ON FUNCTION public.family_access_status() TO authenticated, service_role;