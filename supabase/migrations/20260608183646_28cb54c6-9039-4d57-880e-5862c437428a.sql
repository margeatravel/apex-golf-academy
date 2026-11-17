DROP POLICY IF EXISTS "Users can insert their own points" ON public.student_points;

DROP POLICY IF EXISTS "Coaches can delete messages in their own conversations" ON public.coach_ai_messages;
CREATE POLICY "Coaches can delete messages in their own conversations"
ON public.coach_ai_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.coach_ai_conversations c
    WHERE c.id = coach_ai_messages.conversation_id
      AND c.coach_id = auth.uid()
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
);