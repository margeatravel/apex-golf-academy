
CREATE TABLE public.analysis_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC NOT NULL DEFAULT 550,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own analysis requests"
  ON public.analysis_requests FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can view all analysis requests"
  ON public.analysis_requests FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can create their own analysis requests"
  ON public.analysis_requests FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update their own analysis requests"
  ON public.analysis_requests FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can manage all analysis requests"
  ON public.analysis_requests FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_analysis_requests_updated_at
  BEFORE UPDATE ON public.analysis_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
