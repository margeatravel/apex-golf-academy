ALTER TABLE public.golf_rounds ADD COLUMN IF NOT EXISTS tournament_position integer;
COMMENT ON COLUMN public.golf_rounds.penalties IS 'DEPRECATED: merged into lost_balls (lost balls / penalties)';