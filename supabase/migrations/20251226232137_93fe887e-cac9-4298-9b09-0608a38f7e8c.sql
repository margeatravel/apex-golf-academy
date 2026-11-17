-- Add timestamptz columns for proper UTC storage
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS lesson_end_at timestamptz;

-- Backfill existing records by interpreting lesson_date + lesson_time as America/Cancun timezone
-- This constructs the timestamp correctly without day shifts
UPDATE public.lessons
SET 
  lesson_start_at = (lesson_date::text || ' ' || lesson_time::text)::timestamp AT TIME ZONE 'America/Cancun',
  lesson_end_at = ((lesson_date::text || ' ' || lesson_time::text)::timestamp + (duration_minutes || ' minutes')::interval) AT TIME ZONE 'America/Cancun'
WHERE lesson_start_at IS NULL AND lesson_date IS NOT NULL AND lesson_time IS NOT NULL;