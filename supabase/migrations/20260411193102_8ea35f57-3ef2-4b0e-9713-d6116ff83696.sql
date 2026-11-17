
CREATE TABLE public.billing_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text DEFAULT '#9ca3af',
  icon text DEFAULT 'Star',
  price_amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'mxn',
  billing_interval text NOT NULL DEFAULT 'one_time',
  plan_type text NOT NULL DEFAULT 'subscription',
  stripe_product_id text,
  stripe_price_id text,
  sync_status text NOT NULL DEFAULT 'draft',
  sync_error text,
  last_synced_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  access_rule text,
  limits text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view billing plans"
ON public.billing_plans FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert billing plans"
ON public.billing_plans FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update billing plans"
ON public.billing_plans FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete billing plans"
ON public.billing_plans FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Students can view active plans (for plan selection page)
CREATE POLICY "Students can view active billing plans"
ON public.billing_plans FOR SELECT TO authenticated
USING (is_active = true);

-- Auto-update timestamp
CREATE TRIGGER update_billing_plans_updated_at
BEFORE UPDATE ON public.billing_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing plans
INSERT INTO public.billing_plans (name, description, features, color, icon, price_amount, currency, billing_interval, plan_type, stripe_product_id, stripe_price_id, sync_status, is_active, access_rule, limits, sort_order) VALUES
('Free', 'Default plan for all new students', '["View lesson history", "Access assigned drills", "Basic profile"]'::jsonb, '#9ca3af', 'Star', 0, 'mxn', 'one_time', 'internal', NULL, NULL, 'synced', true, 'Default for all new students', 'No video analysis, no priority booking, no SC Points', 0),
('SC Students (Included)', 'Full platform access without Stripe subscription', '["Everything in Free", "Full platform access without Stripe subscription", "SC Points rewards", "Video uploads", "Lesson packages"]'::jsonb, '#4a7c59', 'Star', 0, 'mxn', 'one_time', 'internal', NULL, NULL, 'synced', true, 'Granted by coach via is_sc_student flag', 'Same features as Advance, no Stripe billing', 1),
('Advance', 'Standard subscription plan', '["Everything in Free", "Video analysis requests", "SC Points rewards system", "Lesson packages & class tracking", "Video uploads & storage"]'::jsonb, '#60a5fa', 'Zap', 30000, 'mxn', 'month', 'subscription', NULL, NULL, 'draft', true, 'Stripe subscription or manual coach override', 'Standard support, standard video storage', 2),
('Pro', 'Premium subscription plan', '["Everything in Advance", "Priority booking", "Unlimited video analysis", "Premium support", "Advanced performance stats", "+20 extra video uploads vs Advance"]'::jsonb, '#f0c040', 'Crown', 40000, 'mxn', 'month', 'subscription', NULL, NULL, 'draft', true, 'Stripe subscription (+100 MXN vs Advance) or manual coach override', 'Full access — no limits', 3),
('Individual Lesson', '1 individual golf lesson', '["Single lesson session"]'::jsonb, '#9ca3af', 'Star', 165000, 'mxn', 'one_time', 'one_time', 'prod_UJN1D9VJhsuVwL', 'price_1TKkH3Rw8gEMe8Y7UDdvRlDv', 'synced', true, 'One-time purchase', 'Single session', 10),
('10 Lessons Package', '10 golf lessons package', '["10 lesson sessions", "Save vs individual"]'::jsonb, '#9ca3af', 'Star', 1485000, 'mxn', 'one_time', 'one_time', 'prod_UJNJWnDAxpCqbg', 'price_1TKkYkRw8gEMe8Y7CxohteUh', 'synced', true, 'One-time purchase', 'Package of 10', 11),
('20 Lessons Package', '20 golf lessons package', '["20 lesson sessions", "Better savings"]'::jsonb, '#9ca3af', 'Star', 2650000, 'mxn', 'one_time', 'one_time', 'prod_UJNJo7j1w1084G', 'price_1TKkZBRw8gEMe8Y7ILw4uq23', 'synced', true, 'One-time purchase', 'Package of 20', 12),
('30 Lessons Package', '30 golf lessons package', '["30 lesson sessions", "Best value"]'::jsonb, '#9ca3af', 'Star', 3465000, 'mxn', 'one_time', 'one_time', 'prod_UJNKRN46vmFlYQ', 'price_1TKka4Rw8gEMe8Y734Dn03uo', 'synced', true, 'One-time purchase', 'Package of 30', 13),
('Video Analysis', 'Professional swing analysis', '["Remote swing analysis", "1 business day delivery"]'::jsonb, '#9ca3af', 'Star', 55000, 'mxn', 'one_time', 'one_time', 'prod_UJNwaRKa98W5gB', 'price_1TKlAhRw8gEMe8Y791V28Dm4', 'synced', true, 'One-time purchase', 'Single analysis', 14);
