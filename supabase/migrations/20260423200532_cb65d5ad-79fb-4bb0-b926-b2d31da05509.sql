-- =========================================
-- pro_zone_media: per-category media library
-- =========================================
CREATE TABLE public.pro_zone_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image','video')),
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pro_zone_media_category ON public.pro_zone_media(category, sort_order) WHERE is_active = true;

ALTER TABLE public.pro_zone_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active media"
ON public.pro_zone_media
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can manage all media"
ON public.pro_zone_media
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pro_zone_media_updated_at
BEFORE UPDATE ON public.pro_zone_media
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- subscription_history: tier change tracking + grace window
-- =========================================
CREATE TABLE public.subscription_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_tier TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  paid_through TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'stripe',
  stripe_subscription_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_history_user_paid_through ON public.subscription_history(user_id, paid_through DESC);
CREATE INDEX idx_sub_history_user_tier ON public.subscription_history(user_id, plan_tier);

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription history"
ON public.subscription_history
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage subscription history"
ON public.subscription_history
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_subscription_history_updated_at
BEFORE UPDATE ON public.subscription_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Storage policies for golf-media: pro-zone/* path
-- =========================================
CREATE POLICY "Public can read pro-zone media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'golf-media' AND (storage.foldername(name))[1] = 'pro-zone');

CREATE POLICY "Admins can upload pro-zone media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] = 'pro-zone'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update pro-zone media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] = 'pro-zone'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete pro-zone media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'golf-media'
  AND (storage.foldername(name))[1] = 'pro-zone'
  AND has_role(auth.uid(), 'admin'::app_role)
);