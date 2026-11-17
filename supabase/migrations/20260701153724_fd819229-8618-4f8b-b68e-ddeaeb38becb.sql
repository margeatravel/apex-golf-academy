CREATE OR REPLACE FUNCTION public.can_create_invite(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL
     AND (
       public.has_role(_user_id, 'admin'::app_role)
       OR public.has_role(_user_id, 'coach'::app_role)
       OR public.is_active_subscriber(_user_id)
     );
$function$;