import { supabase } from '@/integrations/supabase/client';

// Default title for an untitled video: the lesson's position within its
// package (e.g. "Clase 8" / "Class 8"). Returns null when the lesson has no
// package, so callers fall back to the file name.
export async function lessonClassNumberLabel(
  lessonId: string | null | undefined,
  language: string
): Promise<string | null> {
  if (!lessonId) return null;

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, package_id, lesson_date, lesson_time')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson?.package_id) return null;

  const { data: pkgLessons } = await supabase
    .from('lessons')
    .select('id, lesson_date, lesson_time')
    .eq('package_id', lesson.package_id)
    .neq('status', 'cancelled')
    .order('lesson_date', { ascending: true })
    .order('lesson_time', { ascending: true });

  const rows = (pkgLessons || []) as Array<{ id: string; lesson_date: string; lesson_time: string | null }>;
  if (rows.length === 0) return null;

  const idx = rows.findIndex((r) => r.id === lessonId);
  const position =
    idx >= 0
      ? idx + 1
      : rows.filter(
          (r) =>
            `${r.lesson_date} ${r.lesson_time || ''}` <
            `${lesson.lesson_date} ${lesson.lesson_time || ''}`
        ).length + 1;

  return `${language === 'es' ? 'Clase' : 'Class'} ${position}`;
}
