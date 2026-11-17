-- Self-healing trigger: ensure every paid package has a matching ledger row
CREATE OR REPLACE FUNCTION public.sync_package_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid > 0 AND NOT EXISTS (
    SELECT 1 FROM public.package_payments WHERE package_id = NEW.id
  ) THEN
    INSERT INTO public.package_payments (package_id, amount, payment_date, payment_method, notes)
    VALUES (
      NEW.id,
      NEW.amount_paid,
      COALESCE(NEW.payment_date, NEW.created_at::date, CURRENT_DATE),
      'Cash',
      'Auto-synced from package record'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_package_payment_trigger ON public.class_packages;
CREATE TRIGGER sync_package_payment_trigger
AFTER INSERT OR UPDATE OF amount_paid, payment_status ON public.class_packages
FOR EACH ROW
EXECUTE FUNCTION public.sync_package_payment();

-- One-time backfill: insert missing ledger rows for paid packages
INSERT INTO public.package_payments (package_id, amount, payment_date, payment_method, notes)
SELECT
  cp.id,
  cp.amount_paid,
  COALESCE(cp.payment_date, cp.created_at::date, CURRENT_DATE),
  'Cash',
  'Backfilled from package record'
FROM public.class_packages cp
WHERE cp.amount_paid > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.package_payments pp WHERE pp.package_id = cp.id
  );