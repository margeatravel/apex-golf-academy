ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lessons_reminder_date ON public.lessons(lesson_date) WHERE reminder_sent_at IS NULL;