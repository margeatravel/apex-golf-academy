import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getTranslation, type Language } from '@/i18n/translations';

const STORAGE_KEY = 'sc-golf-language';
const DEFAULT_LANGUAGE: Language = 'es';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** Translate a dotted key path, e.g. t('dashboard.nextLesson'). */
  t: (key: string) => string;
}

/**
 * Safe fallback so a component rendered before/outside the provider (e.g.
 * during a hot-reload remount) degrades gracefully instead of crashing the app.
 */
const fallbackValue: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string) => getTranslation(DEFAULT_LANGUAGE, key),
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

/**
 * Read the stored language preference safely (SSR/edge-safe).
 * Falls back to the default if anything goes wrong.
 */
function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    /* ignore — privacy mode etc. */
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  // Persist to localStorage whenever it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    // Mirror to <html lang="..."> so screen readers + browser UI follow.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'en' ? 'es' : 'en'));
  }, []);

  const t = useCallback(
    (key: string) => getTranslation(language, key),
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Hook to read the current language and the t() helper.
 * Falls back to the default (English) values when no provider is mounted,
 * so a transient render outside the tree can never blank the screen.
 */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) ?? fallbackValue;
}