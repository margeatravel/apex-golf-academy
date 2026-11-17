ALTER TABLE public.recurring_lesson_slots
  ADD COLUMN IF NOT EXISTS pending_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS pending_lesson_type text,
  ADD COLUMN IF NOT EXISTS pending_package_id uuid,
  ADD COLUMN IF NOT EXISTS pending_no_package_intentional boolean;