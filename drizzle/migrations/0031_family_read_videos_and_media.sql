CREATE OR REPLACE FUNCTION public.is_family_linked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_links fl
    WHERE (fl.parent_user_id = _a AND fl.child_user_id = _b)
       OR (fl.parent_user_id = _b AND fl.child_user_id = _a)
  )
$$;

CREATE POLICY "Family members can view linked videos"
ON public.videos
FOR SELECT
TO authenticated
USING (public.is_family_linked(auth.uid(), student_id));

CREATE POLICY "Family members can view linked media"
ON public.student_media
FOR SELECT
TO authenticated
USING (public.is_family_linked(auth.uid(), student_id));