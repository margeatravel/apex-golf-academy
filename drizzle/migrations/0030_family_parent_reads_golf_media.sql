CREATE POLICY "Family parent reads child golf-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_family_parent_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);