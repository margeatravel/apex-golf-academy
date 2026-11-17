import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VisibleRecurringSlot {
  id: string;
  student_id: string;
  student_name: string;
  weekday: number;
  start_time: string;
  duration_minutes: number | null;
  lesson_type: string | null;
  package_id: string | null;
  /** false → slot belongs to another member of a shared package (read-only). */
  is_own: boolean;
  /** First date the slot generates lessons (YYYY-MM-DD) or null. */
  starts_on?: string | null;
  /** Cadence in weeks (1 = weekly). Only resolved for slots the viewer can read. */
  interval_weeks?: number | null;
}

/**
 * Recurring ("Priority Spot") slots a student may SEE:
 * their own + every slot served by a SHARED package they own or belong to.
 *
 * Backed by the SECURITY DEFINER RPC `get_visible_recurring_slots`, which
 * enforces `auth.uid() = studentId OR can_preview_student(studentId)` and
 * resolves the slot→package link the same way generate-recurring-lessons does
 * (explicit `package_id`, else the owner's oldest active package).
 */
export function useVisibleRecurringSlots(studentId?: string | null) {
  const { data = [] } = useQuery({
    queryKey: ['visible-recurring-slots', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_visible_recurring_slots' as any, {
        _student_id: studentId!,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as VisibleRecurringSlot[];
      // The RPC doesn't return cadence; read it for the slots RLS lets us see.
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return rows;
      const { data: cad } = await supabase
        .from('recurring_lesson_slots')
        .select('id, interval_weeks')
        .in('id', ids);
      const byId = new Map(((cad as any[]) || []).map((c) => [c.id, c.interval_weeks]));
      return rows.map((r) => ({ ...r, interval_weeks: byId.get(r.id) ?? 1 }));
    },
  });
  return data as VisibleRecurringSlot[];
}
