CREATE POLICY "Admins upload all golf-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'golf-media' AND has_role(auth.uid(), 'admin'::app_role));