/**
 * Demo Mode only: the fake payment concepts/descriptions in demoData.ts are
 * written in Spanish. When the portal is in English (or to normalise the ES
 * wording) we map them through the translation dictionary so a demo shown to
 * another coach reads fully in the selected language.
 *
 * Real data is never touched — unknown strings are returned unchanged.
 */
const MAP: Record<string, string> = {
  'clase suelta': 'money.demoSingleLesson',
  'playing lesson': 'money.demoPlayingLesson',
  'clase en campo': 'money.demoPlayingLesson',
  'clase individual': 'money.demoIndividualLesson',
  'individual lesson': 'money.demoIndividualLesson',
  'paquete de clases': 'money.demoLessonPackage',
  'lesson package': 'money.demoLessonPackage',
};

export function localizeDemoText(
  t: (key: string) => string,
  value: string | null | undefined,
): string {
  if (!value) return value ?? '';
  const key = MAP[value.trim().toLowerCase()];
  if (key) return t(key);
  // "Suscripción Pro" / "Subscription Pro" → keep the plan name, translate the noun.
  const m = value.match(/^(Suscripci[oó]n|Subscription)\s+(.+)$/i);
  if (m) return `${t('money.demoSubscription')} ${m[2]}`;
  return value;
}
