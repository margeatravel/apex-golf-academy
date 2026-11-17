CREATE TABLE public.ai_routing_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID,
  intent TEXT,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_routing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view routing log"
ON public.ai_routing_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ai_routing_log_student ON public.ai_routing_log(student_id);
CREATE INDEX idx_ai_routing_log_created ON public.ai_routing_log(created_at DESC);