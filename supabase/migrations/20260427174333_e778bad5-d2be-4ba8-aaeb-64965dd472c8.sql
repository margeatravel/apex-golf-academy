ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz;

CREATE INDEX IF NOT EXISTS lessons_skipped_idx
  ON public.lessons (lesson_date)
  WHERE skipped = true;