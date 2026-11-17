import { useLanguage } from '@/contexts/LanguageContext';
import type { Language } from '@/i18n/translations';

/** Single source of truth for Intl locales across the student portal. */
export function localeFor(language: Language): 'es-MX' | 'en-US' {
  return language === 'es' ? 'es-MX' : 'en-US';
}

/** Hook version: `const locale = useUiLocale();` */
export function useUiLocale(): 'es-MX' | 'en-US' {
  const { language } = useLanguage();
  return localeFor(language);
}

/** Currency in MXN, localized. */
export function formatMoney(amount: number, language: Language): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(amount);
}
