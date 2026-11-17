-- Add plan tier columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_tier text,
ADD COLUMN IF NOT EXISTS plan_selected_at timestamptz;

-- Add check constraint to limit plan_tier values
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_plan_tier_check CHECK (plan_tier IS NULL OR plan_tier IN ('free', 'advance', 'pro'));