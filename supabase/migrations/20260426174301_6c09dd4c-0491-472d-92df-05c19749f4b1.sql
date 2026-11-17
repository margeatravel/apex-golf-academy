CREATE TABLE public.ai_coach_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  coach_id UUID,
  input_type TEXT NOT NULL CHECK (input_type IN ('question','goal','score','video_note','practice_plan')),
  student_input TEXT NOT NULL,
  ai_response JSONB,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','needs_review','failed')),
  coach_reviewed_at TIMESTAMPTZ,
  coach_review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_coach_sessions_student ON public.ai_coach_sessions(student_id, created_at DESC);
CREATE INDEX idx_ai_coach_sessions_status ON public.ai_coach_sessions(status);

ALTER TABLE public.ai_coach_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own AI sessions"
ON public.ai_coach_sessions FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Students can create their own AI sessions"
ON public.ai_coach_sessions FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can view all AI sessions"
ON public.ai_coach_sessions FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage AI sessions"
ON public.ai_coach_sessions FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ai_coach_sessions_updated_at
BEFORE UPDATE ON public.ai_coach_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();