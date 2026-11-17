
-- =============================================
-- FIX 1: lesson-videos storage — scoped uploads
-- =============================================

-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload lesson videos" ON storage.objects;

-- Recreate: students can only upload into their own folder
CREATE POLICY "Students upload to own folder in lesson-videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lesson-videos'
  AND (
    -- Admin can upload anywhere
    public.has_role(auth.uid(), 'admin')
    OR
    -- Students can only upload to their own folder
    (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- =============================================
-- FIX 2: student_points — block student self-update
-- =============================================

-- Drop the permissive public UPDATE policy
DROP POLICY IF EXISTS "Users can update their own points" ON public.student_points;

-- Only admins (and the security-definer function process_lesson_completion) can update points
-- No new UPDATE policy for students — they can only read.
