ALTER TABLE public.family_links
  ADD COLUMN IF NOT EXISTS visibility jsonb NOT NULL DEFAULT
    '{"profile":true,"points":true,"packages":true,"lessons":true,"media":true,"plan":true}'::jsonb;