
CREATE POLICY "Users can upload swing videos to their own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'swing-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read their own swing videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'swing-videos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'staff'::app_role)
    )
  );

CREATE POLICY "Users can delete their own swing videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'swing-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
