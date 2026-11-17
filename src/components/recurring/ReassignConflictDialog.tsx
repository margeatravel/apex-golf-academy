import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HourPicker } from '@/components/HourPicker';
import { Loader2 } from 'lucide-react';
import {
  WEEKDAYS_SHORT_LABEL,
  fmtTime12h,
  findRecurringMoveConflictSlots,
  type RecurringConflictSlot,
} from '@/lib/pendingRecurringMove';
import { getSlotDurationMinutes, timeToMinutes } from '@/components/calendar/calendarTypes';

export type ReassignChoice =
  | { kind: 'swap' }
  | { kind: 'move'; weekday: number; startTime: string }
  | { kind: 'remove' };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conflict: RecurringConflictSlot | null;
  editedSlotId: string;
  /** Original day/time of the slot being edited (swap target). */
  originalWeekday: number;
  originalStartTime: string;
  /** New day/time of the edited slot (option b must not overlap it). */
  newWeekday: number;
  newStartTime: string;
  newDurationMinutes: number;
  newLessonType: string;
  coachId: string | null;
  effectiveDate: string;
  busy?: boolean;
  onConfirm: (choice: ReassignChoice) => void;
}

const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function ReassignConflictDialog(p: Props) {
  const [mode, setMode] = useState<'swap' | 'move' | 'remove'>('swap');
  const [wd, setWd] = useState('1');
  const [time, setTime] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (p.open && p.conflict) {
      setMode('swap');
      setWd(String(p.conflict.weekday));
      setTime('');
      setErr(null);
    }
  }, [p.open, p.conflict]);

  if (!p.conflict) return null;
  const c = p.conflict;
  const name = c.studentName;
  const when = `${WEEKDAYS_SHORT_LABEL[c.weekday]} ${fmtTime12h(c.startTime)}`;

  const confirm = async () => {
    setErr(null);
    if (mode === 'swap') return p.onConfirm({ kind: 'swap' });
    if (mode === 'remove') return p.onConfirm({ kind: 'remove' });
    if (!time) return setErr('Elige una hora.');
    const weekday = parseInt(wd, 10);
    // Must not overlap the edited slot's new position.
    if (weekday === p.newWeekday) {
      const s = timeToMinutes(time);
      const e = s + getSlotDurationMinutes({ duration_minutes: c.durationMinutes, lesson_type: c.lessonType });
      const s2 = timeToMinutes(p.newStartTime.substring(0, 5));
      const e2 = s2 + getSlotDurationMinutes({ duration_minutes: p.newDurationMinutes, lesson_type: p.newLessonType });
      if (s < e2 && s2 < e) return setErr('Ese horario choca con el nuevo horario del slot que estás editando.');
    }
    setChecking(true);
    try {
      const clashes = await findRecurringMoveConflictSlots({
        slotId: c.slotId,
        excludeSlotIds: [p.editedSlotId],
        weekday,
        startTime: time,
        durationMinutes: c.durationMinutes,
        lessonType: c.lessonType,
        coachId: p.coachId,
        effectiveDate: p.effectiveDate,
        intervalWeeks: c.intervalWeeks,
        intervalAnchor: c.intervalAnchor,
      });
      if (clashes.length > 0) {
        setErr(
          `Ese horario también está ocupado: ${clashes
            .map((x) => `${x.studentName} · ${WEEKDAYS_SHORT_LABEL[x.weekday]} ${fmtTime12h(x.startTime)}`)
            .join(', ')}.`,
        );
        return;
      }
      p.onConfirm({ kind: 'move', weekday, startTime: time });
    } finally {
      setChecking(false);
    }
  };

  const opt = (key: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={`w-full text-left rounded-md border px-3 py-2 text-sm ${
        mode === key ? 'border-primary bg-primary/10' : 'border-border'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AlertDialog open={p.open} onOpenChange={p.onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Horario ocupado</AlertDialogTitle>
          <AlertDialogDescription>
            Este horario es de {name} ({when}). ¿Qué hacemos con {name}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          {opt('swap', `Intercambiar: ${name} pasa a ${WEEKDAYS_SHORT_LABEL[p.originalWeekday]} ${fmtTime12h(p.originalStartTime)}`)}
          {opt('move', 'Mover a otro horario')}
          {mode === 'move' && (
            <div className="grid grid-cols-2 gap-2 pl-2">
              <div className="space-y-1">
                <Label className="text-xs">Día</Label>
                <Select value={wd} onValueChange={setWd}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS_ES.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hora</Label>
                <HourPicker value={time} onChange={setTime} className="w-full" />
              </div>
            </div>
          )}
          {opt('remove', 'Quitar horario fijo')}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)} disabled={p.busy || checking}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={p.busy || checking}>
            {(p.busy || checking) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
