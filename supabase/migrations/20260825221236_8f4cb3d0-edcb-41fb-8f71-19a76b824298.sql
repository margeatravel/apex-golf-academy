CREATE TABLE public.broadcast_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  audience text NOT NULL DEFAULT 'pro_zone',
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.broadcast_notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.broadcast_notifications TO authenticated;
GRANT ALL ON public.broadcast_notifications TO service_role;

ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read broadcasts"
  ON public.broadcast_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert broadcasts"
  ON public.broadcast_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update broadcasts"
  ON public.broadcast_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete broadcasts"
  ON public.broadcast_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX broadcast_notifications_created_at_idx
  ON public.broadcast_notifications (created_at DESC);

CREATE TABLE public.broadcast_notification_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.broadcast_notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_notification_reads TO authenticated;
GRANT ALL ON public.broadcast_notification_reads TO service_role;

ALTER TABLE public.broadcast_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own broadcast reads"
  ON public.broadcast_notification_reads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own broadcast reads"
  ON public.broadcast_notification_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own broadcast reads"
  ON public.broadcast_notification_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own broadcast reads"
  ON public.broadcast_notification_reads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_pro_zone_media_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.is_active, true) = false THEN
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
$$;

CREATE TRIGGER trg_pro_zone_media_notify
AFTER INSERT ON public.pro_zone_media
FOR EACH ROW EXECUTE FUNCTION public.notify_pro_zone_media_published();

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_notifications;