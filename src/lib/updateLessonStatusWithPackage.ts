import { supabase } from '@/integrations/supabase/client';

export type RetroLessonStatus = 'completed' | 'no_show' | 'cancelled';

/**
 * Change the lesson status only. The database trigger is the sole owner of
 * package-credit accounting, keeping the lesson and package update atomic.
 */
export async function updateLessonStatusWithPackage(
  lesson: { id: string; status?: string | null; package_id?: string | null; lesson_type?: string | null },
  newStatus: RetroLessonStatus,
) {
  const { error } = await supabase
    .from('lessons')
    .update({ status: newStatus as any })
    .eq('id', lesson.id);
  if (error) throw error;
}
