-- Additive onboarding quiz fields on profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_handicap TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_focus_areas TEXT[],
  ADD COLUMN IF NOT EXISTS onboarding_goal TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_frequency TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Existing students must never see the flow.
UPDATE public.profiles
   SET onboarding_seen_at = COALESCE(onboarding_seen_at, now())
 WHERE onboarding_seen_at IS NULL;