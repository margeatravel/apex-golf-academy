CREATE TABLE public.recurring_slot_package_link_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_slot_id uuid NOT NULL,
  student_id uuid,
  old_package_id uuid,
  new_package_id uuid,
  change_source text NOT NULL,
  change_reason text NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.recurring_slot_package_link_log TO authenticated;
GRANT ALL ON public.recurring_slot_package_link_log TO service_role;

ALTER TABLE public.recurring_slot_package_link_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches can read recurring package link log"
ON public.recurring_slot_package_link_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_coach(auth.uid())
);

CREATE INDEX recurring_slot_package_link_log_slot_changed_idx
ON public.recurring_slot_package_link_log (recurring_slot_id, changed_at DESC);

CREATE INDEX recurring_slot_package_link_log_changed_idx
ON public.recurring_slot_package_link_log (changed_at DESC);

CREATE OR REPLACE FUNCTION public.guard_and_log_recurring_package_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := COALESCE(auth.jwt() ->> 'role', '');
  v_reason text := NULLIF(current_setting('app.recurring_package_link_reason', true), '');
  v_source text := NULLIF(current_setting('app.recurring_package_link_source', true), '');
  v_is_interactive boolean := v_claim_role = 'authenticated' AND auth.uid() IS NOT NULL;
BEGIN
  IF NEW.package_id IS NOT DISTINCT FROM OLD.package_id THEN
    RETURN NEW;
  END IF;

  IF NOT v_is_interactive AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Automatic recurring package link changes are blocked. Use an explicit audited operation.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.recurring_slot_package_link_log (
    recurring_slot_id,
    student_id,
    old_package_id,
    new_package_id,
    change_source,
    change_reason,
    actor_id,
    actor_role
  ) VALUES (
    OLD.id,
    OLD.student_id,
    OLD.package_id,
    NEW.package_id,
    COALESCE(v_source, 'manual_portal'),
    COALESCE(v_reason, 'Manual package link change'),
    auth.uid(),
    COALESCE(NULLIF(v_claim_role, ''), current_user)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_and_log_recurring_package_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_and_log_recurring_package_link() TO authenticated, service_role;

CREATE TRIGGER guard_and_log_recurring_package_link
BEFORE UPDATE OF package_id ON public.recurring_lesson_slots
FOR EACH ROW
EXECUTE FUNCTION public.guard_and_log_recurring_package_link();