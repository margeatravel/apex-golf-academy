-- Allow shared package members to view the package record (needed to look up the
-- package owner's user_id for the lesson dropdown).
CREATE POLICY "Shared members can view their packages"
ON public.class_packages
FOR SELECT
TO authenticated
USING (public.is_package_member(id, auth.uid()));

-- Allow shared package members to view lessons owned by the package owner,
-- even when the lesson row itself has no package_id set.
CREATE POLICY "Shared members can view package-owner lessons"
ON public.lessons
FOR SELECT
TO authenticated
USING (
  student_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.class_packages cp
    WHERE cp.user_id = lessons.student_id
      AND public.is_package_member(cp.id, auth.uid())
  )
);