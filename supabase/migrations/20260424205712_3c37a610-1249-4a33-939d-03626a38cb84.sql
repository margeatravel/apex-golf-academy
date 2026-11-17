ALTER TABLE public.fixed_schedule_slots
ADD COLUMN IF NOT EXISTS lesson_type text NOT NULL DEFAULT 'Range';