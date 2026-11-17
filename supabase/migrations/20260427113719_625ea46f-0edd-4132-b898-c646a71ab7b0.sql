CREATE TABLE public.pro_zone_custom_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  emoji text NOT NULL DEFAULT '⛳',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_zone_custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active custom categories"
ON public.pro_zone_custom_categories
FOR SELECT
TO authenticated
USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text));

CREATE POLICY "Admins or pro_zone staff can insert custom categories"
ON public.pro_zone_custom_categories
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text));

CREATE POLICY "Admins or pro_zone staff can update custom categories"
ON public.pro_zone_custom_categories
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text));

CREATE POLICY "Admins or pro_zone staff can delete custom categories"
ON public.pro_zone_custom_categories
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'::text));

CREATE TRIGGER set_pro_zone_custom_categories_updated_at
BEFORE UPDATE ON public.pro_zone_custom_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();