ALTER TABLE public.ai_coach_sessions
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS answer_text text;