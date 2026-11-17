
-- Fixed Schedule: coach publishes open weekly time slot offerings; students claim them.
-- Distinct from recurring_lesson_slots (which is coach-assigned per-student schedules).

CREATE TABLE public.fixed_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_schedule_slots_day_time ON public.fixed_schedule_slots(day_of_week, start_time);
CREATE INDEX idx_fixed_schedule_slots_student ON public.fixed_schedule_slots(student_id) WHERE student_id IS NOT NULL;

ALTER TABLE public.fixed_schedule_slots ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
CREATE POLICY "Admins can manage fixed schedule slots"
  ON public.fixed_schedule_slots
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staff with 'lessons' scope can manage as well
CREATE POLICY "Lesson staff can manage fixed schedule slots"
  ON public.fixed_schedule_slots
  FOR ALL
  TO authenticated
  USING (has_staff_permission(auth.uid(), 'lessons'))
  WITH CHECK (has_staff_permission(auth.uid(), 'lessons'));

-- All authenticated users can VIEW available + their own claimed slots
CREATE POLICY "Authenticated users can view all fixed schedule slots"
  ON public.fixed_schedule_slots
  FOR SELECT
  TO authenticated
  USING (is_available = true OR student_id = auth.uid());

-- Students can claim an available slot (UPDATE only their own user_id onto an unclaimed row)
-- We use a trigger to enforce paid plan + slot availability + lock from un-claim.
CREATE POLICY "Students can claim available slots"
  ON public.fixed_schedule_slots
  FOR UPDATE
  TO authenticated
  USING (is_available = true AND student_id IS NULL)
  WITH CHECK (student_id = auth.uid());

-- Trigger: enforce claim rules + notify coach
CREATE OR REPLACE FUNCTION public.handle_fixed_schedule_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_plan TEXT;
  v_is_sc BOOLEAN;
  v_override TEXT;
  v_coach_id UUID;
  v_day_label TEXT;
  v_time_label TEXT;
  v_admin RECORD;
BEGIN
  -- Only act on a new claim (student_id transitioning from NULL to a uuid by the student themself)
  IF TG_OP = 'UPDATE'
     AND OLD.student_id IS NULL
     AND NEW.student_id IS NOT NULL
     AND NEW.student_id = auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT has_staff_permission(auth.uid(), 'lessons')
  THEN
    -- Verify paid plan
    SELECT plan_tier, is_sc_student, manual_plan_override
      INTO v_plan, v_is_sc, v_override
    FROM public.profiles
    WHERE id = NEW.student_id;

    IF NOT (
      v_plan IN ('scratch','pro')
      OR v_override IN ('scratch','pro')
      OR v_is_sc = true
    ) THEN
      RAISE EXCEPTION 'Only Scratch or Pro members can claim fixed schedule slots';
    END IF;

    NEW.claimed_at := now();
    NEW.is_available := false;

    -- Build readable labels for the notification
    v_day_label := (ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[NEW.day_of_week + 1];
    v_time_label := to_char(NEW.start_time, 'HH12:MI AM');

    SELECT COALESCE(full_name, email) INTO v_student_name
    FROM public.profiles WHERE id = NEW.student_id;

    -- Notify all admins
    FOR v_admin IN
      SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        v_admin.user_id,
        'fixed_schedule_claim',
        'Fixed Schedule slot claimed',
        v_student_name || ' has booked the ' || v_day_label || ' ' || v_time_label || ' fixed schedule slot.',
        '/admin/fixed-schedule',
        jsonb_build_object(
          'slot_id', NEW.id,
          'student_id', NEW.student_id,
          'day_of_week', NEW.day_of_week,
          'start_time', NEW.start_time
        )
      );
    END LOOP;
  END IF;

  -- Update touch
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER fixed_schedule_claim_trigger
  BEFORE UPDATE ON public.fixed_schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_fixed_schedule_claim();

-- Touch updated_at on inserts via a separate trigger (using existing helper)
CREATE TRIGGER fixed_schedule_slots_updated_at
  BEFORE UPDATE ON public.fixed_schedule_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
