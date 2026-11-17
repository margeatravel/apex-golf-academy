INSERT INTO public.academy_settings (key, value)
VALUES ('google_calendar_sync', jsonb_build_object('enabled', false, 'calendar_id', 'primary', 'connected_at', null))
ON CONFLICT (key) DO NOTHING;