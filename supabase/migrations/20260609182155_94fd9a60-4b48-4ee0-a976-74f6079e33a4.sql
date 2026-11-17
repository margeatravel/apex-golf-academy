
-- 1) Restrict student UPDATEs on lessons to only the student_notes column
CREATE OR REPLACE FUNCTION public.enforce_student_lesson_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Allow service role, admins, and staff to update any column
  IF caller IS NULL
     OR has_role(caller, 'admin'::app_role)
     OR has_role(caller, 'staff'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For the student themselves: only allow changes to student_notes (and updated_at).
  IF (to_jsonb(NEW) - 'student_notes' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'student_notes' - 'updated_at') THEN
    RAISE EXCEPTION 'Students can only modify their own student_notes on a lesson';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_student_lesson_update_scope_trg ON public.lessons;
CREATE TRIGGER enforce_student_lesson_update_scope_trg
BEFORE UPDATE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.enforce_student_lesson_update_scope();

-- Add WITH CHECK to the existing student UPDATE policy so they can't reassign student_id
DROP POLICY IF EXISTS "Students can update their notes" ON public.lessons;
CREATE POLICY "Students can update their notes"
ON public.lessons
FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

-- 2) Tighten swing-videos SELECT: stop granting blanket access to every staff user.
-- Allow: the owner, admins, the student's assigned coach, or staff with the 'lessons' permission.
DROP POLICY IF EXISTS "Users can read their own swing videos" ON storage.objects;
CREATE POLICY "Users can read their own swing videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'swing-videos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_staff_permission(auth.uid(), 'lessons')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.assigned_coach_id = auth.uid()
    )
  )
);
