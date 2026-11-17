-- Add columns to store invitee info for unregistered students
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS invitee_name text,
  ADD COLUMN IF NOT EXISTS invitee_email text;

-- Make student_id nullable to allow lessons without registered students
ALTER TABLE public.lessons 
  ALTER COLUMN student_id DROP NOT NULL;