
-- 1) academy_settings: restrict student-readable keys
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.academy_settings;
CREATE POLICY "Authenticated users can view public settings"
ON public.academy_settings
FOR SELECT
TO authenticated
USING (key IN ('lesson_pricing', 'video_upload_limits'));

-- 2) Restrict student lesson updates to student_notes only via trigger
CREATE OR REPLACE FUNCTION public.restrict_student_lesson_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'staff'::app_role)
     OR has_staff_permission(auth.uid(), 'lessons') THEN
    RETURN NEW;
  END IF;

  -- For everyone else (including students editing their own row), only
  -- allow changes to student_notes / updated_at.
  IF (to_jsonb(NEW) - 'student_notes' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'student_notes' - 'updated_at') THEN
    RAISE EXCEPTION 'Students can only modify the student_notes field on their lessons';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restrict_student_lesson_updates_trg ON public.lessons;
CREATE TRIGGER restrict_student_lesson_updates_trg
BEFORE UPDATE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.restrict_student_lesson_updates();

-- 3) can_create_invite: only admins/coaches OR active subscribers may mint invites
CREATE OR REPLACE FUNCTION public.can_create_invite(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND (
       public.has_role(_user_id, 'admin'::app_role)
       OR public.is_active_subscriber(_user_id)
     );
$$;
