import { useState, useEffect } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { HourPicker } from '@/components/HourPicker';
import { LessonDateRows, makeRow, toLocalISO, type DateRow } from '@/components/LessonDateRows';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { durationForLessonType } from '@/lib/lessonTypeDuration';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { addDemoOpenSpots } from '@/data/demoData';
import { useQueryClient } from '@tanstack/react-query';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional default day-of-week (0=Sun…6=Sat). Defaults to Monday. */
  defaultDay?: number;
  /** When provided (YYYY-MM-DD, Cancun local), the modal defaults to the one-time mode. */
  defaultDate?: string | null;
  /** Optional default start hour (HH:mm) for the first row when opened from a cell. */
  defaultTime?: string | null;
  /** When false (Live Calendar), the weekly/recurring modality is hidden and the modal is one-time only. */
  allowWeekly?: boolean;
  onSpotAdded?: () => void;
}

type SpotMode = 'one_time' | 'weekly';

function fmtLongDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  const s = dt.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fromISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/**
 * Posts OPEN time spots (no student assigned) to `fixed_schedule_slots`.
 * Two modes:
 *  • one_time — one open spot per date+hour row (`specific_date`).
 *  • weekly   — the original recurring behaviour (one row per selected weekday).
 */
export function AddOpenSpotModal({ open, onOpenChange, defaultDay = 1, defaultDate = null, defaultTime = null, allowWeekly = true, onSpotAdded }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<SpotMode>(!allowWeekly || defaultDate ? 'one_time' : 'weekly');
  const [rows, setRows] = useState<DateRow[]>([
    makeRow('Range', defaultDate ? fromISO(defaultDate) : undefined, defaultTime ?? ''),
  ]);
  const [selectedDays, setSelectedDays] = useState<number[]>([defaultDay]);
  const [startTime, setStartTime] = useState('09:00');
  const [lessonType, setLessonType] = useState('Range');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(!allowWeekly || defaultDate ? 'one_time' : 'weekly');
      setRows([makeRow('Range', defaultDate ? fromISO(defaultDate) : undefined, defaultTime ?? '')]);
      setSelectedDays([defaultDay]);
      setStartTime('09:00');
      setLessonType('Range');
      setNotes('');
    }
  }, [open, defaultDay, defaultDate, defaultTime, allowWeekly]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const oneTime = mode === 'one_time';
  const completeRows = rows.filter((r) => r.date && r.time);
  const incompleteRows = rows.filter((r) => !r.date || !r.time);

  const handleSave = async () => {
    const demo = isDemoModeActive();
    if (!demo && !user?.id) return;
    if (oneTime && completeRows.length === 0) {
      toast({ title: 'Agrega al menos una fecha con hora', variant: 'destructive' });
      return;
    }
    if (!oneTime && selectedDays.length === 0) {
      toast({ title: 'Pick at least one day', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const weeklyTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      // Duration is derived from each row's lesson type (shared source of
      // truth in src/lib/lessonTypeDuration.ts), never chosen manually.
      const base = {
        notes: notes.trim() || null,
      };
      const insertBase = oneTime
        ? completeRows.map((r) => {
            const iso = toLocalISO(r.date!);
            return {
              ...base,
              start_time: r.time.length === 5 ? `${r.time}:00` : r.time,
              lesson_type: r.lessonType,
              duration_minutes: durationForLessonType(r.lessonType),
              day_of_week: r.date!.getDay(),
              specific_date: iso,
            };
          })
        : selectedDays.map((day_of_week) => ({
            ...base,
            start_time: weeklyTime,
            lesson_type: lessonType,
            duration_minutes: durationForLessonType(lessonType),
            day_of_week,
            specific_date: null,
          }));

      if (!demo) {
        for (const r of insertBase as any[]) {
          const c = r.specific_date
            ? (await findSlotConflicts({
                dateStr: r.specific_date,
                time: String(r.start_time).slice(0, 5),
                durationMinutes: r.duration_minutes,
                lessonType: r.lesson_type,
                coachId: user!.id,
              })).map((x) => x.label)
            : await findWeeklySlotConflicts({
                weekday: r.day_of_week,
                time: String(r.start_time).slice(0, 5),
                durationMinutes: r.duration_minutes,
                lessonType: r.lesson_type,
                coachId: user!.id,
              });
          if (c.length > 0) throw new Error(`Choca con ${c.join(', ')}. No se guardó.`);
        }
      }

      if (demo) {
        addDemoOpenSpots(insertBase as any);
        queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
        queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
        queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
      } else {
        const insertRows = insertBase.map((r) => ({ ...r, student_id: null, created_by: user!.id, coach_id: user!.id, is_available: true }));
        const { data: inserted, error } = await supabase
          .from('fixed_schedule_slots')
          .insert(insertRows as any)
          .select('specific_date, start_time');
        if (error) throw error;
        if (oneTime) {
          const key = (d: string, t: string) => `${d} ${String(t).slice(0, 5)}`;
          const createdSet = new Set((inserted ?? []).map((r: any) => key(r.specific_date, r.start_time)));
          const missing = insertBase.filter((r: any) => !createdSet.has(key(r.specific_date, r.start_time)));
          if (missing.length > 0) {
            toast({
              title: 'Algunos horarios no se crearon',
              description: `No creados: ${missing.map((r: any) => `${r.specific_date} ${String(r.start_time).slice(0, 5)}`).join(', ')}`,
              variant: 'destructive',
            });
          }
        }
      }

      if (oneTime && incompleteRows.length > 0) {
        toast({
          title: `${incompleteRows.length} fila(s) omitida(s)`,
          description: 'Se ignoraron las filas sin fecha o sin hora.',
        });
      }

      toast({
        title: oneTime
          ? (insertBase.length > 1 ? `${insertBase.length} horarios publicados` : 'Open spot posted')
          : selectedDays.length > 1 ? `${selectedDays.length} open spots posted` : 'Open spot posted',
        description: oneTime
          ? insertBase.map((r: any) => `${fmtLongDate(r.specific_date)} · ${fmtSlotTime(r.start_time)}`).join(' | ')
          : `${selectedDays.map((d) => WEEKDAYS_SHORT[d]).join(', ')} at ${fmtSlotTime(weeklyTime)} · subscribed students can now claim.`,
      });
      onSpotAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to post spot', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{oneTime ? 'Publicar un horario abierto' : 'Post an open recurring spot'}</DialogTitle>
          <DialogDescription>
            {oneTime
              ? 'Publica horarios únicos por fecha y hora, sin alumno asignado. Los miembros Scratch y Pro podrán reclamarlos — una vez reclamado desaparece para los demás.'
              : 'Publish a weekly time spot with no student assigned. Scratch and Pro members will see it in their Priority Spot and can claim it — once claimed, it\u2019s theirs and disappears for everyone else.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Modality segmented control — hidden when the Live Calendar forces one-time */}
          {allowWeekly && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-ivory/15 bg-ivory/5">
            {([
              ['one_time', 'Solo esta fecha'],
              ['weekly', 'Cada semana'],
            ] as [SpotMode, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={
                  'h-9 rounded-md text-xs font-medium transition-colors ' +
                  (mode === value
                    ? 'bg-[#4a7c59] text-ivory'
                    : 'text-ivory/70 hover:text-ivory')
                }
              >
                {label}
              </button>
            ))}
          </div>
          )}

          {!oneTime && (
          <div className="space-y-2">
            <Label className="text-xs">Days of week *</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS_FULL.map((full, value) => {
                const active = selectedDays.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={
                      'h-10 rounded-md text-xs font-medium border transition-colors ' +
                      (active
                        ? 'bg-[#4a7c59] text-ivory border-[#4a7c59]'
                        : 'bg-transparent text-ivory/70 border-ivory/20 hover:border-ivory/40')
                    }
                    aria-pressed={active}
                    title={full}
                  >
                    {WEEKDAYS_SHORT[value]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedDays.length === 0
                ? 'Pick one or more days'
                : `${selectedDays.length} day${selectedDays.length > 1 ? 's' : ''} selected — one open spot per day will be posted`}
            </p>
          </div>
          )}

          {/* Weekly mode keeps its global start time; duration is derived per lesson type */}
          {!oneTime && (
            <div className="space-y-2">
              <Label className="text-xs">Start time</Label>
              <HourPicker value={startTime} onChange={setStartTime} className="w-full" />
            </div>
          )}

          {oneTime ? (
            <LessonDateRows
              rows={rows}
              onChange={setRows}
              label="Fechas y horarios"
              addLabel="Agregar otra fecha"
              countLabel={(n) => `${n} seleccionadas`}
              disabledDate={(d) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return d < today;
              }}
            />
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Lesson type</Label>
              <Select value={lessonType} onValueChange={setLessonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Range">Range</SelectItem>
                  <SelectItem value="Playing Lesson">Playing Lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Range only, Morning spot"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || (oneTime && completeRows.length === 0)}
            className="bg-[#4a7c59] hover:bg-[#4a7c59]/80"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {oneTime
              ? (completeRows.length > 1 ? `Publicar ${completeRows.length} horarios` : 'Post spot')
              : `Post ${selectedDays.length > 1 ? `${selectedDays.length} spots` : 'spot'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
