
-- Shared courses table (deduped across students)
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  country text,
  par integer NOT NULL DEFAULT 72,
  tees jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_name_lower ON public.courses (lower(name));
CREATE UNIQUE INDEX idx_courses_external_id ON public.courses (external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update courses"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete courses"
  ON public.courses FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Junction table: students <-> courses
CREATE TABLE public.student_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX idx_student_courses_student ON public.student_courses (student_id);

ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage their own course links"
  ON public.student_courses FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage all student courses"
  ON public.student_courses FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
