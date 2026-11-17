
-- Create academy settings table (key-value JSON store)
CREATE TABLE public.academy_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.academy_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read settings
CREATE POLICY "Admins can view settings"
ON public.academy_settings FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
ON public.academy_settings FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings"
ON public.academy_settings FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete settings
CREATE POLICY "Admins can delete settings"
ON public.academy_settings FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default values
INSERT INTO public.academy_settings (key, value) VALUES
('timezone', '{"timezone": "America/Cancun", "offset": "UTC-5", "note": "Cancún does not observe Daylight Saving Time. All displayed times are fixed at UTC-5."}'::jsonb),
('portal_link', '{"url": "https://golfproconnect.lovable.app/auth"}'::jsonb),
('plans', '[
  {"name": "Free", "icon": "Star", "color": "#9ca3af", "features": ["View lesson history", "Access assigned drills", "Basic profile"], "access": "Default for all new students", "limits": "No video analysis, no priority booking, no SC Points"},
  {"name": "SC Students (Included)", "icon": "Star", "color": "#4a7c59", "features": ["Everything in Free", "Full platform access without Stripe subscription", "SC Points rewards", "Video uploads", "Lesson packages"], "access": "Granted by coach via is_sc_student flag — no payment required", "limits": "Same features as Advance, no Stripe billing"},
  {"name": "Advance", "icon": "Zap", "color": "#60a5fa", "features": ["Everything in Free", "Video analysis requests", "SC Points rewards system", "Lesson packages & class tracking", "Video uploads & storage"], "access": "Stripe subscription or manual coach override", "limits": "Standard support, standard video storage"},
  {"name": "Pro", "icon": "Crown", "color": "#f0c040", "features": ["Everything in Advance", "Priority booking", "Unlimited video analysis", "Premium support", "Advanced performance stats", "+20 extra video uploads vs Advance"], "access": "Stripe subscription (+100 MXN vs Advance) or manual coach override", "limits": "Full access — no limits"}
]'::jsonb),
('levels', '[
  {"name": "Bronze", "color": "#C9A87A", "range": "0 – 49 pts", "description": "Starting level for all new students", "perks": ["Basic profile badge", "Lesson tracking"]},
  {"name": "Silver", "color": "#C0C0C0", "range": "50 – 99 pts", "description": "Consistent training recognized", "perks": ["Silver badge", "All Bronze perks"]},
  {"name": "Gold", "color": "#FFD700", "range": "100 – 199 pts", "description": "Dedicated student milestone", "perks": ["Gold badge with glow", "Reward available: free field lesson", "Claim button appears at 100 pts"]},
  {"name": "Diamond", "color": "#A8D8EA", "range": "200+ pts", "description": "Elite student status", "perks": ["Diamond badge with blue glow", "All Gold perks", "Top-tier recognition"]}
]'::jsonb),
('lesson_types', '[
  {"name": "Playing Lesson", "duration": "90–120 min", "description": "On-course playing instruction and strategy"},
  {"name": "Rango Lesson", "duration": "60 min", "description": "Driving range session — swing mechanics and drills"},
  {"name": "Video Analysis", "duration": "Async", "description": "Remote swing analysis via uploaded video"}
]'::jsonb);
