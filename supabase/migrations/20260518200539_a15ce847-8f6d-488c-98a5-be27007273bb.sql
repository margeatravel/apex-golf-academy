-- Notify all admins when a student logs/uploads a round.
CREATE OR REPLACE FUNCTION public.notify_admin_round_logged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_course text;
  v_to_par int;
  v_to_par_label text;
  v_link text;
BEGIN
  -- Look up student display name.
  SELECT COALESCE(full_name, email, 'A student')
    INTO v_student_name
  FROM public.profiles
  WHERE id = NEW.student_id;

  v_student_name := COALESCE(v_student_name, 'A student');
  v_course := COALESCE(NEW.course_name_snapshot, 'a course');

  -- Score vs par label
  IF NEW.total_score IS NOT NULL AND NEW.course_par IS NOT NULL THEN
    v_to_par := NEW.total_score - NEW.course_par;
    IF v_to_par = 0 THEN
      v_to_par_label := 'E';
    ELSIF v_to_par > 0 THEN
      v_to_par_label := '+' || v_to_par;
    ELSE
      v_to_par_label := v_to_par::text;
    END IF;
  ELSE
    v_to_par_label := NULL;
  END IF;

  v_link := '/admin/students/' || NEW.student_id || '?tab=rounds';

  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  SELECT
    ur.user_id,
    'round_logged',
    v_student_name || ' logged a round',
    v_student_name || ' shot ' || COALESCE(NEW.total_score::text, '–') ||
      CASE WHEN v_to_par_label IS NOT NULL THEN ' (' || v_to_par_label || ')' ELSE '' END ||
      ' at ' || v_course ||
      ' · ' || to_char(NEW.played_on, 'Mon DD, YYYY'),
    v_link,
    jsonb_build_object(
      'round_id', NEW.id,
      'student_id', NEW.student_id,
      'student_name', v_student_name,
      'course', v_course,
      'played_on', NEW.played_on,
      'holes_played', NEW.holes_played,
      'total_score', NEW.total_score,
      'course_par', NEW.course_par,
      'to_par', v_to_par,
      'round_type', NEW.round_type
    )
  FROM public.user_roles ur
  WHERE ur.role = 'admin';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_round_logged ON public.golf_rounds;
CREATE TRIGGER trg_notify_admin_round_logged
AFTER INSERT ON public.golf_rounds
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_round_logged();