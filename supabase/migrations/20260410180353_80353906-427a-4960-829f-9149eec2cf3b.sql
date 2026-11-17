
CREATE TABLE public.lesson_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  num_lessons INTEGER NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  expires_in_days INTEGER,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all packages"
ON public.lesson_packages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view active packages"
ON public.lesson_packages
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE TRIGGER update_lesson_packages_updated_at
BEFORE UPDATE ON public.lesson_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
