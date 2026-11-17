ALTER TABLE public.recurring_lesson_slots
  ADD COLUMN IF NOT EXISTS starts_on date;

COMMENT ON COLUMN public.recurring_lesson_slots.starts_on IS 'Optional first date (America/Cancun local) the slot generates lessons from. NULL = generates from today as before.';