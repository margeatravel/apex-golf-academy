-- Backfill: anyone who already has staff_permissions but is not yet 'admin' in user_roles should be promoted.
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT sp.user_id, 'admin'::public.app_role
FROM public.staff_permissions sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = sp.user_id AND ur.role = 'admin'
);

-- Optional: remove the leftover 'student' role for those promoted staff so they don't show up as students.
DELETE FROM public.user_roles ur
WHERE ur.role = 'student'
  AND EXISTS (
    SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id = ur.user_id
  );