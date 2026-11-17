CREATE TABLE public.parent_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  parent_email text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX idx_parent_access_grants_student ON public.parent_access_grants(student_id);
CREATE INDEX idx_parent_access_grants_email ON public.parent_access_grants(lower(parent_email));

ALTER TABLE public.parent_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all parent grants"
ON public.parent_access_grants FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view their own parent grants"
ON public.parent_access_grants FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Students insert their own parent grants"
ON public.parent_access_grants FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid() AND created_by = auth.uid());

CREATE POLICY "Students revoke their own parent grants"
ON public.parent_access_grants FOR UPDATE TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());