
-- 1) Pending staff invites table
CREATE TABLE IF NOT EXISTS public.pending_staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  scopes text[] NOT NULL DEFAULT '{}',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_staff_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pending invites"
ON public.pending_staff_invites
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pending_staff_invites_updated_at
BEFORE UPDATE ON public.pending_staff_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Replace handle_new_user to honor pending staff invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_scope text;
BEGIN
  -- Always create a profile row
  INSERT INTO public.profiles (id, email, full_name, plan_tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'free'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Look for a pending staff invite that matches this email
  SELECT * INTO v_invite
  FROM public.pending_staff_invites
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    -- Promote to admin (NOT student)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Apply scopes from the invite
    IF v_invite.scopes IS NOT NULL THEN
      FOREACH v_scope IN ARRAY v_invite.scopes LOOP
        INSERT INTO public.staff_permissions (user_id, scope, granted_by)
        VALUES (NEW.id, v_scope, v_invite.invited_by)
        ON CONFLICT (user_id, scope) DO NOTHING;
      END LOOP;
    END IF;

    -- Clean up the pending invite now that it has been redeemed
    DELETE FROM public.pending_staff_invites WHERE id = v_invite.id;
  ELSE
    -- Default behavior: brand-new user is a student
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
