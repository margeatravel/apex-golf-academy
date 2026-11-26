import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HourPicker } from '@/components/HourPicker';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Student asks the Coach for a priority spot that isn't offered: a specific
 * start date (sets the weekday), time and frequency. Saved via the
 * priority-spots edge function; the Coach approves or rejects it.
 */
export function RequestPrioritySpotDialog({
  open,
  onOpenChange,
  onSent,
  canSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent: () => void;
  /** false in student preview: the session belongs to the Coach. */
  canSubmit: () => Promise<boolean>;
}) {
  const { language, t } = useLanguage();
  const es = language === 'es';
  const { toast } = useToast();
  const weekdays = t('misc.notifDayNames').split(',');
  const [date, setDate] = useState(tomorrowISO());
  const [time, setTime] = useState('09:00');
  const [interval, setIntervalWeeks] = useState(1);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const weekday = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return y ? new Date(y, m - 1, d).getDay() : null;
  })();
  const cadenceLabel = (n: number) =>
    n === 1 ? (es ? 'Semanal' : 'Weekly') : es ? `Cada ${n} semanas` : `Every ${n} weeks`;

  const submit = async () => {
    setSending(true);
    try {
      if (!(await canSubmit())) {
        throw new Error(es ? 'Vista previa: no se pueden enviar solicitudes.' : 'Preview mode: requests cannot be sent.');
      }
      const { data, error } = await supabase.functions.invoke('priority-spots', {
        body: { action: 'request', start_date: date, start_time: time, interval, notes: notes.trim() || null },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || error?.message || 'error');
      toast({
        title: es ? 'Solicitud enviada' : 'Request sent',
        description: es ? 'Tu Coach la revisará y te avisaremos.' : 'Your Coach will review it and you will be notified.',
      });
      setNotes('');
      onOpenChange(false);
      onSent();
    } catch (e: any) {
      toast({ title: es ? 'No se pudo enviar' : 'Could not send', description: e?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es ? 'Pedir un horario' : 'Request a spot'}</DialogTitle>
          <DialogDescription>
            {es
              ? '¿No ves el horario que necesitas? Pídeselo a tu Coach.'
              : "Don't see the time you need? Ask your Coach."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{es ? 'Primera clase' : 'First lesson'}</Label>
            <input
              type="date"
              value={date}
              min={tomorrowISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm"
            />
            {weekday != null && (
              <p className="text-xs opacity-70">{es ? 'Día' : 'Day'}: {weekdays[weekday]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{es ? 'Hora' : 'Time'}</Label>
            <HourPicker value={time} onChange={setTime} className="w-full" />
          </div>
          <div className="space-y-2">
            <Label>{es ? 'Frecuencia' : 'Frequency'}</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIntervalWeeks(n)}
                  className="px-3 py-1.5 rounded-full border text-sm"
                  style={interval === n
                    ? { background: '#F0C040', color: '#000', borderColor: '#F0C040' }
                    : { borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  {cadenceLabel(n)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{es ? 'Nota para tu Coach (opcional)' : 'Note for your Coach (optional)'}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            onClick={submit}
            disabled={sending || !date || !time}
            className="bg-gold-accent text-black hover:bg-gold-accent/90"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {es ? 'Enviar solicitud' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
