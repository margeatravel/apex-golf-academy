import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { Loader2, Inbox, AlertTriangle } from 'lucide-react';

type RequestRow = {
  id: string;
  student_name: string;
  weekday: number;
  start_time: string;
  interval_weeks: number;
  effective_start: string;
  notes: string | null;
  conflicts_with: string[];
};

function fmtDate(iso: string, es: boolean): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(es ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' });
}

/**
 * Coach view of students' priority spot requests (specific day/time/cadence).
 * Approve creates the recurring slot + lessons server-side; Reject notifies
 * the student. Hidden when there are no pending requests.
 */
export function PrioritySpotRequestsPanel({ coachId }: { coachId: string | null }) {
  const { language, t } = useLanguage();
  const es = language === 'es';
  const weekdays = t('misc.notifDayNames').split(',');
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['priority-spot-requests', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('priority-spots', {
        body: { action: 'requests', coachId },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      return ((data as any)?.requests ?? []) as RequestRow[];
    },
  });

  const cadenceLabel = (n: number) =>
    n === 1 ? (es ? 'Semanal' : 'Weekly') : es ? `Cada ${n} semanas` : `Every ${n} weeks`;

  const decide = async (r: RequestRow, decision: 'approve' | 'reject') => {
    setBusyId(r.id);
    try {
      const { data, error } = await supabase.functions.invoke('priority-spots', {
        body: { action: 'decide', id: r.id, decision },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || error?.message || 'error');
      toast({
        title: decision === 'approve'
          ? (es ? 'Horario aprobado' : 'Spot approved')
          : (es ? 'Solicitud rechazada' : 'Request rejected'),
        description: `${r.student_name} · ${weekdays[r.weekday]} ${fmtSlotTime(r.start_time)}`,
      });
      qc.invalidateQueries({ queryKey: ['priority-spot-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
    } catch (e: any) {
      toast({ title: es ? 'No se pudo' : 'Could not complete', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading || requests.length === 0) return null;

  return (
    <div className="glass-card p-4 sm:p-5" style={{ borderColor: 'rgba(240,192,64,0.35)' }}>
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-gold-accent" />
        <p className="text-ivory font-heading font-semibold">
          {es ? 'Solicitudes de horario' : 'Spot requests'} ({requests.length})
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-ivory font-semibold">{r.student_name}</p>
            <p className="text-ivory/70 text-sm">
              {weekdays[r.weekday]} · {fmtSlotTime(r.start_time)} · {cadenceLabel(r.interval_weeks)} ·{' '}
              {es ? 'desde' : 'from'} {fmtDate(r.effective_start, es)}
            </p>
            {r.notes && <p className="text-ivory/50 text-xs mt-1">“{r.notes}”</p>}
            {r.conflicts_with.length > 0 && (
              <p className="text-amber-300 text-xs mt-1 inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {es ? 'Choca con' : 'Conflicts with'}: {r.conflicts_with.join(', ')}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() => decide(r, 'approve')}
                disabled={busyId === r.id || r.conflicts_with.length > 0}
                className="bg-gold-accent text-black hover:bg-gold-accent/90"
              >
                {busyId === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {es ? 'Aprobar' : 'Approve'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(r, 'reject')} disabled={busyId === r.id}>
                {es ? 'Rechazar' : 'Reject'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
