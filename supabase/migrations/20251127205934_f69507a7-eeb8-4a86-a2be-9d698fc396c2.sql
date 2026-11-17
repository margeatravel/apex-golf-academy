-- Remove the auto-sync trigger and function that's blocking signups
DROP TRIGGER IF EXISTS on_student_role_assigned ON user_roles;
DROP FUNCTION IF EXISTS public.sync_student_calendly_lessons();