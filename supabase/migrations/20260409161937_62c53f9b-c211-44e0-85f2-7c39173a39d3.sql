
CREATE TABLE public.student_drills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  coach_id UUID NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Drill',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all drills"
ON public.student_drills
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view their own drills"
ON public.student_drills
FOR SELECT
TO authenticated
USING (student_id = auth.uid());
