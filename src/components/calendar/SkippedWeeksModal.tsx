import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatLessonDate, formatLessonTime } from '@/lib/formatLessonDateTime';

const WEEKDAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SkippedWeeksModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [studentFilter, setStudentFilter] = useState<string>('all');
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['skipped-weeks', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data: lessons, error } = await supabase
        .from('lessons')
        .select('id, student_id, recurring_slot_id, lesson_date, lesson_time, lesson_start_at')
        .eq('coach_id', user!.id)
        .eq('skipped', true)
        .not('recurring_slot_id', 'is', null)
        .order('lesson_date', { ascending: true });
      if (error) throw error;

      const slotIds = Array.from(new Set((lessons || []).map((l: any) => l.recurring_slot_id).filter(Boolean)));
      const studentIds = Array.from(new Set((lessons || []).map((l: any) => l.student_id).filter(Boolean)));
      const [slotsRes, profilesRes] = await Promise.all([
        slotIds.length
          ? supabase.from('recurring_lesson_slots').select('id, weekday, start_time, duration_minutes, lesson_type, is_active').in('id', slotIds)
          : Promise.resolve({ data: [], error: null } as any),
        studentIds.length
          ? supabase.from('profiles').select('id, full_name, email').in('id', studentIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      const slotById = new Map((slotsRes.data || []).map((s: any) => [s.id, s]));
      const profById = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

      // Group by recurring_slot_id
      const grouped = new Map<string, any>();
      for (const l of lessons || []) {
        const key = l.recurring_slot_id!;
        if (!grouped.has(key)) {
          const slot: any = slotById.get(key);
          const prof: any = profById.get(l.student_id);
          grouped.set(key, {
            recurring_slot_id: key,
            student_id: l.student_id,
            student_name: prof?.full_name || prof?.email || 'Alumno',
            weekday: slot?.weekday,
            start_time: slot?.start_time,
            duration_minutes: slot?.duration_minutes,
            lesson_type: slot?.lesson_type,
            is_active: slot?.is_active,
            skipped_lesson_ids: [] as string[],
            skipped_dates: [] as string[],
            first_date: l.lesson_date,
            last_date: l.lesson_date,
          });
        }
        const g = grouped.get(key)!;
        g.skipped_lesson_ids.push(l.id);
        g.skipped_dates.push(l.lesson_date);
        if (l.lesson_date < g.first_date) g.first_date = l.lesson_date;
        if (l.lesson_date > g.last_date) g.last_date = l.lesson_date;
      }
      return Array.from(grouped.values()).sort((a, b) => (a.first_date || '').localeCompare(b.first_date || ''));
    },
  });

  const students = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r: any) => { if (r.student_id) seen.set(r.student_id, r.student_name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(
    () => (studentFilter === 'all' ? rows : rows.filter((r: any) => r.student_id === studentFilter)),
    [rows, studentFilter],
  );

  const totalCount = rows.reduce((acc: number, r: any) => acc + r.skipped_lesson_ids.length, 0);

  const reactivate = async (row: any) => {
    if (!confirm(`Reactivar ${row.skipped_lesson_ids.length} clase(s) skipped de ${row.student_name}?`)) return;
    setReactivatingId(row.recurring_slot_id);
    const { error } = await supabase
      .from('lessons')
      .update({ skipped: false, skipped_at: null, skip_keep_closed: null })
      .in('id', row.skipped_lesson_ids);
    setReactivatingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Clases reactivadas.');
    await refetch();
    qc.invalidateQueries({ queryKey: ['master-calendar-week'] });
    qc.invalidateQueries({ queryKey: ['admin-all-lessons'] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#0d1f18] border-white/10 text-[#F5F0E8]">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#F5F0E8]">
            Skipped Weeks {totalCount > 0 && <span className="text-sm text-[#F5F0E8]/60 ml-2">({totalCount})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-[#F5F0E8]/60">Filtrar por alumno:</span>
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="h-8 w-[240px] bg-white/5 border-white/10 text-[#F5F0E8] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1f18] border-white/10 text-[#F5F0E8]">
              <SelectItem value="all">Todos</SelectItem>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-[#F5F0E8]/70 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#F5F0E8]/60">
            No hay clases skipped.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-[#F5F0E8]/60">
                <tr>
                  <th className="text-left px-3 py-2">Estudiante</th>
                  <th className="text-left px-3 py-2">Día / Hora</th>
                  <th className="text-left px-3 py-2">Primera</th>
                  <th className="text-left px-3 py-2">Última</th>
                  <th className="text-right px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.recurring_slot_id} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.student_name}</div>
                      <div className="text-[11px] text-[#F5F0E8]/50">
                        {r.skipped_lesson_ids.length} skipped
                        {r.is_active === false && <span className="ml-1 text-[#F0C040]">· slot inactivo</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {typeof r.weekday === 'number' ? WEEKDAYS[r.weekday] : '—'}{' '}
                      {r.start_time ? formatLessonTime({ lesson_time: r.start_time }) : ''}
                    </td>
                    <td className="px-3 py-2 text-[#F5F0E8]/80">
                      {r.first_date ? formatLessonDate({ lesson_date: r.first_date }, 'short') : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#F5F0E8]/80">
                      {r.last_date ? formatLessonDate({ lesson_date: r.last_date }, 'short') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reactivatingId === r.recurring_slot_id}
                        onClick={() => reactivate(r)}
                        className="h-8 text-xs border-[#4a7c59]/60 text-[#F5F0E8] hover:bg-[#4a7c59]/25"
                      >
                        {reactivatingId === r.recurring_slot_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reactivate</>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}