-- Add is_sc_student column to identify Santiago Castilla students
-- These students get free access without requiring a Stripe subscription

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_sc_student BOOLEAN NOT NULL DEFAULT false;