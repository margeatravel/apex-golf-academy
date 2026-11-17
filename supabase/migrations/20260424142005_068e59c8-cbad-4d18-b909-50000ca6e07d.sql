
-- 1. Staff permissions table
CREATE TABLE public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope)
);

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff permissions"
  ON public.staff_permissions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own permissions"
  ON public.staff_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_staff_permissions_user_id ON public.staff_permissions(user_id);
CREATE INDEX idx_staff_permissions_scope ON public.staff_permissions(scope);

-- 2. Security-definer permission check
CREATE OR REPLACE FUNCTION public.has_staff_permission(_user_id uuid, _scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE user_id = _user_id AND scope = _scope
  )
$$;

-- 3. Update pro_zone_media RLS to allow staff with pro_zone scope
DROP POLICY IF EXISTS "Admins can manage all media" ON public.pro_zone_media;

CREATE POLICY "Admins or pro_zone staff can manage media"
  ON public.pro_zone_media
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'));

-- 4. Update pro_zone_tips RLS the same way
DROP POLICY IF EXISTS "Admins can manage all tips" ON public.pro_zone_tips;

CREATE POLICY "Admins or pro_zone staff can manage tips"
  ON public.pro_zone_tips
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'));

-- 5. Storage policies for golf-media pro-zone folder
CREATE POLICY "Pro zone staff can upload to pro-zone folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'pro-zone'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'))
  );

CREATE POLICY "Pro zone staff can update pro-zone folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'pro-zone'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'))
  );

CREATE POLICY "Pro zone staff can delete from pro-zone folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'golf-media'
    AND (storage.foldername(name))[1] = 'pro-zone'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'pro_zone'))
  );
