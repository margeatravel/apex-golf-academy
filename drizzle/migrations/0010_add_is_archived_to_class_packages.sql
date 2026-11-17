ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_class_packages_archived
  ON public.class_packages (user_id, archived_at)
  WHERE is_archived = true;