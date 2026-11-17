-- Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_coach_id uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_coach_id ON public.profiles(assigned_coach_id);

-- Helper: who can invite?
CREATE OR REPLACE FUNCTION public.can_create_invite(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.is_active_subscriber(_user_id);
$$;

-- Invites table
CREATE TABLE IF NOT EXISTS public.student_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  inviter_id uuid NOT NULL,
  inviter_is_coach boolean NOT NULL DEFAULT false,
  recipient_email text,
  recipient_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled')),
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_invites_inviter ON public.student_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_student_invites_recipient_email ON public.student_invites(lower(recipient_email));

ALTER TABLE public.student_invites ENABLE ROW LEVEL SECURITY;

-- Inviter can view own
CREATE POLICY "Inviters can view their own invites"
ON public.student_invites
FOR SELECT
TO authenticated
USING (inviter_id = auth.uid());

-- Admin manage all
CREATE POLICY "Admins can manage all invites"
ON public.student_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert: must be allowed and inviter must be self
CREATE POLICY "Eligible users can create invites"
ON public.student_invites
FOR INSERT
TO authenticated
WITH CHECK (
  inviter_id = auth.uid()
  AND public.can_create_invite(auth.uid())
);

-- Update own pending (e.g. cancel)
CREATE POLICY "Inviters can update their own invites"
ON public.student_invites
FOR UPDATE
TO authenticated
USING (inviter_id = auth.uid())
WITH CHECK (inviter_id = auth.uid());

CREATE TRIGGER update_student_invites_updated_at
BEFORE UPDATE ON public.student_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();