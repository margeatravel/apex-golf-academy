CREATE TABLE public.billing_plan_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  plan_name text,
  old_amount integer,
  new_amount integer,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_plan_price_history TO authenticated;
GRANT ALL ON public.billing_plan_price_history TO service_role;
ALTER TABLE public.billing_plan_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read price history" ON public.billing_plan_price_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_billing_plan_price_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.price_amount IS DISTINCT FROM OLD.price_amount THEN
    INSERT INTO public.billing_plan_price_history(plan_id, plan_name, old_amount, new_amount)
    VALUES (NEW.id, NEW.name, OLD.price_amount, NEW.price_amount);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_billing_plan_price_history AFTER UPDATE ON public.billing_plans
FOR EACH ROW EXECUTE FUNCTION public.log_billing_plan_price_change();

INSERT INTO public.billing_plan_price_history(plan_id, plan_name, old_amount, new_amount, changed_at)
SELECT id, name, v.o, v.n, '2026-10-26 17:39:59+00'::timestamptz
FROM public.billing_plans b JOIN (VALUES ('family',29900,5900),('scratch',59900,9900),('pro',99900,29900)) v(t,o,n) ON b.tier_key = v.t;