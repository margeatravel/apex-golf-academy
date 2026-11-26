-- Student requests for a priority spot that isn't offered (specific day,
-- time and cadence). Written and decided only through the priority-spots
-- edge function (service role); students read their own, coaches theirs.
CREATE TABLE IF NOT EXISTS public.priority_spot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  lesson_type text,
  interval_weeks smallint NOT NULL DEFAULT 1 CHECK (interval_weeks BETWEEN 1 AND 4),
  start_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  recurring_slot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS priority_spot_requests_coach_status_idx
  ON public.priority_spot_requests (coach_id, status);
CREATE INDEX IF NOT EXISTS priority_spot_requests_student_idx
  ON public.priority_spot_requests (student_id);

ALTER TABLE public.priority_spot_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psr_select_own_student" ON public.priority_spot_requests;
CREATE POLICY "psr_select_own_student" ON public.priority_spot_requests
  FOR SELECT TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "psr_select_coach_or_admin" ON public.priority_spot_requests;
CREATE POLICY "psr_select_coach_or_admin" ON public.priority_spot_requests
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
