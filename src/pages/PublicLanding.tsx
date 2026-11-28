import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, CalendarDays, ShieldCheck, Sparkles, Video } from 'lucide-react';
import { ApexBrand } from '@/components/ApexBrand';

/**
 * Public landing page for logged-out visitors — no auth required.
 * Route: "/" when there is no session (see RoleHome in App.tsx).
 *
 * This page is what Google's OAuth brand verification reviews: it must name
 * the app ("Margea Golf Academy") and explain what it does without logging in.
 */
export default function PublicLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-ivory">
      {/* Ambient glows — same language as the auth page */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-green-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-48 w-[500px] h-[500px] rounded-full bg-gold-accent/5 blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* Brand bar */}
        <header className="sticky top-0 z-20 backdrop-blur-md bg-black/30 border-b border-white/5 px-6 md:px-10 py-4 flex items-center justify-between gap-3">
          <ApexBrand size="md" glow taglineHiddenOnMobile />
          <Link
            to="/auth"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gold-accent px-4 py-2 text-sm font-semibold text-black hover:bg-gold-accent/90 transition-colors"
          >
            Iniciar sesión
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-14 md:py-20 space-y-14">
          {/* Hero */}
          <section className="space-y-5 text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              Margea Golf Academy
            </h1>
            <p className="text-lg text-ivory/80 leading-relaxed">
              La academia de golf en Puerto Cancún, Cancún. Reserva clases con tu coach,
              analiza tu swing con inteligencia artificial y sigue tu progreso clase a clase.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full bg-gold-accent px-6 py-3 text-sm font-semibold text-black hover:bg-gold-accent/90 transition-colors"
              >
                Iniciar sesión
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-ivory hover:bg-white/5 transition-colors"
              >
                Cómo funciona
              </a>
            </div>
          </section>

          {/* What it does */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card p-6 space-y-2">
              <CalendarDays className="h-6 w-6 text-gold-accent" />
              <h2 className="text-lg font-semibold">Reserva tus clases</h2>
              <p className="text-sm leading-relaxed text-ivory/70">
                Reserva clases individuales o con tu paquete, elige tu horario y a tu coach,
                y lleva el control de tus clases restantes.
              </p>
            </div>
            <div className="glass-card p-6 space-y-2">
              <Video className="h-6 w-6 text-gold-accent" />
              <h2 className="text-lg font-semibold">Análisis de swing con IA</h2>
              <p className="text-sm leading-relaxed text-ivory/70">
                Sube un video de tu swing o usa uno de tus clases y recibe retroalimentación
                al instante: puntos fuertes, errores y ejercicios recomendados.
              </p>
            </div>
            <div className="glass-card p-6 space-y-2">
              <BarChart3 className="h-6 w-6 text-gold-accent" />
              <h2 className="text-lg font-semibold">Pro Zone y progreso</h2>
              <p className="text-sm leading-relaxed text-ivory/70">
                Rondas, biblioteca de videos y estadísticas en la Pro Zone, además de reportes
                de avance de tu coach después de cada clase.
              </p>
            </div>
            <div className="glass-card p-6 space-y-2">
              <Sparkles className="h-6 w-6 text-gold-accent" />
              <h2 className="text-lg font-semibold">Tu calendario, sincronizado</h2>
              <p className="text-sm leading-relaxed text-ivory/70">
                Conecta tu Google Calendar y tus clases aparecen ahí automáticamente.
                Puedes desconectarlo cuando quieras desde tus Ajustes.
              </p>
            </div>
          </section>

          {/* How it works */}
          <section id="como-funciona" className="glass-card p-6 md:p-8 space-y-4">
            <h2 className="text-xl font-bold">Cómo funciona</h2>
            <ol className="space-y-3 text-sm leading-relaxed text-ivory/80 list-decimal pl-5">
              <li>
                <strong className="text-ivory">Crea tu cuenta</strong> con tu correo electrónico
                e inicia sesión.
              </li>
              <li>
                <strong className="text-ivory">Elige tu paquete</strong> de clases o reserva una
                clase individual con tu coach.
              </li>
              <li>
                <strong className="text-ivory">Entrena y sigue tu progreso</strong> con reportes,
                videos y estadísticas en un solo lugar.
              </li>
            </ol>
          </section>

          {/* Trust + privacy */}
          <section className="text-center space-y-3">
            <p className="inline-flex items-center gap-2 text-sm text-ivory/60">
              <ShieldCheck className="h-4 w-4 text-gold-accent" />
              Tus datos están protegidos. Nunca los vendemos.
            </p>
            <p className="text-sm">
              <Link to="/privacidad" className="text-gold-accent hover:underline">
                Aviso de Privacidad
              </Link>
              <span className="text-ivory/40"> · </span>
              <a href="mailto:admin@margeatravel.com" className="text-gold-accent hover:underline">
                admin@margeatravel.com
              </a>
            </p>
          </section>
        </main>

        <footer className="border-t border-white/5 px-6 py-6 text-center text-xs text-ivory/40">
          Margea Golf Academy · Puerto Cancún, Cancún, Quintana Roo, México
        </footer>
      </div>
    </div>
  );
}
