-- 1. Update handle_new_user trigger: staff invites get 'student' role + scopes (not admin)
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

  -- Always give the user the 'student' base role.
  -- Staff scopes are granted separately via staff_permissions and DO NOT
  -- imply full admin access. Only true coaches/owners have the 'admin' role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_invite.id IS NOT NULL THEN
    -- Apply scopes from the invite (these enable specific admin sections only)
    IF v_invite.scopes IS NOT NULL THEN
      FOREACH v_scope IN ARRAY v_invite.scopes LOOP
        INSERT INTO public.staff_permissions (user_id, scope, granted_by)
        VALUES (NEW.id, v_scope, v_invite.invited_by)
        ON CONFLICT (user_id, scope) DO NOTHING;
      END LOOP;
    END IF;

    -- Clean up the redeemed invite
    DELETE FROM public.pending_staff_invites WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Strip incorrect admin role from existing staff who have scopes
-- Anyone with at least one entry in staff_permissions but who is NOT the original owner
-- should be a student + scopes, NOT a full admin.
DELETE FROM public.user_roles ur
WHERE ur.role = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id = ur.user_id
  )
  AND NOT EXISTS (
    -- Keep admin role for the original owner email
    SELECT 1 FROM public.profiles p
    WHERE p.id = ur.user_id
      AND lower(p.email) = 'castilla.santi@gmail.com'
  );

-- 3. Ensure those users still have a 'student' base role so the app doesn't break
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT sp.user_id, 'student'::app_role
FROM public.staff_permissions sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = sp.user_id AND ur.role = 'student'
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur2
  WHERE ur2.user_id = sp.user_id AND ur2.role = 'admin'
);