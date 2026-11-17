-- Add category column to videos table
ALTER TABLE public.videos 
ADD COLUMN category TEXT CHECK (category IN ('lesson', 'analysis'));

-- Migrate existing videos: if has lesson_id -> 'lesson', otherwise -> 'analysis'
UPDATE public.videos 
SET category = CASE 
  WHEN lesson_id IS NOT NULL THEN 'lesson'
  ELSE 'analysis'
END
WHERE category IS NULL;