DROP INDEX IF EXISTS public.uniq_reusable_coach_code_per_inviter;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_personal_coach_code_per_inviter
ON public.student_invites (inviter_id)
WHERE is_reusable = true
  AND inviter_is_coach = true
  AND assigned_coach_id IS NULL;