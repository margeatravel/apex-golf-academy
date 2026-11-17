-- 1) Harden notify_package_completed: only send email when the package is
--    truly completed according to actual completed lessons, not just the
--    cached classes_remaining counter (which can drift from imports / edits).
CREATE OR REPLACE FUNCTION public.notify_package_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_real_used integer;
BEGIN
  IF COALESCE(OLD.classes_remaining, 0) > 0
     AND COALESCE(NEW.classes_remaining, 0) <= 0
     AND COALESCE(NEW.package_size, 0) > 0 THEN

    SELECT COALESCE(SUM(
      CASE WHEN lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END
    ), 0)
      INTO v_real_used
    FROM public.lessons
    WHERE package_id = NEW.id
      AND status = 'completed';

    IF v_real_used < NEW.package_size THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := 'https://rlynhhrriskauwvfczkx.supabase.co/functions/v1/send-package-completed-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseW5oaHJyaXNrYXV3dmZjemt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjI0NzEsImV4cCI6MjA3OTgzODQ3MX0.wSFRTSVXDXPQNYByWoxr7yTsvQYLO-JOS1uoXfZN86o'
      ),
      body := jsonb_build_object('package_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) One-shot reconcile: recompute classes_used / classes_remaining / is_active
--    from the source of truth (lessons table) for every sized package.
WITH usage AS (
  SELECT
    p.id AS package_id,
    p.package_size,
    COALESCE(SUM(
      CASE WHEN l.lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END
    ), 0) AS real_used
  FROM public.class_packages p
  LEFT JOIN public.lessons l
    ON l.package_id = p.id AND l.status = 'completed'
  WHERE COALESCE(p.package_size, 0) > 0
  GROUP BY p.id, p.package_size
)
UPDATE public.class_packages cp
SET classes_used      = usage.real_used,
    classes_remaining = GREATEST(usage.package_size - usage.real_used, 0),
    is_active         = (usage.real_used < usage.package_size),
    updated_at        = now()
FROM usage
WHERE cp.id = usage.package_id
  AND (
        cp.classes_used      IS DISTINCT FROM usage.real_used
     OR cp.classes_remaining IS DISTINCT FROM GREATEST(usage.package_size - usage.real_used, 0)
     OR cp.is_active         IS DISTINCT FROM (usage.real_used < usage.package_size)
      );