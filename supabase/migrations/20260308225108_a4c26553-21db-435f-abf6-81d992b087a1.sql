
-- Add handicap goal fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS handicap_goal numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS handicap_goal_date date DEFAULT NULL;

-- Create handicap history table
CREATE TABLE IF NOT EXISTS public.handicap_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  handicap numeric NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  source text DEFAULT 'manual'
);

-- Enable RLS
ALTER TABLE public.handicap_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own handicap history"
  ON public.handicap_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own handicap history"
  ON public.handicap_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all handicap history"
  ON public.handicap_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert handicap history"
  ON public.handicap_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create a trigger to auto-record handicap changes
CREATE OR REPLACE FUNCTION public.record_handicap_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.handicap IS DISTINCT FROM OLD.handicap AND NEW.handicap IS NOT NULL THEN
    INSERT INTO public.handicap_history (user_id, handicap, source)
    VALUES (NEW.id, NEW.handicap, 'profile_update');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_handicap_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.record_handicap_change();

-- Seed current handicap values into history for existing users
INSERT INTO public.handicap_history (user_id, handicap, recorded_at, source)
SELECT id, handicap, COALESCE(updated_at, created_at, now()), 'initial'
FROM public.profiles
WHERE handicap IS NOT NULL;

-- Also need admin insert policy for notifications (coach creates notifications for students)
CREATE POLICY "Admins can insert notifications for any user"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
