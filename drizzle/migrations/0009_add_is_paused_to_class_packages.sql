ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_class_packages_active_not_paused
  ON public.class_packages (user_id, created_at)
  WHERE is_active = true AND is_paused = false;