ALTER TABLE public.recurring_lesson_slots
  ADD COLUMN IF NOT EXISTS pending_wipe boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recurring_lesson_slots.pending_wipe IS
  'When true, a scheduled move deletes future scheduled lessons before the effective date instead of keeping the old leg.';