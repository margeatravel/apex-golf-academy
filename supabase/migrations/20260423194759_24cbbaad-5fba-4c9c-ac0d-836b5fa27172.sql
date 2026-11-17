-- Add tour completion tracking column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pro_zone_tour_completed_at TIMESTAMPTZ NULL;

-- Pro Zone tips library table
CREATE TABLE IF NOT EXISTS public.pro_zone_tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('video','image') OR media_type IS NULL),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_zone_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active tips"
  ON public.pro_zone_tips
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage all tips"
  ON public.pro_zone_tips
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pro_zone_tips_updated_at
  BEFORE UPDATE ON public.pro_zone_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pro_zone_tips_category_sort
  ON public.pro_zone_tips (category, sort_order);

-- Per-user tip completion progress
CREATE TABLE IF NOT EXISTS public.pro_zone_tip_progress (
  user_id UUID NOT NULL,
  tip_id UUID NOT NULL REFERENCES public.pro_zone_tips(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tip_id)
);

ALTER TABLE public.pro_zone_tip_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progress"
  ON public.pro_zone_tip_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progress"
  ON public.pro_zone_tip_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own progress"
  ON public.pro_zone_tip_progress
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all progress"
  ON public.pro_zone_tip_progress
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed 15 placeholder tips, one per category
INSERT INTO public.pro_zone_tips (category, title, description, sort_order) VALUES
  ('grip', 'Find your neutral grip', 'Position the club so the V formed by your thumb and index finger points to your trail shoulder. A neutral grip is the foundation of a repeatable swing.', 1),
  ('release', 'Feel the rotation through impact', 'Let the forearms rotate naturally past the ball — no flipping, no holding off. Practice slow swings to feel the release point.', 1),
  ('putt', 'Eyes over the ball', 'Set up so your eyes are directly over (or just inside) the ball. This gives you the truest perception of your line.', 1),
  ('driver', 'Tee it high, hit it high', 'For driver, tee the ball so half of it sits above the crown. Combine with a slight upward attack angle for max distance.', 1),
  ('irons', 'Ball-then-turf contact', 'Iron strikes should compress the ball first, then take a divot in front. Focus on a forward shaft lean at impact.', 1),
  ('transition', 'Start the downswing from the ground up', 'Initiate the downswing with the lead hip — not the arms or shoulders. This creates the lag that produces effortless power.', 1),
  ('bunker', 'Open the face, splash the sand', 'Open the clubface BEFORE taking your grip. Aim to splash a dollar-bill-sized patch of sand under the ball — not the ball itself.', 1),
  ('scoring_stats', 'Track your strokes gained', 'Log every round: fairways, GIRs, putts, and up-and-downs. The data tells you exactly what to practice.', 1),
  ('course_management', 'Play to the fat side of every green', 'Aim for the bigger margin of safety, not the flag. Bogey avoidance beats birdie hunting 9 times out of 10.', 1),
  ('mobility_gym', 'Daily 5-minute thoracic mobility', 'Open-book stretches and cat-cows every morning. Rotational power comes from a mobile mid-back.', 1),
  ('mental_game', 'One shot at a time', 'After every shot — good or bad — take three deep breaths, commit to the next target, and let go of the last one.', 1),
  ('backswing', 'Width over speed', 'Extend the lead arm fully on the backswing. Width creates time, time creates rhythm, rhythm creates power.', 1),
  ('club_face_alignment', 'Square at the top', 'At the top of the backswing, the leading edge of the club should match your lead forearm angle. Check it in a mirror.', 1),
  ('club_path_alignment', 'In-to-out for a draw', 'Feel the club approaching from inside the target line through impact. This produces a controlled draw and adds yards.', 1),
  ('address_body_alignment', 'Build your stance from the feet up', 'Feet, knees, hips, shoulders — all parallel to the target line. Use an alignment stick on the range every session.', 1);
