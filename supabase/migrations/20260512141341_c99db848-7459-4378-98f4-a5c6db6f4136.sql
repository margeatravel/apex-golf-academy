
-- 1. family_links table
CREATE TABLE public.family_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  child_user_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_links_no_self CHECK (parent_user_id <> child_user_id),
  CONSTRAINT family_links_unique UNIQUE (parent_user_id, child_user_id)
);

CREATE INDEX idx_family_links_parent ON public.family_links(parent_user_id);
CREATE INDEX idx_family_links_child ON public.family_links(child_user_id);

ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage family links"
ON public.family_links FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text));

CREATE POLICY "Parent can view own family links"
ON public.family_links FOR SELECT TO authenticated
USING (parent_user_id = auth.uid());

CREATE POLICY "Child can view own family links"
ON public.family_links FOR SELECT TO authenticated
USING (child_user_id = auth.uid());

CREATE TRIGGER family_links_updated_at
BEFORE UPDATE ON public.family_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper function
CREATE OR REPLACE FUNCTION public.is_family_parent_of(_parent uuid, _child uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_links
    WHERE parent_user_id = _parent AND child_user_id = _child
  )
$$;

-- 3. Read-only parent SELECT policies on child-data tables
CREATE POLICY "Parent can view child profile"
ON public.profiles FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), id));

CREATE POLICY "Parent can view child lessons"
ON public.lessons FOR SELECT TO authenticated
USING (student_id IS NOT NULL AND is_family_parent_of(auth.uid(), student_id));

CREATE POLICY "Parent can view child packages"
ON public.class_packages FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), user_id));

CREATE POLICY "Parent can view child package payments"
ON public.package_payments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.class_packages cp
  WHERE cp.id = package_payments.package_id
    AND is_family_parent_of(auth.uid(), cp.user_id)
));

CREATE POLICY "Parent can view child payments"
ON public.payments FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));

CREATE POLICY "Parent can view child points"
ON public.student_points FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), user_id));

CREATE POLICY "Parent can view child point transactions"
ON public.point_transactions FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), user_id));

CREATE POLICY "Parent can view child training plans"
ON public.ai_training_plans FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));

CREATE POLICY "Parent can view child rounds"
ON public.golf_rounds FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));

CREATE POLICY "Parent can view child courses"
ON public.golf_courses FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));

CREATE POLICY "Parent can view child handicap history"
ON public.handicap_history FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), user_id));

CREATE POLICY "Parent can view child analysis requests"
ON public.analysis_requests FOR SELECT TO authenticated
USING (is_family_parent_of(auth.uid(), student_id));
