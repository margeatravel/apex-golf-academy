
CREATE TABLE IF NOT EXISTS public.point_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cost integer NOT NULL DEFAULT 100,
  icon text NOT NULL DEFAULT 'Star',
  fulfillment_type text NOT NULL DEFAULT 'manual', -- 'manual' | 'video_analysis'
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.point_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active rewards"
  ON public.point_rewards FOR SELECT TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage rewards"
  ON public.point_rewards FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_point_rewards_updated_at
  BEFORE UPDATE ON public.point_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend point_redemptions
ALTER TABLE public.point_redemptions
  ADD COLUMN IF NOT EXISTS reward_id uuid,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_by uuid,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- Seed video_analysis reward
INSERT INTO public.point_rewards (key, name, description, cost, icon, fulfillment_type, sort_order)
VALUES ('video_analysis', 'Free Video Analysis', 'Get a coach video review at no cost', 200, 'Video', 'video_analysis', 0)
ON CONFLICT (key) DO NOTHING;

-- Generic redeem function
CREATE OR REPLACE FUNCTION public.redeem_reward(p_user_id uuid, p_reward_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reward record;
  v_balance integer;
  v_redemption_id uuid;
  v_request_id uuid;
  v_initial_status text;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_reward FROM public.point_rewards
   WHERE key = p_reward_key AND is_active = true;

  IF v_reward.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  SELECT total_points INTO v_balance FROM public.student_points WHERE user_id = p_user_id;

  IF v_balance IS NULL OR v_balance < v_reward.cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'balance', COALESCE(v_balance,0));
  END IF;

  UPDATE public.student_points
     SET total_points = total_points - v_reward.cost, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_by)
  VALUES (p_user_id, -v_reward.cost, 'redeem_' || v_reward.key,
          jsonb_build_object('reward_id', v_reward.id, 'reward_key', v_reward.key), auth.uid());

  v_initial_status := CASE WHEN v_reward.fulfillment_type = 'video_analysis' THEN 'completed' ELSE 'pending' END;

  INSERT INTO public.point_redemptions (user_id, reward_type, reward_id, cost, status, fulfillment_status)
  VALUES (p_user_id, v_reward.key, v_reward.id, v_reward.cost, 'completed', v_initial_status)
  RETURNING id INTO v_redemption_id;

  IF v_reward.fulfillment_type = 'video_analysis' THEN
    INSERT INTO public.analysis_requests (student_id, amount, payment_status, delivery_status, notes)
    VALUES (p_user_id, 0, 'comped', 'pending', 'Redeemed with SC Points')
    RETURNING id INTO v_request_id;

    UPDATE public.point_redemptions
       SET fulfilled_at = now(), metadata = jsonb_build_object('analysis_request_id', v_request_id)
     WHERE id = v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'analysis_request_id', v_request_id,
    'fulfillment_type', v_reward.fulfillment_type,
    'remaining_balance', v_balance - v_reward.cost
  );
END;
$$;
