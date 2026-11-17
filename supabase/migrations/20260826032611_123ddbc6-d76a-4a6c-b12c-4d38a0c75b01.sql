CREATE TABLE IF NOT EXISTS public.notification_settings (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  label text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read notification settings"
ON public.notification_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update notification settings"
ON public.notification_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_settings (id, enabled, label, description)
VALUES ('pro_zone_video', true, 'Nuevo video en Pro Zone', 'Avisa a los alumnos cuando se publica un video nuevo.')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_pro_zone_media_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.is_active, true) = false THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE((SELECT enabled FROM public.notification_settings WHERE id = 'pro_zone_video'), true) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.broadcast_notifications (type, title, body, link_url, audience, metadata)
  VALUES (
    'pro_zone_video',
    'Nuevo video en Pro Zone',
    COALESCE(NULLIF(NEW.title, ''), NEW.caption, 'Nuevo contenido disponible'),
    CASE WHEN NEW.category IS NOT NULL AND NEW.category <> ''
         THEN '/pro-zone/' || NEW.category
         ELSE '/pro-zone' END,
    'pro_zone',
    jsonb_build_object('media_id', NEW.id, 'category', NEW.category)
  );

  RETURN NEW;
END;
$function$;