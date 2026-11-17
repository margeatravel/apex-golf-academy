
-- Shared packages: link multiple students to one class_packages row
CREATE TABLE public.package_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.class_packages(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, student_id)
);

CREATE INDEX idx_package_members_package_id ON public.package_members(package_id);
CREATE INDEX idx_package_members_student_id ON public.package_members(student_id);

ALTER TABLE public.package_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage package members"
  ON public.package_members
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view their own memberships"
  ON public.package_members
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Link lessons to packages so all members see them
ALTER TABLE public.lessons ADD COLUMN package_id uuid;
CREATE INDEX idx_lessons_package_id ON public.lessons(package_id);
