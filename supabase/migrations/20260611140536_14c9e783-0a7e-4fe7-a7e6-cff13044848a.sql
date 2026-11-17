CREATE POLICY "Users can view own highlight files in golf-media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] = 'highlights'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);