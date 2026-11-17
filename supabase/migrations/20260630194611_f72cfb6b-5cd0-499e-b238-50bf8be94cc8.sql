DROP POLICY IF EXISTS "Authenticated users can view available or own fixed slots" ON public.fixed_schedule_slots;

CREATE POLICY "Students can view assigned coach fixed slots"
ON public.fixed_schedule_slots
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  OR (
    is_available = true
    AND student_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.assigned_coach_id = fixed_schedule_slots.coach_id
    )
  )
);