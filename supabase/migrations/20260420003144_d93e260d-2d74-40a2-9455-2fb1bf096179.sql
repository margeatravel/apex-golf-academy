-- 1. Recurring lesson slots table
CREATE TABLE public.recurring_lesson_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  lesson_type text NOT NULL DEFAULT 'Range',
  package_id uuid NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_slots_student ON public.recurring_lesson_slots(student_id) WHERE is_active = true;

ALTER TABLE public.recurring_lesson_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recurring slots"
  ON public.recurring_lesson_slots
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view their own recurring slots"
  ON public.recurring_lesson_slots
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE TRIGGER trg_recurring_slots_updated_at
  BEFORE UPDATE ON public.recurring_lesson_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Track origin on lessons
ALTER TABLE public.lessons
  ADD COLUMN recurring_slot_id uuid NULL,
  ADD COLUMN auto_generated boolean NOT NULL DEFAULT false;

CREATE INDEX idx_lessons_recurring_slot ON public.lessons(recurring_slot_id) WHERE recurring_slot_id IS NOT NULL;
CREATE INDEX idx_lessons_student_date_time ON public.lessons(student_id, lesson_date, lesson_time);