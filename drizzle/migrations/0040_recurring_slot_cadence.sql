ALTER TABLE public.recurring_lesson_slots
  ADD COLUMN IF NOT EXISTS interval_weeks integer NOT NULL DEFAULT 1 CHECK (interval_weeks BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS interval_anchor date NULL,
  ADD COLUMN IF NOT EXISTS pending_interval_weeks integer NULL CHECK (pending_interval_weeks BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS pending_interval_anchor date NULL;