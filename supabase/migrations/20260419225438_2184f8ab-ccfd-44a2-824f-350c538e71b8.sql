
-- 1) Remove ALL monthly_streak transactions (we'll re-insert correctly)
DELETE FROM public.point_transactions WHERE reason = 'monthly_streak';

-- 2) Re-insert exactly ONE monthly_streak per (user, month) where the user actually has >=4 completed lessons in that calendar month
INSERT INTO public.point_transactions (user_id, delta, reason, metadata, created_at)
SELECT
  l.student_id,
  15,
  'monthly_streak',
  jsonb_build_object(
    'lessons_this_month', COUNT(*)::int,
    'month_start', date_trunc('month', l.lesson_date)::date
  ),
  (date_trunc('month', l.lesson_date) + interval '1 day')::timestamptz
FROM public.lessons l
WHERE l.status = 'completed' AND l.student_id IS NOT NULL
GROUP BY l.student_id, date_trunc('month', l.lesson_date)
HAVING COUNT(*) >= 4;

-- 3) Recalculate student_points balances from the source of truth (point_transactions)
WITH agg AS (
  SELECT
    user_id,
    COALESCE(SUM(delta), 0) AS sum_delta,
    COALESCE(SUM(GREATEST(delta, 0)), 0) AS sum_positive
  FROM public.point_transactions
  GROUP BY user_id
)
UPDATE public.student_points sp
SET total_points = GREATEST(agg.sum_delta, 0),
    lifetime_points = agg.sum_positive,
    reward_available = (GREATEST(agg.sum_delta, 0) >= 50),
    updated_at = now()
FROM agg
WHERE sp.user_id = agg.user_id;
