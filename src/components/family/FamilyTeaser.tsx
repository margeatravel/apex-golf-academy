import { Link } from 'react-router-dom';
import { Users, Video, TrendingUp, Sparkles, Lock, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlanColors, resolvePlanColor } from '@/hooks/usePlanColors';

/** Number of static placeholder tiles in the decorative "locked videos" wall. */
const WALL_TILES = 9;

/**
 * Conversion teaser shown on /family to viewers without a paid plan.
 * Presentation only — no data, queries or family logic involved.
 */
export function FamilyTeaser({ linkedCount = 0 }: { linkedCount?: number }) {
  const count = Math.max(0, linkedCount || 0);

  const { effectivePlan } = useAuth();
  const { t } = useLanguage();
  const colors = usePlanColors();
  const isFreeLike = effectivePlan === 'free' || effectivePlan === 'member';
  const accent = isFreeLike ? '#F0C040' : resolvePlanColor(colors, effectivePlan) || '#F0C040';

  const bullets = [
    { icon: Users, key: 'misc.familyTeaserB1' },
    { icon: Video, key: 'misc.familyTeaserB2' },
    { icon: TrendingUp, key: 'misc.familyTeaserB3' },
  ];

  return (
    <div className="relative isolate overflow-hidden rounded-2xl px-2 py-8 sm:px-8 sm:py-10">
      {/* Decorative "locked videos" wall — static placeholders, non-interactive */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 select-none"
        style={{ filter: 'blur(7px)', opacity: 0.68 }}
      >
        <div className="absolute inset-0 grid grid-cols-2 content-center gap-3 p-1 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: WALL_TILES }).map((_, i) => (
            <div
              key={i}
              className="relative aspect-video rounded-xl border shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${accent}14 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.02) 100%)`,
                borderColor: i % 3 === 1 ? `${accent}33` : 'rgba(255,255,255,0.10)',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border"
                  style={{ background: 'rgba(255,255,255,0.06)', borderColor: `${accent}44` }}
                >
                  <Play className="h-3.5 w-3.5" style={{ color: `${accent}aa` }} />
                </div>
              </div>
              <Lock className="absolute right-2 top-2 h-3 w-3" style={{ color: `${accent}66` }} />
            </div>
          ))}
        </div>
        {/* Fade the wall toward the edges so the teaser card stays the focus */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 64% 68% at 50% 48%, rgba(13,31,24,0.28) 0%, rgba(13,31,24,0.52) 58%, rgba(13,31,24,0.86) 100%)',
          }}
        />
      </div>

      <section
        className="glass-card relative z-10 mx-auto max-w-xl rounded-2xl px-5 py-7 text-center"
        style={{ borderColor: `${accent}55` }}
      >
      {count > 0 ? (
        <>
          <div className="text-5xl font-bold leading-none" style={{ color: accent }}>{count}</div>
          <h2 className="mt-2 text-lg font-semibold text-ivory">
            {t('misc.familyTeaserCountTitle').replace('{n}', String(count))}
          </h2>
          <p className="mt-2 text-sm text-ivory/65 max-w-md mx-auto">{t('misc.familyTeaserCountSubtitle')}</p>
        </>
      ) : (
        <>
          <div
            className="mx-auto mb-4 h-14 w-14 rounded-full flex items-center justify-center"
            style={{ background: `${accent}26`, border: `1px solid ${accent}55` }}
          >
            <Users className="h-6 w-6" style={{ color: accent }} />
          </div>

          <h2 className="text-lg font-semibold text-ivory">{t('misc.familyTeaserTitle')}</h2>
          <p className="mt-2 text-sm text-ivory/65 max-w-md mx-auto">{t('misc.familyTeaserSubtitle')}</p>
        </>
      )}


      <div className="mt-5 space-y-2 text-left max-w-md mx-auto">
        {bullets.map(({ icon: Icon, key }) => (
          <div key={key} className="glass-card-sm flex items-start gap-3 rounded-xl px-3 py-2.5">
            <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
            <p className="text-sm text-ivory/80">{t(key)}</p>
          </div>
        ))}
      </div>

      <Link
        to="/plans"
        className="mt-6 inline-flex items-center justify-center gap-2 w-full max-w-xs rounded-xl px-5 py-3 text-sm font-semibold transition hover:opacity-90"
        style={{ background: accent, color: '#12241c' }}
      >
        <Sparkles className="h-4 w-4" />
        {t('misc.familyTeaserCta')}
      </Link>

      <p className="mt-3 text-xs text-ivory/45">{t('misc.familyTeaserFoot')}</p>
      </section>
    </div>
  );
}
