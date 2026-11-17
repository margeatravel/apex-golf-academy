-- Helper: returns true if a user is an active paid subscriber (scratch/pro/apex)
-- Honors manual_plan_override (with optional expiry) and SC included flag.
CREATE OR REPLACE FUNCTION public.is_active_subscriber(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        -- SC included counts as active
        p.is_sc_student = true
        -- Active manual override
        OR (
          p.manual_plan_override IN ('scratch', 'pro', 'apex')
          AND (p.override_expires_at IS NULL OR p.override_expires_at > now())
        )
        -- Active plan tier
        OR p.plan_tier IN ('scratch', 'pro', 'apex')
      )
  );
$$;

-- Table: AI-generated training plans
CREATE TABLE IF NOT EXISTS public.ai_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('weekly', 'monthly', 'bimonthly')),
  title text NOT NULL,
  summary text,
  plan_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'apex_ai',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  generated_from_session_id uuid,
  coach_reviewed_at timestamptz,
  coach_review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_training_plans_student ON public.ai_training_plans(student_id, created_at DESC);

ALTER TABLE public.ai_training_plans ENABLE ROW LEVEL SECURITY;

-- Students can view their own plans
CREATE POLICY "Students can view their own training plans"
ON public.ai_training_plans
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- Students can create their own plans
CREATE POLICY "Students can create their own training plans"
ON public.ai_training_plans
FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

-- Students can archive/update status of their own plans
CREATE POLICY "Students can update their own training plans"
ON public.ai_training_plans
FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

-- Admins manage all
CREATE POLICY "Admins manage all training plans"
ON public.ai_training_plans
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Lessons staff can view all (for coach review)
CREATE POLICY "Lesson staff can view all training plans"
ON public.ai_training_plans
FOR SELECT
TO authenticated
USING (has_staff_permission(auth.uid(), 'lessons'::text));

-- updated_at trigger
CREATE TRIGGER update_ai_training_plans_updated_at
BEFORE UPDATE ON public.ai_training_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();