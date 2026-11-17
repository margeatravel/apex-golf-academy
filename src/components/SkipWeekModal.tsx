import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarOff, Loader2, RotateCcw, Globe, Lock } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface RecurringSlotLite {
  id: string;
  student_id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  package_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: RecurringSlotLite | null;
  studentProfile?: { full_name?: string | null; email?: string | null } | null;
  onChanged?: () => void;
  defaultDate?: string | null;
}

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtDateLong(d: Date) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtTime12h(time: string) {
  const [hhRaw, mm] = time.split(':');
  const h = parseInt(hhRaw, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

function nextOccurrences(weekday: number, count = 8, includeToday = false): Date[] {
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayWd = today.getDay();
  let diff = (weekday - todayWd + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + diff);
  for (let i = 0; i < count; i++) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SkipWeekModal({ open, onOpenChange, slot, studentProfile, onChanged, defaultDate }: Props) {
  const qc = useQueryClient();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);
  const [working, setWorking] = useState(false);
  const [keepClosed, setKeepClosed] = useState(false);
  const [lessonByDate, setLessonByDate] = useState<Record<string, any>>({});

  const occurrences = useMemo(() => {
    if (!slot) return [];
    const todayIso = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return toISODate(d);
    })();
    const includeToday = !!defaultDate && defaultDate === todayIso;
    return nextOccurrences(slot.weekday, 8, includeToday);
  }, [slot, defaultDate]);

  useEffect(() => {
    if (!open || !slot) return;
    setSelectedDates(defaultDate ? [defaultDate] : []);
    setNotify(true);
    setKeepClosed(false);
    (async () => {
      const dates = occurrences.map(toISODate);
      if (dates.length === 0) return;
      if (defaultDate && !dates.includes(defaultDate)) dates.push(defaultDate);
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, status, skipped, skip_keep_closed, recurring_slot_id, student_id')
        .eq('recurring_slot_id', slot.id)
        .in('lesson_date', dates);
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => { map[row.lesson_date] = row; });
      setLessonByDate(map);
    })();
  }, [open, slot, occurrences, defaultDate]);

  if (!slot) return null;

  const startTimeShort = slot.start_time.slice(0, 5);
  const slotLabel = `${WEEKDAYS_FULL[slot.weekday]} ${fmtTime12h(startTimeShort)} · ${slot.lesson_type}`;
  const studentDisplay =
    studentProfile?.full_name?.trim() || studentProfile?.email || 'this student';

  const toggleDate = (iso: string) => {
    setSelectedDates((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso]
    );
  };

  const selectableDates = occurrences
    .map(toISODate)
    .filter((iso) => lessonByDate[iso]?.status !== 'completed');

  const allSelected = selectableDates.length > 0 && selectableDates.every((d) => selectedDates.includes(d));

  // Classify the batch
  const skipCount = selectedDates.filter((d) => !lessonByDate[d]?.skipped).length;
  const restoreCount = selectedDates.filter((d) => !!lessonByDate[d]?.skipped).length;
  const showOptions = skipCount > 0;

  const confirmLabel = (() => {
    if (selectedDates.length === 0) return 'Skip selected weeks';
    if (skipCount > 0 && restoreCount === 0) return skipCount === 1 ? 'Skip 1 week' : `Skip ${skipCount} weeks`;
    if (restoreCount > 0 && skipCount === 0) return restoreCount === 1 ? 'Restore 1 week' : `Restore ${restoreCount} weeks`;
    return `Apply to ${selectedDates.length} weeks`;
  })();

  const isPureRestore = skipCount === 0 && restoreCount > 0;

  const handleConfirm = async () => {
    if (selectedDates.length === 0) {
      toast.error('Pick at least one week');
      return;
    }
    for (const d of selectedDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        toast.error('Invalid date in selection');
        return;
      }
    }
    setWorking(true);
    const lessonTime = startTimeShort.length === 5 ? `${startTimeShort}:00` : startTimeShort;
    let succeeded = 0;
    let failed = 0;
    let skippedNew = 0;
    let restored = 0;

    for (const date of selectedDates) {
      try {
        let lessonRow = lessonByDate[date];
        const wasSkipped = !!lessonRow?.skipped;
        const skipping = !wasSkipped;

        if (!lessonRow) {
          const { data: inserted, error: insErr } = await supabase
            .from('lessons')
            .insert({
              student_id: slot.student_id,
              lesson_date: date,
              lesson_time: lessonTime,
              duration_minutes: slot.duration_minutes,
              lesson_type: slot.lesson_type,
              recurring_slot_id: slot.id,
              auto_generated: true,
              status: 'scheduled' as any,
              skipped: true,
              skipped_at: new Date().toISOString(),
              skip_keep_closed: keepClosed,
              package_id: slot.package_id ?? null,
              currency: 'MXN',
            })
            .select('id, lesson_date, status, skipped')
            .single();
          if (insErr) throw insErr;
          lessonRow = inserted;
        } else {
          const { error: upErr } = await supabase
            .from('lessons')
            .update({
              skipped: skipping,
              skipped_at: skipping ? new Date().toISOString() : null,
              skip_keep_closed: skipping ? keepClosed : false,
            })
            .eq('id', lessonRow.id);
          if (upErr) throw upErr;
        }

        if (skipping) skippedNew++; else restored++;

        if (skipping && notify) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', slot.student_id)
              .maybeSingle();
            const recipient = profile?.email || studentProfile?.email || null;
            const studentName =
              profile?.full_name || studentProfile?.full_name || studentProfile?.email || 'there';
            if (recipient) {
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  to: recipient,
                  studentName,
                  notificationType: 'lesson_skipped',
                  lessonDate: date,
                  lessonTime: startTimeShort,
                  lessonType: slot.lesson_type,
                },
              });
            }
          } catch (mailErr) {
            console.warn('[SkipWeekModal] email send failed (non-blocking):', mailErr);
          }
          try {
            const niceDate = new Date(`${date}T12:00:00-05:00`).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            });
            await supabase.from('notifications').insert({
              user_id: slot.student_id,
              type: 'lesson_skipped',
              title: 'Your weekly lesson was skipped',
              message: `Your Coach marked your ${niceDate} ${fmtTime12h(startTimeShort)} lesson as skipped. Your recurring schedule resumes next week.`,
              link: '/lessons',
              metadata: { lesson_id: lessonRow?.id, recurring_slot_id: slot.id, lesson_date: date, lesson_time: startTimeShort, lesson_type: slot.lesson_type },
            });
          } catch (notifErr) {
            console.warn('[SkipWeekModal] notification insert failed (non-blocking):', notifErr);
          }
        }

        try {
          if (lessonRow?.id) {
            await supabase.functions.invoke('sync-google-calendar', {
              body: { action: skipping ? 'delete' : 'create', lessonId: lessonRow.id },
            });
          }
        } catch (gErr) {
          console.warn('[SkipWeekModal] gcal sync failed (non-blocking):', gErr);
        }

        succeeded++;
      } catch (e: any) {
        console.error('[SkipWeekModal] failed for', date, e);
        failed++;
      }
    }

    qc.invalidateQueries({ queryKey: ['student-lessons'] });
    qc.invalidateQueries({ queryKey: ['student-lessons', slot.student_id] });
    qc.invalidateQueries({ queryKey: ['admin-all-lessons'] });
    qc.invalidateQueries({ queryKey: ['upcoming-lessons'] });
    qc.invalidateQueries({ queryKey: ['today-lessons'] });
    qc.invalidateQueries({ queryKey: ['next-lesson'] });
    qc.invalidateQueries({ queryKey: ['available-slots'] });

    setWorking(false);

    if (succeeded > 0 && failed === 0) {
      const parts: string[] = [];
      if (skippedNew > 0) parts.push(`Skipped ${skippedNew} ${skippedNew === 1 ? 'week' : 'weeks'}`);
      if (restored > 0) parts.push(`Restored ${restored} ${restored === 1 ? 'week' : 'weeks'}`);
      toast.success(`${parts.join(' · ')} for ${studentDisplay}`);
    } else if (succeeded > 0 && failed > 0) {
      toast.warning(`Updated ${succeeded} · ${failed} failed`);
    } else {
      toast.error('Could not update any week');
    }

    onChanged?.();
    if (failed === 0) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-[#F0C040]" />
            Skip a week
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#F0C040] font-semibold">
              Recurring slot
            </div>
            <div className="text-sm font-medium mt-0.5">{slotLabel}</div>
            <div className="text-[11px] text-[#F5F0E8]/60 mt-0.5">
              For {studentDisplay}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#F5F0E8]/70">Pick one or more weeks to skip</Label>
              <button
                type="button"
                onClick={() =>
                  setSelectedDates(allSelected ? [] : selectableDates)
                }
                className="text-[11px] text-[#F0C040] hover:underline"
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {occurrences.map((d) => {
                const iso = toISODate(d);
                const existing = lessonByDate[iso];
                const skipped = !!existing?.skipped;
                const completed = existing?.status === 'completed';
                const active = selectedDates.includes(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => !completed && toggleDate(iso)}
                    disabled={completed}
                    className="w-full text-left rounded-md px-3 py-2 transition-colors flex items-center justify-between gap-2"
                    style={{
                      background: active ? 'rgba(74,124,89,0.25)' : 'rgba(255,255,255,0.04)',
                      border: active
                        ? '1.5px solid #4a7c59'
                        : '1px solid rgba(255,255,255,0.08)',
                      opacity: completed ? 0.45 : 1,
                      cursor: completed ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <Checkbox
                        checked={active}
                        disabled={completed}
                        onCheckedChange={() => !completed && toggleDate(iso)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-[#F5F0E8]/40"
                      />
                      <span className="text-sm">{fmtDateLong(d)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {skipped && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F0C040]/20 text-[#F0C040] border border-[#F0C040]/30">
                          Skipped
                        </span>
                      )}
                      {completed && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Completed
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {showOptions && (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-[#F5F0E8]/70">What happens with these slots?</Label>
                <RadioGroup
                  value={keepClosed ? 'closed' : 'open'}
                  onValueChange={(v) => setKeepClosed(v === 'closed')}
                  className="space-y-1.5"
                >
                  <label
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: !keepClosed ? 'rgba(74,124,89,0.20)' : 'rgba(255,255,255,0.04)',
                      border: !keepClosed ? '1.5px solid #4a7c59' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <RadioGroupItem value="open" id="skip-open" className="border-[#F5F0E8]/40" />
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-[#4a7c59]" /> Open for others to book
                      </div>
                      <p className="text-[11px] text-[#F5F0E8]/50 mt-0.5">
                        Any student can grab these slots as one-off lessons
                      </p>
                    </div>
                  </label>
                  <label
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: keepClosed ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                      border: keepClosed ? '1.5px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <RadioGroupItem value="closed" id="skip-closed" className="border-[#F5F0E8]/40" />
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-red-400" /> Keep closed
                      </div>
                      <p className="text-[11px] text-[#F5F0E8]/50 mt-0.5">
                        No one can book these slots — time stays blocked
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <label className="flex items-start gap-2 text-xs text-[#F5F0E8]/80 cursor-pointer">
                <Checkbox
                  checked={notify}
                  onCheckedChange={(v) => setNotify(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Notify {studentDisplay} by email and in-app for each skipped lesson
                </span>
              </label>
            </>
          )}

          {selectedDates.length > 0 && (
            <div className="text-[11px] text-[#F5F0E8]/60 leading-snug space-y-1">
              {isPureRestore ? (
                <p>
                  These weeks are currently skipped. Confirm to restore the lessons on the schedule.
                </p>
              ) : (
                <>
                  <p>
                    {selectedDates.length === 1 ? 'This week' : `These ${selectedDates.length} weeks`} will
                    be skipped. {studentDisplay}'s fixed schedule stays intact and resumes
                    automatically afterwards.
                  </p>
                  <p>No lessons are deducted from their package.</p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={working || selectedDates.length === 0}
            className={
              isPureRestore
                ? 'bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]'
                : 'bg-[#F0C040] hover:bg-[#F0C040]/90 text-[#0d1f18] font-semibold'
            }
          >
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isPureRestore ? (
              <RotateCcw className="h-4 w-4 mr-2" />
            ) : (
              <CalendarOff className="h-4 w-4 mr-2" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
