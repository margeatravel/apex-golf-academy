-- No-shows consume package credit like completed lessons (domain rule), and
-- stored package counters always match the real lessons.
--
-- 1) BEFORE trigger: a lesson that becomes no_show without a package is linked
--    to the student's oldest own package with credit left (same rule the
--    completion path uses for completed lessons).
-- 2) AFTER trigger (named zz_* so it runs after lessons_status_change_handler):
--    recomputes classes_used / classes_remaining / is_active for the old and
--    new package from completed + no_show lessons (Campo / Playing Lesson /
--    Field Lesson count 2; drafts and future-dated lessons excluded) — the
--    same numbers computePackageCounts shows in the app.

CREATE OR REPLACE FUNCTION public.package_used_slots(p_package_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(CASE WHEN l.lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END), 0)::int
  FROM public.lessons l
  WHERE l.package_id = p_package_id
    AND l.status IN ('completed','no_show')
    AND COALESCE(l.ar_status, 'active') <> 'draft'
    AND l.lesson_date <= (now() AT TIME ZONE 'America/Cancun')::date;
$$;

CREATE OR REPLACE FUNCTION public.sync_package_counts(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_size integer;
  v_used integer;
BEGIN
  IF p_package_id IS NULL THEN RETURN; END IF;
  SELECT package_size INTO v_size FROM public.class_packages WHERE id = p_package_id;
  IF v_size IS NULL OR v_size <= 0 THEN RETURN; END IF;
  v_used := public.package_used_slots(p_package_id);
  UPDATE public.class_packages
  SET classes_used = v_used,
      classes_remaining = GREATEST(v_size - v_used, 0),
      is_active = (v_size - v_used) > 0,
      updated_at = now()
  WHERE id = p_package_id
    AND (classes_used IS DISTINCT FROM v_used
         OR classes_remaining IS DISTINCT FROM GREATEST(v_size - v_used, 0)
         OR is_active IS DISTINCT FROM ((v_size - v_used) > 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.link_no_show_to_package()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_weight integer;
BEGIN
  IF NEW.status = 'no_show'
     AND NEW.package_id IS NULL
     AND NEW.student_id IS NOT NULL
     AND COALESCE(NEW.ar_status, 'active') <> 'draft'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'no_show')
  THEN
    v_weight := CASE WHEN NEW.lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END;
    SELECT p.id INTO NEW.package_id
    FROM public.class_packages p
    WHERE p.user_id = NEW.student_id
      AND COALESCE(p.is_archived, false) = false
      AND p.package_size > 0
      AND p.package_size - public.package_used_slots(p.id) >= v_weight
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_package_counts_on_lesson()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.sync_package_counts(OLD.package_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.package_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'UPDATE' THEN OLD.package_id ELSE NULL END) THEN
    PERFORM public.sync_package_counts(NEW.package_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS link_no_show_to_package_trg ON public.lessons;
CREATE TRIGGER link_no_show_to_package_trg
  BEFORE INSERT OR UPDATE OF status, package_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.link_no_show_to_package();

DROP TRIGGER IF EXISTS zz_sync_package_counts_trg ON public.lessons;
CREATE TRIGGER zz_sync_package_counts_trg
  AFTER INSERT OR DELETE OR UPDATE OF status, package_id, lesson_type, lesson_date, ar_status ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.sync_package_counts_on_lesson();
