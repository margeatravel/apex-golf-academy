-- Recurring schedule change requests.
-- A student who already has a recurring schedule asks the coach to move it to a
-- different open fixed slot (or, Pro/Apex only, add a second weekly slot).
-- The request stays "pending" until the coach approves or denies it; the
-- student's current schedule is untouched while under review.
--
-- Santiago's rules (27 Nov 2026):
--   * the change is free, coach approval required;
--   * if two students want the same slot, Scratch and Pro win (priority plans);
--   * max recurring schedules per week: Scratch 1, Pro 2, Apex 2.
-- Priority is enforced at approval time (coach review) and at claim time
-- (claim-recurring-slot); this table only stores the request.

CREATE TABLE public.recurring_slot_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'change'
    CHECK (request_type IN ('change', 'add_second')),
  -- 'fixed' = claimed fixed_schedule_slots row, 'recurring' = recurring_lesson_slots row.
  -- NULL for 'add_second' (nothing is being replaced).
  current_slot_kind TEXT CHECK (current_slot_kind IN ('fixed', 'recurring')),
  current_slot_id UUID,
  target_slot_id UUID NOT NULL REFERENCES public.fixed_schedule_slots(id) ON DELETE CASCADE,
  target_weekday SMALLINT NOT NULL CHECK (target_weekday BETWEEN 0 AND 6),
  target_start_time TIME NOT NULL,
  target_duration_minutes INTEGER NOT NULL DEFAULT 60,
  target_lesson_type TEXT,
  -- The student's effective plan at request time; used for the review-queue
  -- ordering and the Scratch/Pro conflict priority.
  plan_at_request TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  -- Date from which the new schedule applies (set on approval).
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_change_requests_student ON public.recurring_slot_change_requests(student_id);
CREATE INDEX idx_change_requests_status ON public.recurring_slot_change_requests(status);
CREATE INDEX idx_change_requests_target ON public.recurring_slot_change_requests(target_slot_id);

-- One pending request per student per target slot (a student can't ask twice
-- for the same slot while the first ask is still open).
CREATE UNIQUE INDEX idx_change_requests_one_pending_per_target
  ON public.recurring_slot_change_requests(student_id, target_slot_id)
  WHERE status = 'pending';

ALTER TABLE public.recurring_slot_change_requests ENABLE ROW LEVEL SECURITY;

-- Students see their own requests.
CREATE POLICY "Students can view their own change requests"
  ON public.recurring_slot_change_requests
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Students can file a request for themselves (pending only).
CREATE POLICY "Students can create their own change requests"
  ON public.recurring_slot_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

-- Students can cancel their own pending request.
CREATE POLICY "Students can cancel their own pending change requests"
  ON public.recurring_slot_change_requests
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'cancelled');

-- The assigned coach can see their students' requests.
CREATE POLICY "Assigned coach can view change requests"
  ON public.recurring_slot_change_requests
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

-- Admins manage everything (review queue lives on the admin side).
CREATE POLICY "Admins can manage change requests"
  ON public.recurring_slot_change_requests
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Notify all admins (in-app notification) when a student files a request.
-- The email to the coach goes through notify-admin (event
-- 'recurring_change_requested'); this trigger covers the in-app bell and needs
-- no function deploy.
CREATE OR REPLACE FUNCTION public.handle_recurring_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_day_label TEXT;
  v_time_label TEXT;
  v_admin RECORD;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(full_name, email) INTO v_student_name
    FROM public.profiles WHERE id = NEW.student_id;

    v_day_label := (ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[NEW.target_weekday + 1];
    v_time_label := to_char(NEW.target_start_time, 'HH12:MI AM');

    FOR v_admin IN
      SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        v_admin.user_id,
        'recurring_change_requested',
        'Recurring schedule change requested',
        COALESCE(v_student_name, 'A student')
          || ' asked to move their recurring schedule to '
          || v_day_label || ' ' || v_time_label
          || CASE WHEN NEW.request_type = 'add_second' THEN ' (second weekly slot)' ELSE '' END
          || '.',
        '/admin/fixed-schedule',
        jsonb_build_object(
          'request_id', NEW.id,
          'student_id', NEW.student_id,
          'target_slot_id', NEW.target_slot_id,
          'request_type', NEW.request_type,
          'target_weekday', NEW.target_weekday,
          'target_start_time', NEW.target_start_time
        )
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_change_request_notify_trigger
  AFTER INSERT ON public.recurring_slot_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_recurring_change_request();

CREATE TRIGGER recurring_slot_change_requests_updated_at
  BEFORE UPDATE ON public.recurring_slot_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
