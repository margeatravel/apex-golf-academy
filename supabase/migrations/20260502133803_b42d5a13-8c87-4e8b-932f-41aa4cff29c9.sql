
-- Add CLABE column to profiles
ALTER TABLE public.profiles ADD COLUMN clabe text;

-- Allow students to insert their own payments (for cash/transfer records)
CREATE POLICY "Students can insert their own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());
