
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_tier_check
  CHECK (plan_tier IS NULL OR plan_tier = ANY (ARRAY['free'::text, 'member'::text, 'advance'::text, 'scratch'::text, 'pro'::text, 'elite'::text]));
