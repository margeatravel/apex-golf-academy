UPDATE public.lessons
SET package_id = 'ffb20e31-25e7-4bd0-8426-73b170ae0e0a'
WHERE id = '1ac336d1-3d17-4361-aeff-29ab1d07a412'
  AND package_id IS NULL;

UPDATE public.class_packages
SET classes_used = classes_used + 2,
    classes_remaining = GREATEST(classes_remaining - 2, 0),
    is_active = CASE WHEN classes_remaining - 2 <= 0 THEN false ELSE true END,
    updated_at = now()
WHERE id = 'ffb20e31-25e7-4bd0-8426-73b170ae0e0a';