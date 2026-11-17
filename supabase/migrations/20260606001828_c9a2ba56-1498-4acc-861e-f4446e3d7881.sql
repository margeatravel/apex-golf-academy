
CREATE TABLE public.swing_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  notes TEXT,
  feedback JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX swing_analyses_user_created_idx ON public.swing_analyses (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.swing_analyses TO authenticated;
GRANT ALL ON public.swing_analyses TO service_role;

ALTER TABLE public.swing_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own swing analyses"
  ON public.swing_analyses FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "Users can insert their own swing analyses"
  ON public.swing_analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
