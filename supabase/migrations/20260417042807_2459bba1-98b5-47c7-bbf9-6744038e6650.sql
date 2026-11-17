-- Add imported flag to lessons and class_packages
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS imported boolean NOT NULL DEFAULT false;

ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS imported boolean NOT NULL DEFAULT false;

-- Backfill: every record that exists right now is historical / from bulk import
UPDATE public.lessons SET imported = true WHERE imported = false;
UPDATE public.class_packages SET imported = true WHERE imported = false;

-- Helpful indexes for the receivables query
CREATE INDEX IF NOT EXISTS idx_lessons_imported ON public.lessons(imported);
CREATE INDEX IF NOT EXISTS idx_class_packages_imported ON public.class_packages(imported);