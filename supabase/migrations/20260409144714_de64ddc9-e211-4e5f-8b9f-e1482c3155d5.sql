
CREATE TABLE public.student_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  coach_id UUID NOT NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  is_general BOOLEAN NOT NULL DEFAULT true,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'image',
  thumbnail_url TEXT,
  title TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all media"
ON public.student_media
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view their own media"
ON public.student_media
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE INDEX idx_student_media_student_id ON public.student_media(student_id);
CREATE INDEX idx_student_media_lesson_id ON public.student_media(lesson_id);
