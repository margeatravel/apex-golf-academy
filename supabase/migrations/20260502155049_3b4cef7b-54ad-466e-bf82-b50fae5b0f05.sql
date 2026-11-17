
CREATE TABLE public.trial_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  action text NOT NULL,
  days_added integer,
  old_trial_ends_at timestamptz,
  new_trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage trial log"
  ON public.trial_change_log FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
