-- Enum for round type
DO $$ BEGIN
  CREATE TYPE public.round_type AS ENUM ('practice', 'tournament');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =========================================
-- golf_courses: saved courses per student
-- =========================================
CREATE TABLE IF NOT EXISTS public.golf_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  name text NOT NULL,
  city text,
  par integer NOT NULL DEFAULT 72 CHECK (par BETWEEN 27 AND 100),
  slope integer CHECK (slope BETWEEN 55 AND 200),
  rating numeric(4,1) CHECK (rating BETWEEN 50.0 AND 90.0),
  default_tees text,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_courses_student ON public.golf_courses(student_id);

ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage their own courses"
ON public.golf_courses FOR ALL TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage all courses"
ON public.golf_courses FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER golf_courses_updated_at
BEFORE UPDATE ON public.golf_courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- golf_rounds: logged round summary
-- =========================================
CREATE TABLE IF NOT EXISTS public.golf_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid REFERENCES public.golf_courses(id) ON DELETE SET NULL,
  course_name_snapshot text NOT NULL,
  round_type public.round_type NOT NULL DEFAULT 'practice',
  played_on date NOT NULL,
  tees text,
  holes_played integer NOT NULL DEFAULT 18 CHECK (holes_played IN (9, 18)),
  course_par integer NOT NULL DEFAULT 72 CHECK (course_par BETWEEN 27 AND 100),
  total_score integer NOT NULL CHECK (total_score BETWEEN 18 AND 200),
  fairways_hit integer CHECK (fairways_hit >= 0 AND fairways_hit <= 18),
  fairways_total integer CHECK (fairways_total >= 0 AND fairways_total <= 18),
  greens_in_regulation integer CHECK (greens_in_regulation >= 0 AND greens_in_regulation <= 18),
  putts integer CHECK (putts >= 0 AND putts <= 100),
  penalties integer CHECK (penalties >= 0 AND penalties <= 50),
  weather text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_rounds_student ON public.golf_rounds(student_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_played_on ON public.golf_rounds(played_on DESC);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_student_played ON public.golf_rounds(student_id, played_on DESC);

ALTER TABLE public.golf_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage their own rounds"
ON public.golf_rounds FOR ALL TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage all rounds"
ON public.golf_rounds FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER golf_rounds_updated_at
BEFORE UPDATE ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();