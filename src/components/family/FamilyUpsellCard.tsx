import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const ACCENT = '#F0C040';

/**
 * Compact subscription upsell shown on /family to viewers WITHOUT a paid plan
 * who were linked by someone else: they keep read-only access to the list,
 * but inviting requires a membership. Presentation only.
 */
export function FamilyUpsellCard() {
  const { t } = useLanguage();

  return (
    <section
      className="rounded-2xl px-4 py-4 border backdrop-blur-md flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${ACCENT}33` }}
    >
      <div
        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center"
        style={{ background: `${ACCENT}22` }}
      >
        <Sparkles className="h-4 w-4" style={{ color: ACCENT }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ivory">{t('misc.familyUpsellTitle')}</p>
        <p className="text-xs text-ivory/60 mt-0.5">{t('misc.familyUpsellSubtitle')}</p>
      </div>
      <Link
        to="/plans"
        className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-[#0d1f18] text-center"
        style={{ background: ACCENT }}
      >
        {t('misc.familyTeaserCta')}
      </Link>
    </section>
  );
}
