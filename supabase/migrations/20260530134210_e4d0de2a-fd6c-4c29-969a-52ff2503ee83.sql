-- Resync class_packages counters from the lessons table.
-- Source of truth: completed (not skipped) lessons.
-- Playing Lessons / Campo / Field Lesson count as 2 slots.
WITH actual AS (
  SELECT
    l.package_id,
    SUM(CASE WHEN l.lesson_type IN ('Campo','Playing Lesson','Field Lesson') THEN 2 ELSE 1 END) AS real_used
  FROM public.lessons l
  WHERE l.status = 'completed'
    AND COALESCE(l.skipped, false) = false
    AND l.package_id IS NOT NULL
  GROUP BY l.package_id
)
UPDATE public.class_packages cp
SET classes_used      = COALESCE(a.real_used, 0),
    classes_remaining = GREATEST(cp.package_size - COALESCE(a.real_used, 0), 0),
    is_active         = (GREATEST(cp.package_size - COALESCE(a.real_used, 0), 0) > 0),
    updated_at        = now()
FROM (
  SELECT cp2.id, COALESCE(a2.real_used, 0) AS real_used
  FROM public.class_packages cp2
  LEFT JOIN actual a2 ON a2.package_id = cp2.id
  WHERE COALESCE(cp2.classes_used, 0) <> COALESCE(a2.real_used, 0)
) a
WHERE cp.id = a.id;