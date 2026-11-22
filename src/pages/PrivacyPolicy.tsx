import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { ApexBrand } from '@/components/ApexBrand';

/**
 * Public privacy notice — no auth required.
 * Route: /privacidad (registered without ProtectedRoute in App.tsx).
 */
export default function PrivacyPolicy() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-ivory">
      {/* Ambient glows — same language as the auth page */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-green-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] rounded-full bg-gold-accent/5 blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* Brand bar */}
        <div className="sticky top-0 z-20 backdrop-blur-md bg-black/30 border-b border-white/5 px-6 md:px-10 py-4 flex items-center gap-3">
          <ApexBrand size="md" glow taglineHiddenOnMobile />
        </div>

        <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm text-ivory/60 hover:text-gold-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>

          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-accent/30 bg-gold-accent/10 px-3 py-1 text-xs font-medium text-gold-accent">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacidad
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Aviso de Privacidad de Margea Golf Academy
            </h1>
            <p className="text-sm text-ivory/50">
              Última actualización: 1 de noviembre de 2026
            </p>
          </header>

          <section className="glass-card p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gold-accent">1. Responsable de tus datos</h2>
            <p className="text-sm leading-relaxed text-ivory/80">
              El responsable del tratamiento de tus datos personales es <strong>Margea Golf Academy</strong>,
              con domicilio en Puerto Cancún, Cancún, Quintana Roo, México. Para cualquier asunto
              relacionado con este aviso puedes escribirnos a{' '}
              <a href="mailto:admin@margeatravel.com" className="text-gold-accent hover:underline">
                admin@margeatravel.com
              </a>.
            </p>
          </section>

          <section className="glass-card p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gold-accent">2. Datos que recopilamos</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-ivory/80">
              <li>Nombre y correo electrónico de tu cuenta.</li>
              <li>Datos de tus clases: horarios, paquetes, notas del coach y asistencia.</li>
              <li>Rondas y estadísticas de juego que registras (scores, handicap, campos).</li>
              <li>Videos de tus clases y análisis de swing que subes o que el coach comparte contigo.</li>
              <li>Información de pagos, procesada de forma segura por Stripe; nosotros no almacenamos los datos completos de tu tarjeta.</li>
            </ul>
          </section>

          <section className="glass-card p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gold-accent">3. Para qué usamos tus datos</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-ivory/80">
              <li>Operar tu cuenta, tus reservas, paquetes y calendario de clases.</li>
              <li>Dar seguimiento a tu progreso: reportes de avance, estadísticas y handicap.</li>
              <li>Procesar pagos, suscripciones y canjes de puntos.</li>
              <li>Enviarte notificaciones transaccionales sobre tus clases, pagos y cuenta.</li>
              <li>Mejorar la experiencia y el funcionamiento de la plataforma.</li>
            </ul>
          </section>

          <section className="glass-card p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gold-accent">4. Con quién compartimos tus datos</h2>
            <p className="text-sm leading-relaxed text-ivory/80">
              <strong>Nunca vendemos tus datos personales.</strong> Solo los compartimos con los
              proveedores estrictamente necesarios para operar el servicio:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-ivory/80">
              <li><strong>Stripe</strong>, para procesar pagos y suscripciones de forma segura.</li>
              <li><strong>Supabase</strong>, como infraestructura de base de datos, autenticación y almacenamiento.</li>
              <li><strong>Resend</strong>, para el envío de correos transaccionales.</li>
            </ul>
          </section>

          <section className="glass-card p-6 space-y-3 border border-gold-accent/20">
            <h2 className="text-lg font-semibold text-gold-accent">5. Datos de Google Calendar</h2>
            <p className="text-sm leading-relaxed text-ivory/80">
              Si decides conectar tu Google Calendar, la aplicación accede únicamente al calendario
              que tú autorizas, con el único fin de mostrar y crear eventos de tus clases.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-ivory/80">
              <li>Puedes desconectar tu calendario en cualquier momento desde tus Ajustes.</li>
              <li>Los datos de Google no se venden, no se usan para publicidad ni para entrenar modelos de inteligencia artificial.</li>
              <li>No compartimos los datos de tu calendario con terceros, salvo lo estrictamente necesario para operar esta función.</li>
              <li>
                El uso de la información recibida de las APIs de Google cumple con la{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-accent hover:underline"
                >
                  Política de Datos de Usuario de los Servicios de API de Google
                </a>
                , incluidos los requisitos de Uso Limitado.
              </li>
            </ul>
          </section>

          <section className="glass-card p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gold-accent">6. Tus derechos: acceso, corrección y eliminación</h2>
            <p className="text-sm leading-relaxed text-ivory/80">
              Puedes solicitar el acceso, la corrección o la eliminación de tus datos personales en
              cualquier momento escribiéndonos a{' '}
              <a href="mailto:admin@margeatravel.com" className="text-gold-accent hover:underline">
                admin@margeatravel.com
              </a>
              . Atenderemos tu solicitud a la brevedad y te confirmaremos cuando se haya completado.
            </p>
          </section>

          <p className="text-center text-xs text-ivory/40 pt-4">
            Margea Golf Academy · Puerto Cancún, Cancún, Quintana Roo, México
          </p>
        </div>
      </div>
    </div>
  );
}
