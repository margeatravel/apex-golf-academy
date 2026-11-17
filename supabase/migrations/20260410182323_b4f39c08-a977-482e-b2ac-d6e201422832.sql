
-- Add amount_paid to class_packages for partial payment tracking
ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;

-- Create package_payments table for payment history per package
CREATE TABLE public.package_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.class_packages(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'Cash',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.package_payments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all package payments
CREATE POLICY "Admins can manage all package payments"
  ON public.package_payments
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Students can view their own package payments (via join to class_packages)
CREATE POLICY "Students can view their own package payments"
  ON public.package_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_packages
      WHERE class_packages.id = package_payments.package_id
        AND class_packages.user_id = auth.uid()
    )
  );
