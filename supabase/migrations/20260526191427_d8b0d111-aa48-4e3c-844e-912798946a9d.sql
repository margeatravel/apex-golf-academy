CREATE TABLE public.student_coach_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_coach_notes_student_id ON public.student_coach_notes(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_coach_notes TO authenticated;
GRANT ALL ON public.student_coach_notes TO service_role;

ALTER TABLE public.student_coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all student coach notes"
ON public.student_coach_notes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Lesson staff manage student coach notes"
ON public.student_coach_notes
FOR ALL
TO authenticated
USING (has_staff_permission(auth.uid(), 'lessons'::text))
WITH CHECK (has_staff_permission(auth.uid(), 'lessons'::text));

CREATE POLICY "Students view their own coach notes"
ON public.student_coach_notes
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Parents view child coach notes"
ON public.student_coach_notes
FOR SELECT
TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));

CREATE TRIGGER update_student_coach_notes_updated_at
BEFORE UPDATE ON public.student_coach_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();