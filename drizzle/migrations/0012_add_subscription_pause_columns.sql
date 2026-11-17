ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pause_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS pause_resumes_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pause_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS pause_resumes_at timestamptz;