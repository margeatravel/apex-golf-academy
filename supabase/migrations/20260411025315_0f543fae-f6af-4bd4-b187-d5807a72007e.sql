
CREATE TABLE public.dismissed_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id_a UUID NOT NULL,
  student_id_b UUID NOT NULL,
  decision TEXT NOT NULL DEFAULT 'review_later',
  decided_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_pair UNIQUE (student_id_a, student_id_b)
);

ALTER TABLE public.dismissed_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed duplicates"
  ON public.dismissed_duplicates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert dismissed duplicates"
  ON public.dismissed_duplicates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
