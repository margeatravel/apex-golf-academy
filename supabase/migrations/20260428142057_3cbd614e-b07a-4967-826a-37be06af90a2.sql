-- 1. Add reusability flag to student_invites
ALTER TABLE public.student_invites
  ADD COLUMN IF NOT EXISTS is_reusable boolean NOT NULL DEFAULT false;

-- 2. Create redemptions audit table
CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.student_invites(id) ON DELETE CASCADE,
  accepted_by uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, accepted_by)
);

CREATE INDEX IF NOT EXISTS idx_invite_redemptions_invite_id ON public.invite_redemptions(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_accepted_by ON public.invite_redemptions(accepted_by);

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

-- Admins see and manage all
CREATE POLICY "Admins manage all invite redemptions"
  ON public.invite_redemptions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can see their own redemptions (the times they redeemed someone's code)
CREATE POLICY "Users see their own redemptions"
  ON public.invite_redemptions
  FOR SELECT
  TO authenticated
  USING (accepted_by = auth.uid());

-- Inviters can see who redeemed their codes
CREATE POLICY "Inviters see redemptions of their codes"
  ON public.invite_redemptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_invites si
      WHERE si.id = invite_redemptions.invite_id
        AND si.inviter_id = auth.uid()
    )
  );