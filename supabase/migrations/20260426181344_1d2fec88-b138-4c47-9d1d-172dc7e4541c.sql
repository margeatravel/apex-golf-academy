ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_memory text,
  ADD COLUMN IF NOT EXISTS ai_memory_updated_at timestamptz;