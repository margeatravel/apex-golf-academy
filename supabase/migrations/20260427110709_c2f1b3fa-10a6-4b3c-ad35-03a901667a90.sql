-- Allow coaches/admins to override the hardcoded Pro Zone category labels.
-- Internal `key` values stay stable so existing pro_zone_media.category rows keep working.
CREATE TABLE public.pro_zone_category_labels (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.pro_zone_category_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read category labels"
  ON public.pro_zone_category_labels
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins or pro_zone staff can manage category labels"
  ON public.pro_zone_category_labels
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text));

CREATE TRIGGER update_pro_zone_category_labels_updated_at
  BEFORE UPDATE ON public.pro_zone_category_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();