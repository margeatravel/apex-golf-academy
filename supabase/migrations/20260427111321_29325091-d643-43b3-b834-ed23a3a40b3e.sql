-- Coach AI conversations
CREATE TABLE public.coach_ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id uuid NOT NULL,
  title text,
  student_context_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_ai_conversations_coach ON public.coach_ai_conversations(coach_id, updated_at DESC);

ALTER TABLE public.coach_ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their own conversations"
  ON public.coach_ai_conversations
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

CREATE POLICY "Admins can view all coach conversations"
  ON public.coach_ai_conversations
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can insert their own conversations"
  ON public.coach_ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

CREATE POLICY "Coaches can update their own conversations"
  ON public.coach_ai_conversations
  FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

CREATE POLICY "Coaches can delete their own conversations"
  ON public.coach_ai_conversations
  FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

-- Coach AI messages
CREATE TABLE public.coach_ai_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.coach_ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_ai_messages_conv ON public.coach_ai_messages(conversation_id, created_at);

ALTER TABLE public.coach_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view messages from their own conversations"
  ON public.coach_ai_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_ai_conversations c
      WHERE c.id = conversation_id
        AND (
          c.coach_id = auth.uid()
          OR has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

CREATE POLICY "Coaches can insert messages in their own conversations"
  ON public.coach_ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_ai_conversations c
      WHERE c.id = conversation_id
        AND c.coach_id = auth.uid()
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
    )
  );

CREATE POLICY "Coaches can delete messages in their own conversations"
  ON public.coach_ai_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_ai_conversations c
      WHERE c.id = conversation_id
        AND c.coach_id = auth.uid()
    )
  );

-- Trigger: bump conversation.updated_at when a new message is added
CREATE OR REPLACE FUNCTION public.bump_coach_ai_conversation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coach_ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_coach_ai_conversation
AFTER INSERT ON public.coach_ai_messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_coach_ai_conversation_updated_at();

-- Trigger: keep updated_at fresh on conversation edits
CREATE TRIGGER trg_coach_ai_conversations_updated_at
BEFORE UPDATE ON public.coach_ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();