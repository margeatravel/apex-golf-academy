
-- Create the lesson-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-videos', 'lesson-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to lesson-videos
CREATE POLICY "Authenticated users can upload to lesson-videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lesson-videos');

-- Allow public read access to lesson-videos
CREATE POLICY "Public read access for lesson-videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'lesson-videos');

-- Allow users to delete their own uploads in lesson-videos
CREATE POLICY "Users can delete own lesson-videos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lesson-videos' AND (auth.uid()::text = (storage.foldername(name))[1]));
