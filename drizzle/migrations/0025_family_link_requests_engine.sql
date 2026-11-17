-- 1. relationship on family_links (nullable, existing rows untouched)
ALTER TABLE public.family_links
  ADD COLUMN IF NOT EXISTS relationship text NULL;

ALTER TABLE public.family_links
  DROP CONSTRAINT IF EXISTS family_links_relationship_check;
ALTER TABLE public.family_links
  ADD CONSTRAINT family_links_relationship_check
  CHECK (relationship IS NULL OR relationship IN ('papa','mama','hijo','pareja'));

-- 2. family_link_requests
CREATE TABLE IF NOT EXISTS public.family_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('papa','mama','hijo','pareja')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  CONSTRAINT family_link_requests_no_self CHECK (from_user_id <> to_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS family_link_requests_pending_uniq
  ON public.family_link_requests (from_user_id, to_user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS family_link_requests_to_idx ON public.family_link_requests (to_user_id);
CREATE INDEX IF NOT EXISTS family_link_requests_from_idx ON public.family_link_requests (from_user_id);

GRANT SELECT, INSERT, UPDATE ON public.family_link_requests TO authenticated;
GRANT ALL ON public.family_link_requests TO service_role;

ALTER TABLE public.family_link_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flr_select_own" ON public.family_link_requests;
CREATE POLICY "flr_select_own" ON public.family_link_requests
  FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "flr_admin_all" ON public.family_link_requests;
CREATE POLICY "flr_admin_all" ON public.family_link_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "flr_insert_self" ON public.family_link_requests;
CREATE POLICY "flr_insert_self" ON public.family_link_requests
  FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid() AND status = 'pending');

-- Recipient may respond, sender may cancel. Status transitions enforced by trigger.
DROP POLICY IF EXISTS "flr_update_parties" ON public.family_link_requests;
CREATE POLICY "flr_update_parties" ON public.family_link_requests
  FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_family_link_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.from_user_id <> OLD.from_user_id
     OR NEW.to_user_id <> OLD.to_user_id
     OR NEW.relationship <> OLD.relationship THEN
    RAISE EXCEPTION 'Cannot modify request fields';
  END IF;
  IF OLD.status <> 'pending' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Request already resolved';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF auth.uid() = OLD.to_user_id AND NEW.status IN ('accepted','rejected') THEN
      NULL;
    ELSIF auth.uid() = OLD.from_user_id AND NEW.status = 'cancelled' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Not allowed to set this status';
    END IF;
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_family_link_request_update ON public.family_link_requests;
CREATE TRIGGER trg_enforce_family_link_request_update
  BEFORE UPDATE ON public.family_link_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_family_link_request_update();