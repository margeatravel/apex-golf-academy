
CREATE TABLE public.coach_lesson_pricing (
  coach_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_lesson_pricing TO authenticated;
GRANT ALL ON public.coach_lesson_pricing TO service_role;

ALTER TABLE public.coach_lesson_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view coach pricing"
  ON public.coach_lesson_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Coach can insert own pricing"
  ON public.coach_lesson_pricing FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Coach can update own pricing"
  ON public.coach_lesson_pricing FOR UPDATE
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete coach pricing"
  ON public.coach_lesson_pricing FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed Santiago's row from the existing global lesson_pricing so nothing changes for him
INSERT INTO public.coach_lesson_pricing (coach_id, pricing, updated_by)
SELECT '13480fb4-e4d2-423c-b035-c65846b061fc'::uuid,
       COALESCE((SELECT value FROM public.academy_settings WHERE key='lesson_pricing'), '{}'::jsonb),
       '13480fb4-e4d2-423c-b035-c65846b061fc'::uuid
ON CONFLICT (coach_id) DO NOTHING;
