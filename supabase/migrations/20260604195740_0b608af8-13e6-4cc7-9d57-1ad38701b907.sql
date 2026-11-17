
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['class_packages','lessons','package_payments','stripe_payments','subscriptions']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
