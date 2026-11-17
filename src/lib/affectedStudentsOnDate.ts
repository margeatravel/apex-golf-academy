import { supabase } from '@/integrations/supabase/client';

export type AffectedStudent = {
  student_id: string;
  name: string;
  email: string;
  time: string; // "HH:MM"
  source: 'lesson' | 'recurring';
  parent_emails?: string[];
};

/** Weekday (0=Sun) of a 'YYYY-MM-DD' date, evaluated in America/Cancun. */
export function weekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

/** Long Spanish date in America/Cancun, e.g. "lunes 24 de agosto de 2026". */
export function formatSpanishDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00-05:00`).toLocaleDateString('es-MX', {
    timeZone: 'America/Cancun',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTime12(t: string): string {
  const [hh, mm] = (t || '').split(':');
  const h = parseInt(hh || '0', 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm ?? '00'} ${ampm}`;
}

/**
 * Students impacted by blocking a full day for a coach:
 *  - a lesson that day with status <> 'cancelled'
 *  - an active recurring_lesson_slot falling on that weekday
 * Deduplicated by student id (lesson wins over recurring projection).
 */
export async function getAffectedStudentsOnDate(
  coachId: string,
  dateStr: string,
): Promise<AffectedStudent[]> {
  const weekday = weekdayOfDate(dateStr);

  // Live Calendar is the source of truth: only real lesson rows that day,
  // excluding skipped/cancelled occurrences (recurring students who skip
  // that week are not notified; one-off bookings are).
  void weekday;
  const { data: lessons } = await supabase
    .from('lessons')
    .select('student_id, lesson_time, status, skipped')
    .eq('coach_id', coachId)
    .eq('lesson_date', dateStr)
    .neq('status', 'cancelled');

  const byStudent = new Map<string, AffectedStudent>();
  ((lessons ?? []) as any[]).forEach((l) => {
    if (!l.student_id || l.skipped) return;
    if (byStudent.has(l.student_id)) return;
    byStudent.set(l.student_id, {
      student_id: l.student_id,
      name: '',
      email: '',
      time: String(l.lesson_time || '').slice(0, 5),
      source: 'lesson',
    });
  });

  const ids = Array.from(byStudent.keys());
  if (ids.length === 0) return [];

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);
  (profs ?? []).forEach((p: any) => {
    const row = byStudent.get(p.id);
    if (row) {
      row.name = p.full_name || p.email || 'Alumno';
      row.email = p.email || '';
    }
  });

  const { data: links } = await supabase
    .from('family_links')
    .select('parent_user_id, child_user_id')
    .in('child_user_id', ids);
  const pids = [...new Set((links ?? []).map((l: any) => l.parent_user_id))];
  if (pids.length) {
    const { data: parents } = await supabase.from('profiles').select('id, email').in('id', pids);
    const em = new Map((parents ?? []).map((p: any) => [p.id, p.email]));
    (links ?? []).forEach((l: any) => {
      const e = em.get(l.parent_user_id);
      const row = byStudent.get(l.child_user_id);
      if (!row || !e || e.endsWith('@placeholder.sc')) return;
      row.parent_emails = [...new Set([...(row.parent_emails ?? []), e])];
    });
  }

  return Array.from(byStudent.values()).sort((a, b) => a.time.localeCompare(b.time));
}
