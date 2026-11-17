-- Lookup helpers so a student can pick someone to invite as family.
-- Students cannot SELECT other profiles directly (RLS), so these
-- SECURITY DEFINER functions expose only minimal, non-sensitive fields.

CREATE OR REPLACE FUNCTION public.search_family_candidates(_q text)
RETURNS TABLE (id uuid, full_name text, email text, photo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.photo_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
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
$$;

GRANT EXECUTE ON FUNCTION public.search_family_candidates(text) TO authenticated;

-- Minimal profile info for the people involved in the caller's own requests.
CREATE OR REPLACE FUNCTION public.family_request_people()
RETURNS TABLE (id uuid, full_name text, email text, photo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.photo_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id IN (
      SELECT r.to_user_id FROM public.family_link_requests r WHERE r.from_user_id = auth.uid()
      UNION
      SELECT r.from_user_id FROM public.family_link_requests r WHERE r.to_user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.family_request_people() TO authenticated;