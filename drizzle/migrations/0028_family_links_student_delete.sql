-- Allow a student to remove a family link they are part of (either direction).
GRANT DELETE ON public.family_links TO authenticated;

CREATE POLICY "Members can remove their own family links"
ON public.family_links
FOR DELETE
TO authenticated
USING (parent_user_id = auth.uid() OR child_user_id = auth.uid());