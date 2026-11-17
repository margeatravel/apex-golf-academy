ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

UPDATE public.profiles
  SET onboarding_completed = true
  WHERE onboarding_completed = false
    AND (onboarding_seen_at IS NOT NULL OR onboarding_completed_at IS NOT NULL);