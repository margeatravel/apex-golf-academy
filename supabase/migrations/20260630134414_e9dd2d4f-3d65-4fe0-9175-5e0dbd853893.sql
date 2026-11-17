
ALTER TABLE public.lessons                   ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.class_packages            ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_lesson_slots    ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fixed_schedule_slots      ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.coach_availability_rules  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.coach_availability_blocks ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.lessons                   SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;
UPDATE public.class_packages            SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;
UPDATE public.recurring_lesson_slots    SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;
UPDATE public.fixed_schedule_slots      SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;
UPDATE public.coach_availability_rules  SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;
UPDATE public.coach_availability_blocks SET coach_id = '13480fb4-e4d2-423c-b035-c65846b061fc' WHERE coach_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_coach_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_id IS NULL THEN
    NEW.coach_id := COALESCE(auth.uid(), '13480fb4-e4d2-423c-b035-c65846b061fc'::uuid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_coach_id_default_lessons   ON public.lessons;
DROP TRIGGER IF EXISTS set_coach_id_default_packages  ON public.class_packages;
DROP TRIGGER IF EXISTS set_coach_id_default_recurring ON public.recurring_lesson_slots;
DROP TRIGGER IF EXISTS set_coach_id_default_fixed     ON public.fixed_schedule_slots;
DROP TRIGGER IF EXISTS set_coach_id_default_rules     ON public.coach_availability_rules;
DROP TRIGGER IF EXISTS set_coach_id_default_blocks    ON public.coach_availability_blocks;

CREATE TRIGGER set_coach_id_default_lessons   BEFORE INSERT ON public.lessons                   FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();
CREATE TRIGGER set_coach_id_default_packages  BEFORE INSERT ON public.class_packages            FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();
CREATE TRIGGER set_coach_id_default_recurring BEFORE INSERT ON public.recurring_lesson_slots    FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();
CREATE TRIGGER set_coach_id_default_fixed     BEFORE INSERT ON public.fixed_schedule_slots      FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();
CREATE TRIGGER set_coach_id_default_rules     BEFORE INSERT ON public.coach_availability_rules  FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();
CREATE TRIGGER set_coach_id_default_blocks    BEFORE INSERT ON public.coach_availability_blocks FOR EACH ROW EXECUTE FUNCTION public.set_coach_id_default();

CREATE OR REPLACE FUNCTION public.is_coach(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'coach'::app_role)
$$;

DROP POLICY IF EXISTS "Coaches manage their own lessons"             ON public.lessons;
CREATE POLICY "Coaches manage their own lessons"
  ON public.lessons FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches manage their own packages"            ON public.class_packages;
CREATE POLICY "Coaches manage their own packages"
  ON public.class_packages FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches manage their own recurring slots"     ON public.recurring_lesson_slots;
CREATE POLICY "Coaches manage their own recurring slots"
  ON public.recurring_lesson_slots FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches manage their own fixed slots"         ON public.fixed_schedule_slots;
CREATE POLICY "Coaches manage their own fixed slots"
  ON public.fixed_schedule_slots FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches manage their own availability rules"  ON public.coach_availability_rules;
CREATE POLICY "Coaches manage their own availability rules"
  ON public.coach_availability_rules FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches manage their own availability blocks" ON public.coach_availability_blocks;
CREATE POLICY "Coaches manage their own availability blocks"
  ON public.coach_availability_blocks FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND public.is_coach(auth.uid()))
  WITH CHECK (coach_id = auth.uid() AND public.is_coach(auth.uid()));

DROP POLICY IF EXISTS "Coaches view their students"  ON public.profiles;
CREATE POLICY "Coaches view their students"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_coach(auth.uid()) AND (assigned_coach_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Coaches update their students" ON public.profiles;
CREATE POLICY "Coaches update their students"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_coach(auth.uid()) AND (assigned_coach_id = auth.uid() OR id = auth.uid()))
  WITH CHECK (public.is_coach(auth.uid()) AND (assigned_coach_id = auth.uid() OR id = auth.uid()));

DROP POLICY IF EXISTS "Coaches view user roles" ON public.user_roles;
CREATE POLICY "Coaches view user roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_coach(auth.uid()));
