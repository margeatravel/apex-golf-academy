CREATE OR REPLACE FUNCTION public.set_recurring_slot_package_link(
  _slot_id uuid,
  _package_id uuid,
  _source text,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF COALESCE(BTRIM(_source), '') = '' OR COALESCE(BTRIM(_reason), '') = '' THEN
    RAISE EXCEPTION 'A source and reason are required for recurring package link changes.'
      USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.is_coach(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to change recurring package links.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.recurring_package_link_source', BTRIM(_source), true);
  PERFORM set_config('app.recurring_package_link_reason', BTRIM(_reason), true);

  UPDATE public.recurring_lesson_slots
  SET package_id = _package_id
  WHERE id = _slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring slot not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_recurring_slot_package_link(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recurring_slot_package_link(uuid, uuid, text, text) TO authenticated, service_role;