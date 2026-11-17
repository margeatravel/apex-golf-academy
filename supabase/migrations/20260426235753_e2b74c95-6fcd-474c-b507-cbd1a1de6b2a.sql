-- Student Highlights table
CREATE TABLE public.student_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'video')),
  thumbnail_url text,
  title text,
  caption text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('trophy', 'scorecard', 'milestone', 'personal', 'other')),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_highlights_student ON public.student_highlights(student_id, created_at DESC);

ALTER TABLE public.student_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own highlights"
  ON public.student_highlights FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students insert own highlights"
  ON public.student_highlights FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students update own highlights"
  ON public.student_highlights FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students delete own highlights"
  ON public.student_highlights FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins manage all highlights"
  ON public.student_highlights FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_student_highlights_updated_at
  BEFORE UPDATE ON public.student_highlights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for highlights/{user_id}/... folder inside golf-media (public bucket)
CREATE POLICY "Students upload own highlight files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'highlights'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Students update own highlight files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'highlights'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Students delete own highlight files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'highlights'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );