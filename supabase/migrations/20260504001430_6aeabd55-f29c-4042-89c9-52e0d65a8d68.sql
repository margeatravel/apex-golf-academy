
-- Create student_reports table
CREATE TABLE public.student_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  content TEXT NOT NULL,
  shared_with_student BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_student_reports_student ON public.student_reports(student_id);

-- Enable RLS
ALTER TABLE public.student_reports ENABLE ROW LEVEL SECURITY;

-- Admin/staff full access
CREATE POLICY "Admins can manage all reports"
ON public.student_reports
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_staff_permission(auth.uid(), 'lessons')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_staff_permission(auth.uid(), 'lessons')
);

-- Students can view shared reports
CREATE POLICY "Students can view shared reports"
ON public.student_reports
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  AND shared_with_student = true
);

-- Timestamp trigger
CREATE TRIGGER update_student_reports_updated_at
BEFORE UPDATE ON public.student_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
