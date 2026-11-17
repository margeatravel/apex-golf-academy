-- 1) Make existing reusable coach codes effectively never expire
UPDATE public.student_invites
SET expires_at = 'infinity'::timestamptz,
    status = 'pending'
WHERE is_reusable = true;

-- 2) Enforce one reusable code per coach so it stays stable
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reusable_coach_code_per_inviter
ON public.student_invites (inviter_id)
WHERE is_reusable = true;