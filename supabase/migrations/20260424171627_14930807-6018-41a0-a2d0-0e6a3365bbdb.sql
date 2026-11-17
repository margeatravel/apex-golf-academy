-- Update handle_new_user: assign 'staff' for invited staff, 'student' otherwise
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
    -- Staff invite: assign 'staff' role only (never 'student')
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Apply scopes from the invite
    IF v_invite.scopes IS NOT NULL THEN
      FOREACH v_scope IN ARRAY v_invite.scopes LOOP
        INSERT INTO public.staff_permissions (user_id, scope, granted_by)
        VALUES (NEW.id, v_scope, v_invite.invited_by)
        ON CONFLICT (user_id, scope) DO NOTHING;
      END LOOP;
    END IF;

    -- Clean up the redeemed invite
    DELETE FROM public.pending_staff_invites WHERE id = v_invite.id;
  ELSE
    -- Regular signup: assign 'student' role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: convert existing staff (users with permissions, currently 'student') to 'staff'
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT sp.user_id, 'staff'::app_role
FROM public.staff_permissions sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = sp.user_id AND ur.role = 'admin'::app_role
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove the 'student' role from any user who now has the 'staff' role (and isn't admin)
DELETE FROM public.user_roles
WHERE role = 'student'::app_role
  AND user_id IN (
    SELECT user_id FROM public.user_roles WHERE role = 'staff'::app_role
  )
  AND user_id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role
  );
