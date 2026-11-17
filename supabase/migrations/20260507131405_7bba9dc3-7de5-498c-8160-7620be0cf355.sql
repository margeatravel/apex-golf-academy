ALTER TABLE public.class_packages
  ADD COLUMN duplicate_status text DEFAULT NULL,
  ADD COLUMN duplicate_reviewed_at timestamp with time zone DEFAULT NULL;