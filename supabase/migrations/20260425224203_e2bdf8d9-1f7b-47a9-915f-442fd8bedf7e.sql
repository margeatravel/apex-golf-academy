-- Allow students to view lessons attached to packages they are shared members of.
-- Fixes the "Link to lesson" dropdown for shared package members (e.g. Andrade,
-- Benito, Obregón Hijos), where lessons live under the primary package owner.
CREATE POLICY "Students can view lessons for shared packages"
ON public.lessons
FOR SELECT
TO authenticated
USING (
  package_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.package_members pm
    WHERE pm.package_id = lessons.package_id
      AND pm.student_id = auth.uid()
  )
);