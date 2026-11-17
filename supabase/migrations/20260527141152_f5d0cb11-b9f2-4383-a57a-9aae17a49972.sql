
-- 1) Restrict staff uploads in golf-media to safe shared folders only.
DROP POLICY IF EXISTS "Staff can upload anywhere in golf-media" ON storage.objects;

CREATE POLICY "Staff can upload to shared golf-media folders"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'golf-media'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'staff'::app_role)
      AND (storage.foldername(name))[1] IN ('pro-zone', 'staff', 'lesson-uploads')
    )
  )
);

-- 2) Actually attach the existing restrict_student_lesson_updates() guard
--    to the lessons table so students cannot overwrite coach-controlled
--    columns via UPDATE. The function already enforces the rule.
DROP TRIGGER IF EXISTS trg_restrict_student_lesson_updates ON public.lessons;

CREATE TRIGGER trg_restrict_student_lesson_updates
BEFORE UPDATE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.restrict_student_lesson_updates();
