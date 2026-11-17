-- Create stripe_payments table for reliable payment tracking
CREATE TABLE public.stripe_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_email TEXT,
  student_name TEXT,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  stripe_customer_id TEXT,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  product_name TEXT,
  purchase_type TEXT NOT NULL DEFAULT 'unknown',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'mxn',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  student_matched BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'stripe',
  reporting_category TEXT NOT NULL DEFAULT 'uncategorized',
  refund_status TEXT DEFAULT 'none',
  refund_amount NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admins can manage all stripe payments"
ON public.stripe_payments FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Student can view own payments
CREATE POLICY "Students can view their own stripe payments"
ON public.stripe_payments FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- Index for lookups
CREATE INDEX idx_stripe_payments_student ON public.stripe_payments(student_id);
CREATE INDEX idx_stripe_payments_intent ON public.stripe_payments(stripe_payment_intent_id);
CREATE INDEX idx_stripe_payments_session ON public.stripe_payments(stripe_checkout_session_id);
CREATE INDEX idx_stripe_payments_status ON public.stripe_payments(status);
CREATE INDEX idx_stripe_payments_paid_at ON public.stripe_payments(paid_at);

-- Trigger for updated_at
CREATE TRIGGER update_stripe_payments_updated_at
BEFORE UPDATE ON public.stripe_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();