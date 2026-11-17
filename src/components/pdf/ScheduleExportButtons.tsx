import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAssignedStudentIds } from '@/hooks/useAssignedStudentIds';
import { getCancunToday } from '@/lib/cancunDate';
import { buildTablePdf, downloadBlob } from '@/lib/scheduleExportPdf';
import { toast } from 'sonner';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hm = (t?: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
};

async function profileNames(ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
  (data ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.email || '—'));
  return map;
}

/** PDF of lessons given (completed) within a chosen date range. */
export function LessonsGivenPdfButton() {
  const { isOwner, studentIds } = useAssignedStudentIds();
  const today = getCancunToday();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!from || !to || from > to) { toast.error('Rango de fechas inválido'); return; }
    setBusy(true);
    try {
      if (!isOwner && (!studentIds || !studentIds.length)) { toast.info('No hay clases en ese rango'); return; }
      let q = supabase.from('lessons')
        .select('lesson_date, lesson_time, lesson_type, duration_minutes, student_id')
        .eq('status', 'completed').gte('lesson_date', from).lte('lesson_date', to)
        .order('lesson_date').order('lesson_time');
      if (!isOwner && studentIds) q = q.in('student_id', studentIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) { toast.info('No hay clases dadas en ese rango'); return; }
      const names = await profileNames([...new Set(rows.map((r: any) => r.student_id).filter(Boolean))]);
      const blob = buildTablePdf({
        title: 'Clases dadas',
        subtitle: `Del ${from} al ${to}`,
        columns: [{ label: 'Fecha', width: 28 }, { label: 'Hora', width: 24 }, { label: 'Alumno', width: 72 }, { label: 'Tipo', width: 38 }, { label: 'Min', width: 20 }],
        rows: rows.map((r: any) => [r.lesson_date, hm(r.lesson_time), names.get(r.student_id) ?? '—', r.lesson_type ?? '', String(r.duration_minutes ?? '')]),
        footer: `Total: ${rows.length} clases`,
      });
      downloadBlob(blob, `clases-dadas_${from}_${to}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF');
    } finally { setBusy(false); }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2"><FileDown className="h-4 w-4" />PDF clases dadas</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2">
        <label className="text-xs">Desde</label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs">Hasta</label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button className="w-full gap-2" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Descargar PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** PDF of the coach's active weekly recurring schedule. */
export function RecurringSchedulePdfButton() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      let q = supabase.from('recurring_lesson_slots').select('*').eq('is_active', true);
      if (user?.id) q = q.eq('coach_id', user.id);
      const { data, error } = await q.order('weekday').order('start_time');
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) { toast.info('No hay horarios recurrentes'); return; }
      const names = await profileNames([...new Set(rows.map((r: any) => r.student_id))]);
      const order = (w: number) => (w + 6) % 7; // Monday first
      rows.sort((a: any, b: any) => order(a.weekday) - order(b.weekday) || a.start_time.localeCompare(b.start_time));
      const blob = buildTablePdf({
        title: 'Horario recurrente',
        subtitle: `Generado ${getCancunToday()}`,
        columns: [{ label: 'Día', width: 28 }, { label: 'Hora', width: 22 }, { label: 'Alumno', width: 62 }, { label: 'Tipo', width: 32 }, { label: 'Frecuencia', width: 38 }],
        rows: rows.map((r: any) => [
          DAYS[r.weekday], hm(r.start_time), names.get(r.student_id) ?? '—', r.lesson_type ?? '',
          (r.interval_weeks > 1 ? `Cada ${r.interval_weeks} semanas` : 'Semanal') + (r.paused_until ? ' (pausa)' : ''),
        ]),
        footer: `Total: ${rows.length} horarios`,
      });
      downloadBlob(blob, `horario-recurrente_${getCancunToday()}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF');
    } finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant="outline" className="gap-2" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF horario
    </Button>
  );
}
