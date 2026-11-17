import { Languages } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  /**
   * Visual variant.
   * - `pill`   : pill with a globe icon (drawer / settings rows).
   * - `inline` : compact segmented `EN / ES` (drawer rows next to a label).
   * - `header` : ultra-compact segmented pill sized to sit between the
   *              notification bell and the avatar in the top app bar.
   */
  variant?: 'pill' | 'inline' | 'header';
  className?: string;
}

/**
 * EN / ES toggle. Pure presentation — flips the language stored in
 * LanguageContext (which persists to localStorage). Does not touch
 * Supabase, routing, or auth.
 */
export function LanguageToggle({ variant = 'pill', className }: LanguageToggleProps) {
  const { language, setLanguage, t } = useLanguage();

  if (variant === 'header') {
    return (
      <div
        role="group"
        aria-label={t('language.switchTo')}
        className={cn(
          'inline-flex items-center h-9 rounded-full p-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
          className,
        )}
        style={{
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        {(['en', 'es'] as const).map((lang) => {
          const active = language === lang;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              aria-pressed={active}
              aria-label={lang === 'en' ? t('language.english') : t('language.spanish')}
              className={cn(
                'h-8 min-w-[2rem] rounded-full px-2 transition-colors',
                active
                  ? 'bg-gold-accent text-black shadow-sm'
                  : 'text-ivory/55 hover:text-ivory',
              )}
            >
              {lang.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        role="group"
        aria-label={t('language.switchTo')}
        className={cn(
          'inline-flex items-center rounded-full border border-white/15 bg-white/5 p-0.5 text-[11px] font-semibold uppercase tracking-wider',
          className,
        )}
      >
        {(['en', 'es'] as const).map((lang) => {
          const active = language === lang;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              aria-pressed={active}
              className={cn(
                'min-w-[2.25rem] rounded-full px-2 py-1 transition-colors',
                active
                  ? 'bg-gold-accent text-black'
                  : 'text-ivory/70 hover:text-ivory',
              )}
            >
              {lang.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('language.switchTo')}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2 py-1',
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5 text-ivory/60" aria-hidden />
      {(['en', 'es'] as const).map((lang) => {
        const active = language === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={active}
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              active
                ? 'bg-gold-accent text-black'
                : 'text-ivory/70 hover:text-ivory',
            )}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}