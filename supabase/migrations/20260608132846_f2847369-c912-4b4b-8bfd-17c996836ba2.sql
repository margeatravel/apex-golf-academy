
CREATE OR REPLACE FUNCTION public.trigger_regenerate_recurring_for_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_should_fire boolean := false;
  v_supabase_url text := 'https://rlynhhrriskauwvfczkx.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o';
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, false) = true AND COALESCE(NEW.classes_remaining, 0) > 0 THEN
      v_should_fire := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Fire when the package transitions from unusable -> usable
    IF (COALESCE(NEW.is_active, false) = true AND COALESCE(NEW.classes_remaining, 0) > 0)
       AND (COALESCE(OLD.is_active, false) = false OR COALESCE(OLD.classes_remaining, 0) <= 0)
    THEN
      v_should_fire := true;
    END IF;
  END IF;

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  -- Only invoke if this student actually has active recurring slots that
  -- aren't intentionally package-less. Cheap guard to avoid HTTP spam.
  IF NOT EXISTS (
    SELECT 1 FROM public.recurring_lesson_slots
    WHERE student_id = NEW.user_id
      AND is_active = true
      AND COALESCE(no_package_intentional, false) = false
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/generate-recurring-lessons',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('student_id', NEW.user_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'trigger_regenerate_recurring_for_student http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS class_packages_regenerate_recurring ON public.class_packages;
CREATE TRIGGER class_packages_regenerate_recurring
AFTER INSERT OR UPDATE OF is_active, classes_remaining
ON public.class_packages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_regenerate_recurring_for_student();
