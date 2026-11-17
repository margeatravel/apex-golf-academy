
ALTER TABLE public.stripe_payments
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS classification_confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS is_golf_revenue boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
