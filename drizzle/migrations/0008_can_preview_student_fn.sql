-- Server-side authorization for the admin "View as student" read-only preview.
CREATE OR REPLACE FUNCTION public.can_preview_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        public.has_role(auth.uid(), 'coach')
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = _student_id
            AND p.assigned_coach_id = auth.uid()
        )
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.can_preview_student(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_preview_student(uuid) FROM anon;
