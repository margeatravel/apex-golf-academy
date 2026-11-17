-- Create a function to link orphaned lessons when a user signs up
CREATE OR REPLACE FUNCTION public.link_orphaned_lessons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a new profile is created, check for any lessons with matching invitee_email
  -- and null student_id, then link them to this new profile
  UPDATE public.lessons
  SET student_id = NEW.id
  WHERE invitee_email = NEW.email
    AND student_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after profile creation
DROP TRIGGER IF EXISTS on_profile_created_link_lessons ON public.profiles;
CREATE TRIGGER on_profile_created_link_lessons
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.link_orphaned_lessons();