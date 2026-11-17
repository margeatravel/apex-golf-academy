import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { getCancunToday } from '@/lib/cancunDate';
import { formatShortDate } from '@/lib/pendingRecurringMove';
import { useLanguage } from '@/contexts/LanguageContext';

const parseLocal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Only auto-generated, scheduled, non-skipped lessons of this slot in [today, until). */
const rangeQuery = (q: any, slotId: string, today: string, until: string) =>
  q.eq('recurring_slot_id', slotId)
    .eq('auto_generated', true)
    .eq('status', 'scheduled')
    .eq('skipped', false)
    .gte('lesson_date', today)
    .lt('lesson_date', until);

export function PauseSlotControl({ slot, onDone, className = '' }: { slot: any; onDone?: () => void; className?: string }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const qc = useQueryClient();
  const today = getCancunToday();
  const paused = slot?.paused_until ? String(slot.paused_until).substring(0, 10) : null;
  const isPaused = !!paused && paused > today;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    onDone?.();
    ['admin-all-lessons', 'upcoming-lessons', 'calendar-week'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
  const regen = () =>
    supabase.functions.invoke('generate-recurring-lessons', { body: { student_id: slot.student_id } });

  const choose = async (d?: Date) => {
    if (!d) return;
    const ymd = toYmd(d);
    setPick(ymd);
    setOpen(false);
    const { count: c } = await rangeQuery(
      supabase.from('lessons').select('id', { count: 'exact', head: true }), slot.id, today, ymd,
    );
    setCount(c ?? 0);
  };

  const confirm = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('recurring_lesson_slots').update({ paused_until: pick } as any).eq('id', slot.id);
      if (error) throw error;
      const { error: delErr } = await rangeQuery(supabase.from('lessons').delete(), slot.id, today, pick);
      if (delErr) throw delErr;
      await regen();
      toast({ title: en ? `Paused until ${formatShortDate(pick, 'en')}` : `Pausado hasta ${formatShortDate(pick, 'es')}` });
      refresh();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setPick(null);
    }
  };

  const resume = async () => {
    setBusy(true);
    const { error } = await supabase.from('recurring_lesson_slots').update({ paused_until: null } as any).eq('id', slot.id);
    if (!error) await regen();
    setBusy(false);
    toast(error ? { title: 'Error', description: error.message, variant: 'destructive' } : { title: en ? 'Resumed' : 'Reanudado' });
    refresh();
  };

  const chip = 'inline-flex items-center gap-0.5 rounded px-1 py-[1px] font-semibold normal-case tracking-normal shrink-0';

  if (isPaused) {
    return (
      <span className={`${chip} ${className}`} style={{ background: 'rgba(148,163,184,0.2)', color: '#cbd5e1', fontSize: 9 }}>
        <Pause className="h-2.5 w-2.5" />
        {en ? `Paused until ${formatShortDate(paused!, 'en')}` : `Pausado hasta ${formatShortDate(paused!, 'es')}`}
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); resume(); }}
          className="ml-1 inline-flex items-center gap-0.5 underline"
          style={{ color: '#F0C040' }}
        >
          <Play className="h-2.5 w-2.5" />
          {en ? 'Resume now' : 'Reanudar ahora'}
        </button>
      </span>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={`${chip} ${className}`}
            style={{ background: 'rgba(148,163,184,0.15)', color: '#cbd5e1', fontSize: 9 }}
          >
            <Pause className="h-2.5 w-2.5" />
            {en ? 'Pause until' : 'Pausar hasta'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
          <Calendar
            mode="single"
            selected={pick ? parseLocal(pick) : undefined}
            onSelect={choose}
            disabled={(d) => toYmd(d) <= today}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      <AlertDialog open={!!pick && count !== null} onOpenChange={(o) => { if (!o) { setPick(null); setCount(null); } }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {en ? `Pause until ${pick ? formatShortDate(pick, 'en') : ''}?` : `¿Pausar hasta ${pick ? formatShortDate(pick, 'es') : ''}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {en
                ? `${count} scheduled lesson(s) of this slot will be deleted. Completed, no-show, cancelled and manual lessons are kept.`
                : `Se borrarán ${count} clase(s) agendada(s) de este horario. Las completadas, no-show, canceladas y manuales se conservan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{en ? 'Cancel' : 'Cancelar'}</AlertDialogCancel>
            <Button onClick={confirm} disabled={busy}>{en ? 'Pause' : 'Pausar'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
