
-- 1. Add lifetime_points column to student_points
ALTER TABLE public.student_points
ADD COLUMN IF NOT EXISTS lifetime_points integer NOT NULL DEFAULT 0;

-- Backfill lifetime_points = total_points for existing rows
UPDATE public.student_points SET lifetime_points = total_points WHERE lifetime_points = 0 AND total_points > 0;

-- 2. point_transactions table
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON public.point_transactions(created_at DESC);

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own point transactions"
  ON public.point_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all point transactions"
  ON public.point_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert point transactions"
  ON public.point_transactions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. point_redemptions table
CREATE TABLE IF NOT EXISTS public.point_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  reward_type text NOT NULL,
  cost integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_redemptions_user_id ON public.point_redemptions(user_id);

ALTER TABLE public.point_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own redemptions"
  ON public.point_redemptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all redemptions"
  ON public.point_redemptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage redemptions"
  ON public.point_redemptions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Modify process_lesson_completion to log transactions and monthly streak bonus
CREATE OR REPLACE FUNCTION public.process_lesson_completion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lessons_this_month integer;
  v_streak_already_awarded boolean;
BEGIN
  -- Add 10 points and increment lifetime
  INSERT INTO public.student_points (user_id, total_points, lifetime_points, total_lessons_ever)
  VALUES (p_user_id, 10, 10, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 10,
    lifetime_points = student_points.lifetime_points + 10,
    total_lessons_ever = student_points.total_lessons_ever + 1,
    reward_available = CASE WHEN student_points.total_points + 10 >= 50 THEN true ELSE student_points.reward_available END,
    updated_at = now();

  -- Log transaction
  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (p_user_id, 10, 'lesson_completed', '{}'::jsonb);

  -- Decrement from oldest active package
  UPDATE public.class_packages
  SET classes_remaining = classes_remaining - 1,
      classes_used = classes_used + 1,
      is_active = CASE WHEN classes_remaining - 1 <= 0 THEN false ELSE true END,
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.class_packages
    WHERE user_id = p_user_id AND is_active = true AND classes_remaining > 0
    ORDER BY created_at ASC
    LIMIT 1
  );

  -- Monthly streak: count completed lessons in current calendar month
  SELECT COUNT(*) INTO v_lessons_this_month
  FROM public.lessons
  WHERE student_id = p_user_id
    AND status = 'completed'
    AND lesson_date >= date_trunc('month', CURRENT_DATE)
    AND lesson_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  -- Check if streak bonus already awarded this month
  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE user_id = p_user_id
      AND reason = 'monthly_streak'
      AND created_at >= date_trunc('month', CURRENT_DATE)
  ) INTO v_streak_already_awarded;

  IF v_lessons_this_month >= 3 AND NOT v_streak_already_awarded THEN
    UPDATE public.student_points
    SET total_points = total_points + 15,
        lifetime_points = lifetime_points + 15,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
    VALUES (p_user_id, 15, 'monthly_streak', jsonb_build_object('lessons_this_month', v_lessons_this_month));
  END IF;
END;
$function$;

-- 5. Award video upload points
CREATE OR REPLACE FUNCTION public.award_video_upload_points(p_user_id uuid, p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.student_points (user_id, total_points, lifetime_points)
  VALUES (p_user_id, 5, 5)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 5,
    lifetime_points = student_points.lifetime_points + 5,
    updated_at = now();

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata)
  VALUES (p_user_id, 5, 'video_upload', jsonb_build_object('video_id', p_video_id));
END;
$function$;

-- Trigger: award points when a student uploads a video for themselves
CREATE OR REPLACE FUNCTION public.trigger_video_upload_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only award if the uploader is the student themselves (not coach upload)
  IF NEW.uploaded_by = NEW.student_id THEN
    PERFORM public.award_video_upload_points(NEW.student_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS award_points_on_video_upload ON public.videos;
CREATE TRIGGER award_points_on_video_upload
AFTER INSERT ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.trigger_video_upload_points();

-- 6. Award referral points (admin-callable)
CREATE OR REPLACE FUNCTION public.award_referral_points(p_referrer_id uuid, p_referred_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can award referral points';
  END IF;

  INSERT INTO public.student_points (user_id, total_points, lifetime_points)
  VALUES (p_referrer_id, 20, 20)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = student_points.total_points + 20,
    lifetime_points = student_points.lifetime_points + 20,
    updated_at = now();

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_by)
  VALUES (p_referrer_id, 20, 'referral_completed', jsonb_build_object('referred_id', p_referred_id), auth.uid());
END;
$function$;

-- 7. Admin manual point adjustment
CREATE OR REPLACE FUNCTION public.admin_adjust_points(p_user_id uuid, p_delta integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can adjust points';
  END IF;

  INSERT INTO public.student_points (user_id, total_points, lifetime_points)
  VALUES (p_user_id, GREATEST(p_delta, 0), GREATEST(p_delta, 0))
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = GREATEST(student_points.total_points + p_delta, 0),
    lifetime_points = CASE WHEN p_delta > 0 THEN student_points.lifetime_points + p_delta ELSE student_points.lifetime_points END,
    updated_at = now();

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_by)
  VALUES (p_user_id, p_delta, COALESCE('admin_adjustment: ' || p_reason, 'admin_adjustment'), '{}'::jsonb, auth.uid());
END;
$function$;

-- 8. Redeem video analysis
CREATE OR REPLACE FUNCTION public.redeem_video_analysis(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance integer;
  v_cost integer := 50;
  v_redemption_id uuid;
  v_request_id uuid;
BEGIN
  -- Validate caller
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT total_points INTO v_balance
  FROM public.student_points
  WHERE user_id = p_user_id;

  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'balance', COALESCE(v_balance, 0));
  END IF;

  -- Deduct
  UPDATE public.student_points
  SET total_points = total_points - v_cost,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_by)
  VALUES (p_user_id, -v_cost, 'redeem_video_analysis', '{}'::jsonb, auth.uid());

  -- Create redemption record
  INSERT INTO public.point_redemptions (user_id, reward_type, cost, status)
  VALUES (p_user_id, 'video_analysis', v_cost, 'completed')
  RETURNING id INTO v_redemption_id;

  -- Create comped analysis_request
  INSERT INTO public.analysis_requests (student_id, amount, payment_status, delivery_status, notes)
  VALUES (p_user_id, 0, 'comped', 'pending', 'Redeemed with SC Points')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'request_id', v_request_id,
    'remaining_balance', v_balance - v_cost
  );
END;
$function$;
