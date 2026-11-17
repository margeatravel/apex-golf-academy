import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MessageCircle,
  ClipboardList,
  CalendarCheck,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { usePlanColors, resolvePlanColor } from '@/hooks/usePlanColors';

/** Static placeholder bubbles for the decorative blurred conversation. */
const BUBBLES: { role: 'user' | 'ai'; text: string }[] = [
  { role: 'user', text: '¿Qué debo corregir en mi swing?' },
  { role: 'ai', text: 'Tu prioridad esta semana: alinear la cara del palo en el impacto…' },
  { role: 'user', text: 'Arma un plan de práctica de 1 semana' },
  { role: 'ai', text: 'Semana 1 · Lunes: 30 min de putting. Miércoles: wedges de 50–75 yds…' },
];

/**
 * Conversion teaser shown at /ai-coach to viewers without Apex AI access.
 * Mirrors the real chat screen (same dark backdrop + header) with a blurred
 * placeholder conversation behind a glass upsell card. Presentation only —
 * no data, queries or AI calls involved.
 */
export function ApexAiTeaser() {
  const navigate = useNavigate();
  const { effectivePlan } = useAuth();
  const { t } = useLanguage();
  const colors = usePlanColors();
  const isFreeLike = effectivePlan === 'free' || effectivePlan === 'member';
  const accent = isFreeLike ? '#F0C040' : resolvePlanColor(colors, effectivePlan) || '#F0C040';

  const bullets = [
    { icon: MessageCircle, key: 'misc.aiTeaserB1' },
    { icon: ClipboardList, key: 'misc.aiTeaserB2' },
    { icon: CalendarCheck, key: 'misc.aiTeaserB3' },
  ];

  return (
    <div
      className="fixed inset-0 lg:left-60 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)', color: '#F5F0E8' }}
    >
      {/* Header — same layout as the real chat screen */}
      <div
        className="flex items-center justify-between px-4 pb-3 border-b border-white/10 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-[#F5F0E8]/70 hover:text-[#F5F0E8]"
            aria-label={t('prozone2.aiCoach.backToDashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Sparkles className="h-5 w-5" style={{ color: '#F0C040' }} />
          <span className="font-semibold text-[#F5F0E8]">Apex AI</span>
        </div>
        <LanguageToggle variant="header" />
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-y-auto">
        {/* Decorative blurred conversation — static placeholders, non-interactive */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 select-none"
          style={{ filter: 'blur(6px)', opacity: 0.55 }}
        >
          <div className="mx-auto max-w-2xl space-y-3 px-4 py-8">
            {BUBBLES.map((b, i) => (
              <div key={i} className={b.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm border shadow-lg"
                  style={
                    b.role === 'user'
                      ? { background: '#F0C040', color: '#1a2b1a', borderColor: 'rgba(255,255,255,0.10)' }
                      : {
                          background: 'rgba(255,255,255,0.05)',
                          borderColor: i % 2 === 0 ? `${accent}33` : 'rgba(255,255,255,0.08)',
                          color: 'rgba(245,240,232,0.75)',
                        }
                  }
                >
                  {b.text}
                </div>
              </div>
            ))}
          </div>
          {/* Fade toward the edges so the teaser card stays the focus */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 70% 70% at 50% 45%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.72) 55%, rgba(0,0,0,0.94) 100%)',
            }}
          />
        </div>

        {/* Upsell card */}
        <div className="relative z-10 flex min-h-full items-start justify-center px-3 py-10">
          <section
            className="glass-card w-full max-w-md rounded-2xl px-5 py-7 text-center backdrop-blur-xl"
            style={{ borderColor: `${accent}55` }}
          >
            <div
              className="mx-auto mb-4 h-14 w-14 rounded-full flex items-center justify-center"
              style={{ background: `${accent}26`, border: `1px solid ${accent}55` }}
            >
              <Sparkles className="h-6 w-6" style={{ color: accent }} />
            </div>

            <h2 className="text-lg font-semibold text-ivory">{t('misc.aiTeaserTitle')}</h2>
            <p className="mt-2 text-sm text-ivory/65">{t('misc.aiTeaserSubtitle')}</p>

            <div className="mt-5 space-y-2 text-left">
              {bullets.map(({ icon: Icon, key }) => (
                <div key={key} className="glass-card-sm flex items-start gap-3 rounded-xl px-3 py-2.5">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
                  <p className="text-sm text-ivory/80">{t(key)}</p>
                </div>
              ))}
            </div>

            <Link
              to="/plans"
              className="mt-6 inline-flex items-center justify-center gap-2 w-full rounded-xl px-5 py-3 text-sm font-semibold transition hover:opacity-90"
              style={{ background: accent, color: '#12241c' }}
            >
              <Sparkles className="h-4 w-4" />
              {t('misc.aiTeaserCta')}
            </Link>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3 text-ivory/40" />
              <p className="text-xs text-ivory/45">{t('misc.aiTeaserFoot')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
