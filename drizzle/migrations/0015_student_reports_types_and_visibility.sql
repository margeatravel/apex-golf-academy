ALTER TABLE public.student_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'lesson',
  ADD COLUMN IF NOT EXISTS hidden_by_student boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_by_student boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_reports_report_type_chk'
  ) THEN
    ALTER TABLE public.student_reports
      ADD CONSTRAINT student_reports_report_type_chk
      CHECK (report_type IN ('lesson', 'scoring'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_reports TO authenticated;
GRANT ALL ON public.student_reports TO service_role;

DROP POLICY IF EXISTS "Students can view shared reports" ON public.student_reports;

CREATE POLICY "Students can view their visible reports"
ON public.student_reports
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  AND (shared_with_student = true OR generated_by_student = true)
  AND hidden_by_student = false
);

CREATE POLICY "Students can create own scoring reports"
ON public.student_reports
FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND created_by = auth.uid()
  AND report_type = 'scoring'
  AND generated_by_student = true
  AND shared_with_student = false
  AND hidden_by_student = false
);

CREATE POLICY "Students can delete own generated reports"
ON public.student_reports
FOR DELETE
TO authenticated
USING (
  student_id = auth.uid()
  AND generated_by_student = true
);

CREATE OR REPLACE FUNCTION public.hide_student_report(_report_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated int;
BEGIN
  UPDATE public.student_reports
     SET hidden_by_student = true
   WHERE id = _report_id
     AND student_id = auth.uid()
     AND generated_by_student = false;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hide_student_report(uuid) TO authenticated;