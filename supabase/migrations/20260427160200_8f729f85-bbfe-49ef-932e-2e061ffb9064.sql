
-- 1. Weekly recurring availability
CREATE TABLE public.coach_availability_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  lesson_types TEXT[] NOT NULL DEFAULT ARRAY['Range','Short Game','Putting','Playing Lesson']::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE public.coach_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view availability rules"
  ON public.coach_availability_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage availability rules"
  ON public.coach_availability_rules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text));

CREATE TRIGGER coach_availability_rules_updated_at
  BEFORE UPDATE ON public.coach_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. One-off date blocks (full day or partial)
CREATE TABLE public.coach_availability_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  block_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX idx_avail_blocks_date ON public.coach_availability_blocks(block_date);

ALTER TABLE public.coach_availability_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view availability blocks"
  ON public.coach_availability_blocks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage availability blocks"
  ON public.coach_availability_blocks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text));

CREATE TRIGGER coach_availability_blocks_updated_at
  BEFORE UPDATE ON public.coach_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Booking settings (singleton)
CREATE TABLE public.booking_settings (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  default_lesson_duration_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  slot_increment_minutes INTEGER NOT NULL DEFAULT 30,
  min_notice_hours INTEGER NOT NULL DEFAULT 12,
  max_advance_days INTEGER NOT NULL DEFAULT 60,
  allow_unpaid_booking BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 'default')
);

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view booking settings"
  ON public.booking_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage booking settings"
  ON public.booking_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_staff_permission(auth.uid(), 'lessons'::text));

CREATE TRIGGER booking_settings_updated_at
  BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Add Google Calendar tracking column on lessons
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

-- 5. Seed default settings + Mon–Fri 8–18 availability
INSERT INTO public.booking_settings (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coach_availability_rules (weekday, start_time, end_time)
SELECT d, '08:00'::time, '18:00'::time
FROM generate_series(1,5) AS d
WHERE NOT EXISTS (SELECT 1 FROM public.coach_availability_rules WHERE weekday = d);
