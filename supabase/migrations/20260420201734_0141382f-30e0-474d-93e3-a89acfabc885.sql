CREATE OR REPLACE FUNCTION public.redeem_video_analysis(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance integer;
  v_cost integer := 200;
  v_redemption_id uuid;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT total_points INTO v_balance
  FROM public.student_points
  WHERE user_id = p_user_id;

  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'balance', COALESCE(v_balance, 0));
  END IF;

  UPDATE public.student_points
  SET total_points = total_points - v_cost,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_by)
  VALUES (p_user_id, -v_cost, 'redeem_video_analysis', '{}'::jsonb, auth.uid());

  INSERT INTO public.point_redemptions (user_id, reward_type, cost, status)
  VALUES (p_user_id, 'video_analysis', v_cost, 'completed')
  RETURNING id INTO v_redemption_id;

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