import type { Language } from '@/i18n/translations';

/**
 * Translate the raw `lesson_type` stored in the DB (English tokens like
 * "Range", "Playing Lesson", "Swing Analysis", "Field Lesson", "Campo",
 * "Blocked") into the currently-active UI language.
 *
 * Falls back to the original string when there is no mapping so custom
 * lesson types configured by the coach still display verbatim.
 */
const ES_MAP: Record<string, string> = {
  'Range': 'Tiro de práctica',
  'Driving Range': 'Tiro de práctica',
  'Playing Lesson': 'Clase en campo',
  'Field Lesson': 'Clase en campo',
  'Campo': 'Clase en campo',
  'Swing Analysis': 'Análisis de Swing',
  'Blocked': 'Bloqueado',
  'Individual': 'Individual',
  'individual': 'Individual',
  'playing_lesson': 'Clase en campo',
};

export function translateLessonType(type: string | null | undefined, language: Language): string {
  if (!type) return '';
  if (language === 'es') return ES_MAP[type] ?? type;
  return type;
}