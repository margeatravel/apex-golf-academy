CREATE OR REPLACE FUNCTION public.can_preview_student(_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Owner-only: coaches can no longer open the student preview.
  SELECT
    auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'admin')
    AND _student_id IS NOT NULL
$function$;