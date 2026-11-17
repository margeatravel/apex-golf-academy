-- Replace public read on lesson-videos bucket with scoped, authenticated policies.
DROP POLICY IF EXISTS "Public read access for lesson-videos" ON storage.objects;

CREATE POLICY "Owners read own lesson-videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins read all lesson-videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Lessons staff read all lesson-videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND public.has_staff_permission(auth.uid(), 'lessons'::text)
);

CREATE POLICY "Assigned coach reads student lesson-videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.assigned_coach_id = auth.uid()
  )
);

CREATE POLICY "Family parent reads child lesson-videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND public.is_family_parent_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);