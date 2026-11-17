DROP TRIGGER IF EXISTS sync_package_payment_trigger ON public.class_packages;
DROP FUNCTION IF EXISTS public.sync_package_payment();

WITH dupe_packages AS (
  SELECT pp.package_id
  FROM public.package_payments pp
  JOIN public.class_packages cp ON cp.id = pp.package_id
  GROUP BY pp.package_id, cp.amount_paid
  HAVING SUM(pp.amount) > cp.amount_paid
),
ranked AS (
  SELECT pp.id, pp.package_id, pp.notes, pp.created_at,
         ROW_NUMBER() OVER (PARTITION BY pp.package_id ORDER BY pp.created_at ASC) AS rn
  FROM public.package_payments pp
  WHERE pp.package_id IN (SELECT package_id FROM dupe_packages)
)
DELETE FROM public.package_payments
WHERE id IN (
  SELECT id FROM ranked
  WHERE rn > 1
    AND (notes = 'Auto-synced from package record' OR notes IS NULL)
);