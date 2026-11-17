-- Trigger BEFORE DELETE on lessons: if the lesson was completed,
-- reverse the completion (refund the package slot and revert points)
-- by reusing the existing reverse_lesson_completion_for_lesson function.

CREATE OR REPLACE FUNCTION public.lessons_before_delete_handler()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'completed' AND OLD.student_id IS NOT NULL THEN
    PERFORM public.reverse_lesson_completion_for_lesson(OLD.id);
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS lessons_before_delete_trigger ON public.lessons;

CREATE TRIGGER lessons_before_delete_trigger
BEFORE DELETE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.lessons_before_delete_handler();