ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS color_opacity real NOT NULL DEFAULT 0.45;

UPDATE public.billing_plans SET color_opacity = 0.30 WHERE tier_key = 'scratch';
UPDATE public.billing_plans SET color_opacity = 0.40 WHERE tier_key = 'pro';
UPDATE public.billing_plans SET color_opacity = 0.55 WHERE tier_key = 'apex';
UPDATE public.billing_plans SET color_opacity = 0.45 WHERE tier_key = 'family';