ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_by uuid,
  ADD COLUMN IF NOT EXISTS birth_date date;

CREATE INDEX IF NOT EXISTS idx_profiles_managed_by ON public.profiles(managed_by);

CREATE OR REPLACE FUNCTION public.search_family_candidates(_q text)
 RETURNS TABLE(id uuid, full_name text, email text, photo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.email, p.photo_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND coalesce(p.is_managed, false) = false
    AND length(coalesce(_q, '')) >= 2
    AND (p.full_name ILIKE '%' || _q || '%' OR p.email ILIKE '%' || _q || '%')
    AND NOT EXISTS (
      SELECT 1 FROM public.family_links fl
      WHERE (fl.parent_user_id = auth.uid() AND fl.child_user_id = p.id)
         OR (fl.child_user_id = auth.uid() AND fl.parent_user_id = p.id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.family_link_requests r
      WHERE r.status = 'pending'
        AND ((r.from_user_id = auth.uid() AND r.to_user_id = p.id)
          OR (r.to_user_id = auth.uid() AND r.from_user_id = p.id))
    )
  ORDER BY p.full_name NULLS LAST
  LIMIT 20;
$function$;