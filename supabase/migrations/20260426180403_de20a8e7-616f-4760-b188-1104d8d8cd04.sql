-- Academy Knowledge Base used by the AI Coach to answer academy/business questions
CREATE TABLE IF NOT EXISTS public.academy_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active KB" ON public.academy_knowledge_base;
CREATE POLICY "Authenticated users can view active KB"
  ON public.academy_knowledge_base
  FOR SELECT
  TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert KB" ON public.academy_knowledge_base;
CREATE POLICY "Admins can insert KB"
  ON public.academy_knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update KB" ON public.academy_knowledge_base;
CREATE POLICY "Admins can update KB"
  ON public.academy_knowledge_base
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete KB" ON public.academy_knowledge_base;
CREATE POLICY "Admins can delete KB"
  ON public.academy_knowledge_base
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS academy_knowledge_base_set_updated_at ON public.academy_knowledge_base;
CREATE TRIGGER academy_knowledge_base_set_updated_at
  BEFORE UPDATE ON public.academy_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS academy_knowledge_base_category_idx
  ON public.academy_knowledge_base (category, sort_order);

-- Seed starter entries (idempotent via key).
INSERT INTO public.academy_knowledge_base (key, category, title, content, sort_order) VALUES
  ('lesson_packages', 'payments', 'Lesson packages',
    'Describe the lesson packages you offer (e.g. 5 / 10 / 20 / 30 lessons), what each includes, validity, and approximate prices in MXN. Edit this so the AI can answer "how much is a 10-lesson package?" accurately.',
    10),
  ('membership_tiers', 'membership', 'Membership tiers',
    'Explain the Member (Free), Scratch, and Pro membership tiers — monthly price (MXN), what is included, and how to upgrade. The AI uses this to answer "what plans do you have?".',
    20),
  ('pro_plan_benefits', 'membership', 'Pro Plan benefits',
    'List the specific benefits of the Pro Plan (priority booking, video analysis credits, unlimited videos, Pro Zone access, etc.) so the AI can answer "what does Pro Plan include?".',
    30),
  ('video_upload_rules', 'video_upload', 'Video upload rules',
    'Explain how students upload swing videos: where to tap (the upload button on the dashboard / videos tab), the 8-second / 100MB limit, supported formats (MP4, MOV, AVI), and per-tier monthly limits.',
    40),
  ('video_analysis_pricing', 'video_upload', 'Video Analysis pricing',
    'Explain the paid Video Analysis service: price in MXN (default 550), what the student gets, expected turnaround time, and how to request it from the app.',
    50),
  ('how_to_book_lesson', 'booking', 'How to book a lesson',
    'Step-by-step on how a student books a regular lesson: tap the yellow "Book a Lesson" sticky button or the Lessons page, choose a time on Calendly, confirm. Mention what to do if no times are available.',
    60),
  ('how_to_book_on_course', 'booking', 'How to book an on-course (Playing) lesson',
    'Explain how to request a Playing Lesson / on-course lesson: which booking link or how to message the coach via WhatsApp, typical duration, and that it consumes 2 lesson credits.',
    70),
  ('how_to_pay_stripe', 'payments', 'How to pay (Stripe checkout)',
    'Explain that all payments are in MXN through Stripe. To pay: open the side menu → Manage Plan, or buy a package/individual lesson from the dashboard, then complete checkout. Receipts come from Stripe by email.',
    80),
  ('contact_coach', 'platform_help', 'How to contact the coach',
    'Tell the student exactly how to reach Santi: WhatsApp link in the side menu under "Contact Coach", and that response time is usually within the same day. Include any other contact methods.',
    90),
  ('cancellation_policy', 'booking', 'Cancellation / no-show policy',
    'State the academy''s cancellation and no-show policy: how many hours in advance the student must cancel to avoid losing the lesson, and what happens for no-shows or late cancellations.',
    100),
  ('platform_account_help', 'platform_help', 'Platform & account help',
    'Common app-help answers: how to install the app (PWA), where to find lessons / videos / Pro Zone, how to reset password, how to update profile info.',
    110),
  ('student_faq', 'platform_help', 'Student FAQ',
    'A short list of frequent questions and answers: e.g. "Do lessons expire?", "Can I share a package with my family?", "How do I see my upcoming lessons?". Add anything students often ask.',
    120)
ON CONFLICT (key) DO NOTHING;