// Shared helper for student-facing email gating + i18n.
// Read from academy_settings.key='student_emails'.

export type Lang = "es" | "en";

export type StudentEmailTemplateKey =
  | "welcome"
  | "lesson_booked"
  | "lesson_reminder"
  | "lesson_cancelled"
  | "lesson_skipped"
  | "package_added"
  | "package_completed"
  | "subscription_confirmed"
  | "priority_spot_claimed"
  | "feedback_added"
  | "analysis_submitted"
  | "video_uploaded"
  | "parent_access"
  | "family_invite"
  | "blocked_date";

export interface StudentEmailSettings {
  enabled: boolean;
  language: Lang;
  templates: Record<StudentEmailTemplateKey, boolean>;
  bccEmail: string;
  bcc: Record<StudentEmailTemplateKey, boolean>;
}

export const DEFAULT_BCC_EMAIL = "castilla.santi@gmail.com";

const DEFAULT_TEMPLATES: Record<StudentEmailTemplateKey, boolean> = {
  welcome: true,
  lesson_booked: true,
  lesson_reminder: true,
  lesson_cancelled: true,
  lesson_skipped: true,
  package_added: true,
  package_completed: true,
  subscription_confirmed: true,
  priority_spot_claimed: true,
  feedback_added: true,
  analysis_submitted: true,
  video_uploaded: true,
  parent_access: true,
  family_invite: true,
  blocked_date: true,
};

const DEFAULT_BCC: Record<StudentEmailTemplateKey, boolean> = Object.fromEntries(
  Object.keys(DEFAULT_TEMPLATES).map((k) => [k, true]),
) as Record<StudentEmailTemplateKey, boolean>;

export const DEFAULT_SETTINGS: StudentEmailSettings = {
  enabled: true,
  language: "es",
  templates: { ...DEFAULT_TEMPLATES },
  bccEmail: DEFAULT_BCC_EMAIL,
  bcc: { ...DEFAULT_BCC },
};

export async function getStudentEmailSettings(admin: any): Promise<StudentEmailSettings> {
  try {
    const { data } = await admin
      .from("academy_settings")
      .select("value")
      .eq("key", "student_emails")
      .maybeSingle();
    const v: any = data?.value;
    if (!v) return DEFAULT_SETTINGS;
    return {
      enabled: v.enabled !== false,
      language: v.language === "en" ? "en" : "es",
      templates: { ...DEFAULT_TEMPLATES, ...(v.templates || {}) },
      bccEmail: typeof v.bccEmail === "string" && v.bccEmail.trim()
        ? v.bccEmail.trim()
        : DEFAULT_BCC_EMAIL,
      bcc: { ...DEFAULT_BCC, ...(v.bcc || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function shouldSend(s: StudentEmailSettings, key: StudentEmailTemplateKey): boolean {
  if (!s.enabled) return false;
  return s.templates[key] !== false;
}

/** BCC recipients for a given template, or [] when BCC is off for it. */
export function bccList(s: StudentEmailSettings, key: StudentEmailTemplateKey): string[] {
  if (s.bcc[key] === false) return [];
  const addr = (s.bccEmail || "").trim();
  return addr ? [addr] : [];
}

// ============ i18n ============

type Strings = Record<string, { es: string; en: string }>;

const S: Strings = {
  // Common labels
  date: { es: "Fecha", en: "Date" },
  time: { es: "Hora", en: "Time" },
  type: { es: "Tipo", en: "Type" },
  duration: { es: "Duración", en: "Duration" },
  coach: { es: "Coach", en: "Coach" },
  location: { es: "Lugar", en: "Location" },
  status: { es: "Estado", en: "Status" },
  video: { es: "Video", en: "Video" },
  student: { es: "Alumno", en: "Student" },
  ready: { es: "Listo", en: "Ready" },
  view_lessons: { es: "Ver mis clases", en: "View My Lessons" },
  view_videos: { es: "Ver mis videos", en: "View My Videos" },
  go_dashboard: { es: "Ir a mi panel", en: "Go to Your Dashboard" },
  watch_video: { es: "Ver video", en: "Watch Video" },
  view_feedback: { es: "Ver feedback completo", en: "View Full Feedback" },
  explore_pro: { es: "Explorar Pro Zone", en: "Explore Pro Zone" },
  enter_account: { es: "Entrar a la cuenta", en: "Sign in to account" },
  santi: { es: "Santi Castilla", en: "Santi Castilla" },
  academy: { es: "Puerto Cancún Golf Club", en: "Puerto Cancún Golf Club" },
  lessons_remaining: { es: "Clases restantes", en: "Lessons remaining" },
  remaining_package: { es: "Restantes en el paquete", en: "Remaining in package" },
  lessons_available: { es: "Clases disponibles", en: "Lessons available" },
  ready_to_book: { es: "listas para reservar", en: "ready to book" },
  active_plan: { es: "Plan activo", en: "Active plan" },
  next_renewal: { es: "Próxima renovación", en: "Next renewal" },
  awaiting_review: { es: "Esperando revisión del coach", en: "Awaiting coach review" },
  expected_response: { es: "Respuesta esperada", en: "Expected response" },
  within_1_day: { es: "Dentro de 1 día hábil", en: "Within 1 business day" },
  your_recurring: { es: "Tu horario recurrente", en: "Your recurring time" },

  // Subjects
  subj_welcome: { es: "Bienvenido a SC Golf Academy 🏌️", en: "Welcome to SC Golf Academy 🏌️" },
  subj_lesson_booked: { es: "Tu clase está confirmada ✅", en: "Your lesson is confirmed ✅" },
  subj_lesson_cancelled: { es: "Tu clase fue cancelada ✅", en: "Your lesson has been cancelled ✅" },
  subj_lesson_skipped: { es: "Tu clase semanal se saltó ⏭", en: "Your weekly lesson was skipped ⏭" },
  subj_package_added: { es: "Paquete nuevo agregado a tu cuenta 🎟️", en: "New Package Added to Your Account 🎟️" },
  subj_package_completed: { es: "Terminaste tu paquete de clases ⛳", en: "You completed your lesson package ⛳" },
  subj_priority_spot: { es: "Tu horario fijo está confirmado 📌", en: "Your Priority Spot is locked in 📌" },
  subj_feedback: { es: "Tu coach dejó feedback en tu video 💬", en: "Your Coach Left Feedback on Your Video 💬" },
  subj_analysis: { es: "Tu video fue enviado a análisis 🎯", en: "Your video has been submitted for analysis 🎯" },
  subj_video_coach: { es: "Nuevo video agregado a tu cuenta 🎬", en: "New Video Added to Your Account! 🎬" },
  subj_video_self: { es: "Tu video se subió correctamente ✅", en: "Your Video Upload is Complete ✅" },
  subj_reminder: { es: "Recordatorio de tu clase de hoy ⛳", en: "Reminder of your lesson today ⛳" },

  // Reminder
  reminder_title: { es: "Recordatorio de tu clase de hoy", en: "Reminder of your lesson today" },
  reminder_subtitle: { es: "Nos vemos en el tiro de práctica", en: "See you on the range" },
  reminder_intro: {
    es: "Solo un recordatorio amistoso de tu clase de hoy con tu Coach. ¡Vamos a darle!",
    en: "Just a friendly reminder of your lesson today with your Coach. Let's go!",
  },
  reminder_close: {
    es: "¿Necesitas reagendar? Avísale a tu Coach lo antes posible.",
    en: "Need to reschedule? Let your Coach know as soon as possible.",
  },

  // Lesson booked
  booked_title: { es: "¡Reserva confirmada!", en: "Booking confirmed!" },
  booked_subtitle: { es: "Tu clase con tu Coach está en el calendario", en: "Your lesson with your Coach is on the calendar" },
  booked_intro: {
    es: "Tu clase quedó agendada. Aquí están los detalles — ¡nos vemos en el tiro de práctica!",
    en: "Your lesson is locked in. Here are the details — see you on the range!",
  },
  booked_close: {
    es: "¿Necesitas reagendar? Avísale a tu Coach directamente.",
    en: "Need to reschedule? Just message your Coach directly.",
  },

  // Lesson cancelled
  cancelled_title: { es: "Clase cancelada", en: "Lesson cancelled" },
  cancelled_subtitle: { es: "Tu crédito de clase fue devuelto al paquete", en: "Your lesson credit has been returned to your package" },
  cancelled_intro: {
    es: "Cancelamos tu próxima clase y agregamos 1 crédito de vuelta a tu paquete activo. El horario ya está libre para que otros alumnos lo reserven.",
    en: "We've cancelled your upcoming lesson and added 1 lesson credit back to your active package. The time slot is now open for other students to book.",
  },
  cancelled_date: { es: "Fecha cancelada", en: "Date cancelled" },
  cancelled_cta: { es: "Reservar otra clase", en: "Book another lesson" },
  cancelled_close: {
    es: "¿Cambiaste de opinión? Puedes reservar una nueva clase cuando quieras desde tu panel.",
    en: "Changed your mind? You can book a new lesson any time from your dashboard.",
  },

  // Lesson skipped
  skipped_title: { es: "Tu clase fue saltada esta semana", en: "Your lesson was skipped this week" },
  skipped_subtitle: { es: "Tu horario recurrente regresa la próxima semana", en: "Your recurring schedule resumes next week" },
  skipped_intro: {
    es: "Solo un aviso — tu Coach marcó tu clase recurrente como saltada esta semana. No tienes que hacer nada; tu horario semanal regresa al calendario la próxima semana como siempre.",
    en: "Just a heads up — your Coach marked your recurring lesson as skipped for this week. No action needed; your weekly spot will be back on the calendar next week as usual.",
  },
  skipped_date: { es: "Fecha saltada", en: "Date skipped" },
  skipped_close: {
    es: "¿Necesitas otra semana libre o quieres reservar una clase extra? Solo manda mensaje a tu Coach.",
    en: "Need a different week off, or want to book an extra session? Just message your Coach.",
  },

  // Welcome
  welcome_title: { es: "¡Bienvenido al equipo!", en: "Welcome to the Team!" },
  welcome_subtitle: { es: "Tu camino en el golf empieza ahora", en: "Your golf journey starts now" },
  welcome_intro: {
    es: "¡Bienvenido a <strong style=\"color:#EF9F27;\">SC Golf Academy</strong>! Soy tu Coach y me da mucho gusto tenerte aquí. Ya sea que apenas empieces o vayas tras un handicap de un dígito, vamos a armar un plan para llegar ahí.",
    en: "Welcome to <strong style=\"color:#EF9F27;\">SC Golf Academy</strong>! I'm your Coach, and I'm thrilled to have you on board. Whether you're brand new to the game or chasing a single-digit handicap, we'll build a plan that takes you there.",
  },
  welcome_get_started: { es: "Empieza aquí", en: "Get started" },
  welcome_li_book: { es: "📅 <strong>Reserva una clase</strong> con tu Coach desde la app", en: "📅 <strong>Book a lesson</strong> with your Coach from the app" },
  welcome_li_pro: { es: "⭐ <strong>Pro Zone</strong> — drills, tips y análisis del PGA (Scratch & Pro)", en: "⭐ <strong>Pro Zone</strong> — drills, tips, PGA breakdowns (Scratch & Pro)" },
  welcome_li_video: { es: "📹 Sube videos de tu swing para feedback personalizado", en: "📹 Upload swing videos for personal feedback" },
  welcome_li_stats: { es: "📊 Lleva tus stats, rondas y avance de handicap", en: "📊 Track your stats, rounds and handicap progress" },
  welcome_close: { es: "¡Nos vemos en el campo! ⛳<br/><strong style=\"color:#EF9F27;\">Tu Coach</strong>", en: "See you on the course! ⛳<br/><strong style=\"color:#EF9F27;\">Your Coach</strong>" },

  // Package added
  pkg_added_title: { es: "¡Paquete nuevo agregado!", en: "New Package Added!" },
  pkg_added_subtitle: { es: "Se agregó un paquete de clases a tu cuenta", en: "A lesson package was added to your account" },
  pkg_added_intro_pre: { es: "Buenas noticias — se acaba de agregar un nuevo paquete de", en: "Great news — a new" },
  pkg_added_intro_post: { es: "clases a tu cuenta de SC Golf Academy.", en: "lesson package was just added to your SC Golf Academy account." },
  pkg_added_close: {
    es: "¿Listo para reservar? Toca el botón amarillo <strong style=\"color:#EF9F27;\">\"Reservar clase\"</strong> en cualquier momento dentro de la app.",
    en: "Ready to book? Tap the yellow <strong style=\"color:#EF9F27;\">\"Book a Lesson\"</strong> button anytime in the app.",
  },

  // Package completed
  pkg_done_preheader_es: { es: "Completaste tu paquete. ¡Gracias por entrenar con nosotros!", en: "You completed your package. Thanks for training with us!" },
  pkg_done_title: { es: "¡Completaste tu paquete!", en: "You completed your package!" },
  pkg_done_intro_pre: { es: "Acabas de terminar", en: "You just finished" },
  pkg_done_intro_post: { es: ". ¡Gracias por seguir trabajando en tu juego con tu Coach!", en: ". Thanks for keeping up the work with your Coach!" },
  pkg_done_pkg_label: { es: "Paquete", en: "Package" },
  pkg_done_total: { es: "Clases totales", en: "Total lessons" },
  pkg_done_first: { es: "Primera clase", en: "First lesson" },
  pkg_done_last: { es: "Última clase", en: "Last lesson" },
  pkg_done_close: {
    es: "¿Listo para el siguiente paquete? Avísale a tu Coach para renovarlo y seguir avanzando.",
    en: "Ready for the next package? Let your Coach know to renew it and keep moving forward.",
  },
  pkg_name_prefix: { es: "Paquete del", en: "Package of" },
  your_package: { es: "Tu paquete", en: "Your package" },

  // Subscription
  sub_title: { es: "¡Tu membresía está activa!", en: "Your membership is active!" },
  sub_intro_pre: { es: "Gracias por hacerte miembro", en: "Thank you for becoming a" },
  sub_intro_post: { es: "Tu suscripción está activa y tienes acceso completo a todo lo que incluye.", en: "member! Your subscription is now active and you have full access to everything that comes with it." },
  sub_what: { es: "Qué tienes ahora", en: "What you now have access to" },
  sub_li_pro: { es: "⭐ <strong>Pro Zone</strong> — drills, tips y análisis del PGA exclusivos", en: "⭐ <strong>Pro Zone</strong> — exclusive drills, tips, PGA Tour breakdowns" },
  sub_li_feedback: { es: "📹 Feedback personalizado de tu swing por tu Coach", en: "📹 Personalized swing-video feedback from your Coach" },
  sub_li_priority: { es: "📅 Horario fijo — reclama un horario semanal recurrente", en: "📅 Priority Spot — claim a recurring weekly time" },
  sub_li_pro_perks: { es: "🎯 Pro perks: analytics más profundos, soporte premium, descuentos", en: "🎯 Pro perks: deeper analytics, premium support, member discounts" },
  sub_close: { es: "Puedes administrar o cancelar tu suscripción cuando quieras desde tu perfil.", en: "You can manage or cancel your subscription anytime from your profile." },

  // Priority spot
  spot_title: { es: "¡Tu horario fijo está confirmado!", en: "Your Priority Spot is locked in!" },
  spot_subtitle: { es: "Misma hora, todas las semanas — garantizado con tu Coach", en: "Same time, every week — guaranteed with your Coach" },
  spot_intro: {
    es: "Buenas noticias — reclamaste exitosamente tu horario fijo semanal. Este horario recurrente queda reservado solo para ti, sin pelear por la reserva.",
    en: "Great news — you've successfully claimed your weekly Priority Spot. This recurring time is now reserved exclusively for you, no booking battles required.",
  },
  spot_body: {
    es: "Ya cargamos las próximas 8 semanas de clases en tu calendario — las verás en <strong style=\"color:#EF9F27;\">Mis clases</strong>.",
    en: "We've already pre-loaded the next 8 weeks of lessons on your calendar — you'll see them in <strong style=\"color:#EF9F27;\">My Lessons</strong>.",
  },
  spot_close: {
    es: "¿Necesitas soltar o cambiar tu horario? Manda mensaje a tu Coach directamente.",
    en: "Need to release or change your spot? Just message your Coach directly.",
  },

  // Feedback
  fb_title: { es: "¡Nuevo feedback!", en: "New Feedback!" },
  fb_subtitle: { es: "Tu coach revisó tu video", en: "Your coach reviewed your video" },
  fb_intro_pre: { es: "Buenas noticias — revisé tu video", en: "Great news — I've reviewed your video" },
  fb_intro_post: { es: "y te dejé feedback detallado.", en: "and left detailed feedback for you." },
  fb_preview_label: { es: "Vista previa del coach", en: "Coach's preview" },
  fb_close: {
    es: "¡Sigue así! Cada sesión de práctica te acerca más a tus metas.",
    en: "Keep up the great work! Every practice session brings you closer to your goals.",
  },

  // Analysis submitted
  an_title: { es: "Tu video fue enviado a análisis", en: "Your video has been submitted for analysis" },
  an_subtitle: { es: "Tu Coach lo revisará en 1 día hábil", en: "Your Coach will review it within 1 business day" },
  an_intro: {
    es: "Gracias por enviar tu video de swing. Tu Coach lo revisará personalmente y te mandará feedback con notas y tips para mejorar.",
    en: "Thanks for submitting your swing video. Your Coach will review it personally and send back feedback with notes and tips to help you improve.",
  },
  an_close: { es: "¡Sigue dándole! ⛳<br/><strong style=\"color:#EF9F27;\">Tu Coach</strong>", en: "Keep swinging! ⛳<br/><strong style=\"color:#EF9F27;\">Your Coach</strong>" },

  // Video uploaded
  vid_coach_title: { es: "¡Nuevo video disponible!", en: "New Video Available!" },
  vid_self_title: { es: "¡Subida completa!", en: "Upload Complete!" },
  vid_coach_subtitle: { es: "Tu coach agregó un video nuevo", en: "Your coach added a new video" },
  vid_self_subtitle: { es: "Tu video se subió exitosamente", en: "Your video has been uploaded successfully" },
  vid_coach_intro: {
    es: "Subí un nuevo video a tu cuenta. Puede ser una grabación de clase, demostración de drill o análisis de tu swing.",
    en: "I've uploaded a new video to your account. This might be a lesson recording, drill demonstration, or analysis of your swing.",
  },
  vid_self_intro: {
    es: "Tu video se subió exitosamente y está listo para revisar.",
    en: "Your video has been uploaded successfully and is ready for review.",
  },
};

export function t(lang: Lang, key: keyof typeof S): string {
  return S[key][lang];
}

export function formatLessonType(lang: Lang, type?: string | null): string {
  if (!type) return "—";
  if (type === "Range") return lang === "es" ? "Tiro de práctica" : "Range";
  return type;
}

export function formatLessonDate(lang: Lang, dateStr?: string, timeStr?: string) {
  if (!dateStr) return { date: "", time: "" };
  const tStr = timeStr && timeStr.length >= 5 ? timeStr : "12:00";
  const iso = `${dateStr}T${tStr.length === 5 ? tStr + ":00" : tStr}-05:00`;
  const d = new Date(iso);
  const dateLocale = lang === "es" ? "es-MX" : "en-US";
  const date = new Intl.DateTimeFormat(dateLocale, {
    timeZone: "America/Cancun",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(d);
  const time = timeStr
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Cancun",
        hour: "numeric", minute: "2-digit", hour12: true,
      }).format(d)
    : "";
  return { date, time };
}

export function shortDate(lang: Lang, iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const locale = lang === "es" ? "es-MX" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "America/Cancun",
    day: "numeric", month: "long", year: "numeric",
  }).format(d);
}