ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS lost_balls integer,
  ADD COLUMN IF NOT EXISTS up_downs_attempted integer,
  ADD COLUMN IF NOT EXISTS up_downs_converted integer,
  ADD COLUMN IF NOT EXISTS eagles integer,
  ADD COLUMN IF NOT EXISTS birdies integer,
  ADD COLUMN IF NOT EXISTS pars integer,
  ADD COLUMN IF NOT EXISTS bogeys integer,
  ADD COLUMN IF NOT EXISTS doubles_plus integer,
  ADD COLUMN IF NOT EXISTS par3_avg numeric(4,2),
  ADD COLUMN IF NOT EXISTS par4_avg numeric(4,2),
  ADD COLUMN IF NOT EXISTS par5_avg numeric(4,2);