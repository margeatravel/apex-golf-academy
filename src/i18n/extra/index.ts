/**
 * Additive translation modules for the student portal.
 * Keys here are looked up BEFORE the main dictionary, so areas can be
 * localized file-by-file without touching translations.ts.
 */
import { home } from './home';
import { profile } from './profile';
import { media } from './media';
import { prozone } from './prozone';
import { misc } from './misc';
import { prozone2 } from './prozone2';
import { onboarding } from './onboarding';
import { adminMoney } from './adminMoney';

export const extraTranslations = {
  en: { home: home.en, profile: profile.en, media: media.en, prozone: prozone.en, prozone2: prozone2.en, misc: misc.en, onboarding: onboarding.en, money: adminMoney.en },
  es: { home: home.es, profile: profile.es, media: media.es, prozone: prozone.es, prozone2: prozone2.es, misc: misc.es, onboarding: onboarding.es, money: adminMoney.es },
} as Record<'en' | 'es', Record<string, any>>;
