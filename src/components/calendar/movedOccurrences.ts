import { supabase } from '@/integrations/supabase/client';

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

/**
 * A recurring occurrence edited "for this week only" to another weekday keeps
 * its recurring_slot_id but lives on a different date. Returns keys
 * `${originalDate}|${slotId}` whose default projection must be hidden: the
 * slot's own weekday inside the same Mon–Sun week as the moved lesson.
 */
export async function fetchMovedOccurrenceKeys(
  recurring: Array<{ id: string; weekday: number }>,
  startDate: string,
  endDate: string,
  coachId: string | null,
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (!recurring.length) return keys;
  const wdById = new Map(recurring.map((r) => [r.id, r.weekday]));
  let q = supabase
    .from('lessons')
    .select('lesson_date, recurring_slot_id')
    .not('recurring_slot_id', 'is', null)
    .gte('lesson_date', addDays(startDate, -7))
    .lte('lesson_date', addDays(endDate, 7));
  if (coachId) q = q.eq('coach_id', coachId);
  const { data } = await q;
  for (const l of (data as any[]) || []) {
    const slotWd = wdById.get(l.recurring_slot_id);
    if (slotWd === undefined || !l.lesson_date) continue;
    const d = parse(l.lesson_date);
    const lessonWd = d.getDay();
    if (lessonWd === slotWd) continue;
    const mondayOffset = (lessonWd + 6) % 7; // days since Monday
    const slotOffset = (slotWd + 6) % 7;
    keys.add(`${addDays(l.lesson_date, slotOffset - mondayOffset)}|${l.recurring_slot_id}`);
  }
  return keys;
}
