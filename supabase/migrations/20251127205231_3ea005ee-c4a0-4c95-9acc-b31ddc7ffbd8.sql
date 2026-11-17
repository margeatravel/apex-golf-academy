-- Create a function to sync Calendly lessons for a newly registered student
CREATE OR REPLACE FUNCTION public.sync_student_calendly_lessons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  student_email text;
BEGIN
  -- Get the student's email from the profiles table
  SELECT email INTO student_email
  FROM profiles
  WHERE id = NEW.user_id;
  
  -- Only trigger sync for students (not admins)
  IF NEW.role = 'student' AND student_email IS NOT NULL THEN
    -- Call the sync-calendly edge function in the background
    -- This uses pg_net to make an HTTP request without blocking
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-calendly',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := jsonb_build_object(
        'userEmail', student_email,
        'syncAll', false
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-sync Calendly lessons when a student role is assigned
CREATE TRIGGER on_student_role_assigned
  AFTER INSERT ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION sync_student_calendly_lessons();