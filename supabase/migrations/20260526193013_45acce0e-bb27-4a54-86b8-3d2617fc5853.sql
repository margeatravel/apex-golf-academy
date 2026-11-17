ALTER TABLE public.student_coach_notes ADD COLUMN title TEXT;

-- Enable the existing updated_at trigger to cover the new column (already in place)
