ALTER TABLE public.student_invites
  ADD COLUMN IF NOT EXISTS assigned_coach_id uuid;