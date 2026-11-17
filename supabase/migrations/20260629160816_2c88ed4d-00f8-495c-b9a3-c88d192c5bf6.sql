-- Remove the SC Students Included feature entirely.
-- Drop the column and any dependent trigger logic that referenced it.

-- 1) Drop the column from profiles (CASCADE removes any dependent objects).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_sc_student;