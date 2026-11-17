CREATE TABLE public.membership_plan_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  badge_label_es text,
  badge_label_en text,
  name_es text NOT NULL,
  name_en text NOT NULL,
  tagline_es text,
  tagline_en text,
  benefits_included jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits_excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits_included_en jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits_excluded_en jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlight_note_es text,
  highlight_note_en text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.membership_plan_content TO authenticated;
GRANT ALL ON public.membership_plan_content TO service_role;

ALTER TABLE public.membership_plan_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read plan content"
ON public.membership_plan_content FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Coaches and admins manage plan content"
ON public.membership_plan_content FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'coach'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'coach'::app_role));

INSERT INTO public.membership_plan_content
(slug, sort_order, badge_label_es, badge_label_en, name_es, name_en, tagline_es, tagline_en, benefits_included, benefits_included_en, benefits_excluded, benefits_excluded_en)
VALUES
('free', 1, NULL, NULL, 'Gratis', 'Free',
 'Reserva clases y explora la academia', 'Book lessons and explore the academy',
 '["Reserva clases individuales","Acceso básico de programación","Precio estándar de clases","Apex AI Coach — incluido en todos los planes"]'::jsonb,
 '["Book individual lessons","Basic scheduling access","Standard lesson pricing","Apex AI Coach — included in every plan"]'::jsonb,
 '["Pro Zone — biblioteca de la academia de tu Coach","Ejercicios, estrategia y videos de entrenamiento por categoría","Subida de videos de swing","Horario prioritario con tu Coach","Acceso a clases en cancha / de juego"]'::jsonb,
 '["Pro Zone — your Coach''s academy library","Drills, strategy and training videos by category","Swing video uploads","Priority scheduling with your Coach","Access to on-course / playing lessons"]'::jsonb),
('scratch', 2, 'Excelente para empezar', 'Great to get started', 'Scratch', 'Scratch',
 'La membresía digital principal para golfistas comprometidos', 'The core digital membership for committed golfers',
 '["Acceso completo a la plataforma","Acceso a Pro Zone — 15 categorías de videos y fotos","Agarre, putt, driver, hierros, bunker, juego mental y más","Nuevo contenido de la academia agregado regularmente por tu Coach","Sube videos de swing para revisión (aplica costo)","Agenda clases estándar en cualquier momento","Retroalimentación prioritaria del Coach","Horario prioritario con tu Coach","Apex AI Coach — incluido en todos los planes"]'::jsonb,
 '["Full platform access","Pro Zone access — 15 video and photo categories","Grip, putting, driver, irons, bunker, mental game and more","New academy content added regularly by your Coach","Upload swing videos for review (fee applies)","Book standard lessons anytime","Priority Coach feedback","Priority scheduling with your Coach","Apex AI Coach — included in every plan"]'::jsonb,
 '["Mejor precio de clases","Acceso a clases en cancha / de juego","Análisis de video mensual incluido"]'::jsonb,
 '["Best lesson pricing","Access to on-course / playing lessons","Monthly video analysis included"]'::jsonb),
('pro', 3, 'Mejor valor', 'Best value', 'Pro', 'Pro',
 'Acceso premium con el mejor precio de clases y privilegios en cancha', 'Premium access with the best lesson pricing and on-course privileges',
 '["Todo lo de Scratch","Mejor precio de clases disponible","Biblioteca completa de Pro Zone — todas las categorías, todos los ejercicios","Acceso prioritario a nuevo contenido de Pro Zone","Acceso a clases en cancha / de juego","1 subida de video + análisis incluido mensualmente","Apex AI Coach — guía y ejercicios de IA personalizados","Programación prioritaria y soporte premium"]'::jsonb,
 '["Everything in Scratch","Best available lesson pricing","Full Pro Zone library — every category, every drill","Priority access to new Pro Zone content","Access to on-course / playing lessons","1 video upload + analysis included monthly","Apex AI Coach — personalized AI guidance and drills","Priority scheduling and premium support"]'::jsonb,
 '[]'::jsonb, '[]'::jsonb),
('apex_level', 4, 'Cupos Limitados', 'Limited Spots', 'Apex Level', 'Apex Level',
 'Coaching personal completo, dentro y fuera de la cancha — cupos limitados', 'Complete personal coaching, on and off the course — limited spots',
 '["Clases ilimitadas con tu Coach","Análisis de swing en video ilimitado","Almacenamiento ilimitado para subida de videos de swing","Preparación para torneos y planes de juego","Sesiones de práctica guiadas en el campo de práctica","Programación de práctica y planificación semanal","Coaching de gimnasio y nutrición","Coaching mental (psicología deportiva)","Acceso ilimitado a Apex AI Coach","Todo lo incluido en Pro"]'::jsonb,
 '["Unlimited lessons with your Coach","Unlimited video swing analysis","Unlimited storage for swing video uploads","Tournament preparation and game plans","Guided practice sessions at the range","Practice scheduling and weekly planning","Gym and nutrition coaching","Mental coaching (sports psychology)","Unlimited Apex AI Coach access","Everything included in Pro"]'::jsonb,
 '[]'::jsonb, '[]'::jsonb);