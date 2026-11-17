-- 1. Add trial_ends_at column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2. Backfill existing Free/Member users with a sensible trial window.
-- Paid plans, SC students, and manual overrides already have full access — leave them NULL.
UPDATE public.profiles p
SET trial_ends_at = GREATEST(
  COALESCE((
    SELECT u.created_at FROM auth.users u WHERE u.id = p.id
  ), now()) + INTERVAL '30 days',
  now() + INTERVAL '7 days'
)
WHERE trial_ends_at IS NULL
  AND COALESCE(p.is_sc_student, false) = false
  AND COALESCE(p.plan_tier, 'free') NOT IN ('scratch', 'pro', 'apex')
  AND (p.manual_plan_override IS NULL OR p.manual_plan_override NOT IN ('scratch', 'pro', 'apex'));

-- 3. Update handle_new_user() to start a 30-day trial for new student signups.
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
  -- Always create a profile row. New students automatically get a 30-day trial.
  INSERT INTO public.profiles (id, email, full_name, plan_tier, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'free',
    now() + INTERVAL '30 days'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Look for a pending staff invite that matches this email
  SELECT * INTO v_invite
  FROM public.pending_staff_invites
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    -- Staff invite: assign 'staff' role only (never 'student'). Clear the trial — staff don't need it.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.profiles SET trial_ends_at = NULL WHERE id = NEW.id;

    IF v_invite.scopes IS NOT NULL THEN
      FOREACH v_scope IN ARRAY v_invite.scopes LOOP
        INSERT INTO public.staff_permissions (user_id, scope, granted_by)
        VALUES (NEW.id, v_scope, v_invite.invited_by)
        ON CONFLICT (user_id, scope) DO NOTHING;
      END LOOP;
    END IF;

    DELETE FROM public.pending_staff_invites WHERE id = v_invite.id;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;