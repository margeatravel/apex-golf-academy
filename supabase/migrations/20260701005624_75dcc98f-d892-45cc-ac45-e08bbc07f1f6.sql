DO $$
DECLARE v uuid := '1b4ff738-8298-48b8-9b7e-572f9144d641';
BEGIN
  DELETE FROM public.staff_permissions WHERE user_id = v;
  DELETE FROM public.user_roles WHERE user_id = v;
  DELETE FROM public.notifications WHERE user_id = v;
  DELETE FROM public.pending_staff_invites WHERE lower(email) = 'admin@margeatravel.com';
  DELETE FROM public.profiles WHERE id = v;
  DELETE FROM auth.identities WHERE user_id = v;
  DELETE FROM auth.users WHERE id = v;
END $$;