ALTER TABLE public.recurring_lesson_slots
  ADD COLUMN IF NOT EXISTS pending_weekday smallint,
  ADD COLUMN IF NOT EXISTS pending_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS pending_effective_date date;

COMMENT ON COLUMN public.recurring_lesson_slots.pending_effective_date IS 'Local America/Cancun date from which pending_weekday/pending_start_time replace the base schedule.';