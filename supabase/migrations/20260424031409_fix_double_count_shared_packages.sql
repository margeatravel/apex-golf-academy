-- Fix double-counted shared (and non-shared) package payments.
--
-- Root cause: AddPackageModal inserts a class_packages row WITH amount_paid set,
-- AND also explicitly inserts a package_payments ledger row. The
-- sync_package_payment trigger ALSO inserts a ledger row on the same
-- INSERT — producing two payment_payments rows for the same payment, doubling
-- revenue (especially visible on shared packages reviewed in revenue reports).
--
-- Fix:
--   1. Drop the auto-sync trigger and its function. The modal flow already
--      writes the ledger row with the correct payment_method / notes.
--   2. Delete known duplicate ledger rows where multiple package_payments rows
--      sum to MORE than the package's amount_paid (true overcount).
--      We keep the earliest row and drop the later auto-synced duplicates.

-- 1. Remove the redundant trigger + function.
DROP TRIGGER IF EXISTS sync_package_payment_trigger ON public.class_packages;
DROP FUNCTION IF EXISTS public.sync_package_payment();

-- 2. Clean up duplicates: for any package whose package_payments sum to more
--    than amount_paid, delete extra "Auto-synced from package record" rows
--    while keeping at least one ledger entry.
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
