import { useState, useEffect } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Loader2, CalendarOff, RotateCcw, Users } from 'lucide-react';
import { HourPicker } from '@/components/HourPicker';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { fetchActivePackagesWithRemaining, pickDefaultPackageId } from '@/lib/packageRemaining';


interface EditLessonQuickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: any | null;
}

const LESSON_TYPES = ['Range', 'Playing Lesson'];

export function EditLessonQuickModal({ open, onOpenChange, lesson }: EditLessonQuickModalProps) {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>('');
  const [duration, setDuration] = useState<number>(60);
  const [lessonType, setLessonType] = useState<string>('Range');
  const [revenueInput, setRevenueInput] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [packageId, setPackageId] = useState<string>('__none__');
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [sharedMembersByPkg, setSharedMembersByPkg] = useState<Record<string, string[]>>({});
  const [openOriginalSlot, setOpenOriginalSlot] = useState(false);
  const [recurringSlot, setRecurringSlot] = useState<any | null>(null);

  const isRecurring = !!lesson?.recurring_slot_id;
  const isSkipped = !!lesson?.skipped;

  // Detect whether the user has moved this occurrence away from its current
  // date/time. The checkbox to free up the original slot only makes sense
  // for recurring lessons whose date or time was changed during this edit.
  const originalDateIso = lesson?.lesson_date ?? null;
  const originalTimeHHMM = (lesson?.lesson_time || '').slice(0, 5);
  const newDateIso = date ? format(date, 'yyyy-MM-dd') : null;
  const newTimeHHMM = (time || '').slice(0, 5);
  const dateOrTimeChanged =
    !!originalDateIso &&
    !!newDateIso &&
    (originalDateIso !== newDateIso || originalTimeHHMM !== newTimeHHMM);
  const showOpenSlotCheckbox = isRecurring && dateOrTimeChanged;

  const handleSkipToggle = async () => {
    if (!lesson) return;
    setSkipping(true);
    try {
      const next = !isSkipped;
      const { error } = await supabase
        .from('lessons')
        .update({
          skipped: next,
          skipped_at: next ? new Date().toISOString() : null,
        })
        .eq('id', lesson.id);
      if (error) throw error;
      toast.success(next ? 'Week skipped — slot is now available' : 'Skip removed');
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['today-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Could not update skip status');
    } finally {
      setSkipping(false);
    }
  };

  useEffect(() => {
    if (lesson && open) {
      setStudentId(lesson.student_id || '');
      try {
        setDate(lesson.lesson_date ? parseISO(lesson.lesson_date) : undefined);
      } catch {
        setDate(undefined);
      }
      // lesson_time stored as 'HH:MM:SS'
      setTime((lesson.lesson_time || '').slice(0, 5));
      setDuration(lesson.duration_minutes || 60);
      setLessonType(lesson.lesson_type || 'Range');
      setRevenueInput(lesson.revenue === null || lesson.revenue === undefined ? '' : String(lesson.revenue));
      setPackageId(lesson.package_id || '__none__');
      setOpenOriginalSlot(false);
      setRecurringSlot(null);
      if (lesson.recurring_slot_id) {
        supabase
          .from('recurring_lesson_slots')
          .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, package_id')
          .eq('id', lesson.recurring_slot_id)
          .maybeSingle()
          .then(({ data }) => setRecurringSlot(data ?? null));
      }

      if (lesson.id && (lesson.revenue === null || lesson.revenue === undefined)) {
        supabase
          .from('lessons')
          .select('revenue')
          .eq('id', lesson.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.revenue !== null && data?.revenue !== undefined) {
              setRevenueInput(String(data.revenue));
            }
          });
      }
    }
  }, [lesson, open]);

  // Load owned + shared packages whenever student changes
  useEffect(() => {
    if (!open || !studentId) {
      setPackages([]);
      setSharedMembersByPkg({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      const list = await fetchActivePackagesWithRemaining(studentId, {
        includePackageId: lesson?.package_id ?? null,
      });
      if (cancelled) return;
      setPackages(list);

      // Default: preselect the FIFO active package with lessons remaining.
      // "No package — pay later" stays available but is no longer the default.
      if (!lesson?.package_id) {
        const def = pickDefaultPackageId(list);
        setPackageId(def ?? '__none__');
      }


      // Fetch member names for any shared packages
      const sharedIds = list.filter((p: any) => p.__shared || p.user_id !== studentId).map((p: any) => p.id);
      const ownedIds = list.filter((p: any) => p.user_id === studentId).map((p: any) => p.id);
      const allIdsToCheck = Array.from(new Set([...sharedIds, ...ownedIds]));
      if (allIdsToCheck.length > 0) {
        const { data: memberRows } = await supabase
          .from('package_members')
          .select('package_id, student_id')
          .in('package_id', allIdsToCheck);
        const memberIds = Array.from(new Set((memberRows || []).map((m: any) => m.student_id).filter(Boolean)));
        const ownerIds = list.map((p: any) => p.user_id).filter(Boolean);
        const allIds = Array.from(new Set([...memberIds, ...ownerIds]));
        const { data: profs } = allIds.length
          ? await supabase.from('profiles').select('id, full_name, email').in('id', allIds)
          : { data: [] as any[] };
        const nameById = new Map<string, string>();
        (profs || []).forEach((p: any) => nameById.set(p.id, p.full_name || p.email || 'Student'));
        const map: Record<string, string[]> = {};
        list.forEach((p: any) => {
          const memberStudentIds = (memberRows || [])
            .filter((m: any) => m.package_id === p.id)
            .map((m: any) => m.student_id);
          const all = Array.from(new Set([p.user_id, ...memberStudentIds])).filter(Boolean);
          const others = all.filter((id) => id !== studentId);
          if (others.length > 0) {
            map[p.id] = others.map((id: string) => nameById.get(id) || 'Student');
          }
        });
        if (!cancelled) setSharedMembersByPkg(map);
      } else if (!cancelled) {
        setSharedMembersByPkg({});
      }
      setLoadingPackages(false);
    })();
    return () => { cancelled = true; };
  }, [open, studentId, lesson?.package_id]);

  const handleLessonTypeChange = (type: string) => {
    setLessonType(type);
    setDuration(type === 'Playing Lesson' ? 120 : 60);
  };

  const handleSave = async () => {
    if (!lesson) return;
    if (!date) { toast.error('Pick a date'); return; }
    if (!time) { toast.error('Pick a time'); return; }

    const revenueAmount = revenueInput.trim() === '' ? 0 : Number(revenueInput);
    if (!Number.isFinite(revenueAmount) || revenueAmount < 0) {
      toast.error('Revenue must be empty, 0, or a positive amount');
      return;
    }

    // Re-validate the chosen package still has linking capacity.
    if (packageId !== '__none__' && packageId !== (lesson as any)?.package_id) {
      const sel = packages.find((p: any) => p.id === packageId);
      if (sel && (sel.remaining ?? 0) <= 0) {
        toast.error('Este paquete ya no tiene clases disponibles.');
        return;
      }
    }

    setSaving(true);
    try {
      const lesson_date = format(date, 'yyyy-MM-dd');
      const lesson_time = time.length === 5 ? `${time}:00` : time;

      const linkedPackageId = packageId === '__none__' ? null : packageId;


      // Only re-check when the time window actually changed.
      const l: any = lesson;
      const windowChanged =
        lesson_date !== l.lesson_date ||
        lesson_time.slice(0, 5) !== String(l.lesson_time || '').slice(0, 5) ||
        Number(duration) !== Number(l.duration_minutes) ||
        lessonType !== l.lesson_type;
      if (windowChanged) {
        const c = await findSlotConflicts({
          dateStr: lesson_date,
          time: lesson_time.slice(0, 5),
          durationMinutes: Number(duration) || 60,
          lessonType,
          excludeLessonId: lesson.id,
          excludeRecurringSlotId: l.recurring_slot_id ?? null,
        });
        if (c.length > 0) throw new Error(`Choca con ${c.map((x) => x.label).join(', ')}. No se guardó.`);
      }

      const update: any = {
        student_id: studentId || null,
        lesson_date,
        lesson_time,
        duration_minutes: duration,
        lesson_type: lessonType,
        // Package-covered lessons are already paid for by the package:
        // revenue stays 0 and the lesson never enters AR.
        revenue: linkedPackageId ? 0 : revenueAmount,
        package_id: linkedPackageId,
      };
      // Never overwrite ar_status when editing an existing lesson; preserve
      // the value already stored in the database.



      // If this lesson came from a recurring slot and the user moved it to a
      // different date/time than the original occurrence, mark it as a manual
      // override so the generator doesn't delete it (Step 1 reset) or insert a
      // duplicate at the slot's original time (Step 2 regenerate).
      if (lesson.recurring_slot_id) {
        const originalDate = lesson.lesson_date;
        const originalTime = (lesson.lesson_time || '').slice(0, 5);
        const newTime = time.slice(0, 5);
        if (originalDate !== lesson_date || originalTime !== newTime) {
          update.auto_generated = false;
          // A moved occurrence must never be left in a skipped state —
          // "skipped" means no lesson; this row represents a real lesson
          // that was rescheduled, not cancelled.
          update.skipped = false;
          update.skip_keep_closed = false;
        }
      }

      // Any type/duration/package edit on a recurring occurrence must survive
      // generate-recurring-lessons, which deletes and recreates auto-generated rows.
      if (lesson.recurring_slot_id && (
        lessonType !== l.lesson_type ||
        Number(duration) !== Number(l.duration_minutes) ||
        linkedPackageId !== (l.package_id ?? null)
      )) {
        update.auto_generated = false;
      }

      // Recompute lesson_start_at / lesson_end_at if previously set (keeps timeline correct)
      if (lesson.lesson_start_at) {
        // Build using America/Cancun fixed offset (UTC-5, no DST)
        const start = new Date(`${lesson_date}T${lesson_time}-05:00`);
        const end = new Date(start.getTime() + duration * 60000);
        update.lesson_start_at = start.toISOString();
        update.lesson_end_at = end.toISOString();
      }

      const { error } = await supabase.from('lessons').update(update).eq('id', lesson.id);
      if (error) throw error;

      // If the user moved a recurring occurrence and asked to free up the
      // original time on that date for other students, materialize the same
      // shape of "skipped, openable" placeholder row that SkipWeekModal
      // creates. This is the existing one-date-scoped open-spot mechanism:
      // useCalendarWeek's step 1 turns a skipped + !skip_keep_closed lesson
      // into an open tile, and book-lesson treats it as bookable.
      if (
        openOriginalSlot &&
        lesson.recurring_slot_id &&
        dateOrTimeChanged &&
        originalDateIso
      ) {
        // Prefer the recurring slot's canonical defaults; fall back to the
        // lesson row's prior values if the slot lookup hasn't returned yet.
        const slot = recurringSlot;
        const placeholderTime = slot?.start_time
          ? String(slot.start_time).length === 5
            ? `${slot.start_time}:00`
            : String(slot.start_time)
          : originalTimeHHMM.length === 5
            ? `${originalTimeHHMM}:00`
            : originalTimeHHMM;
        const placeholderStudent = slot?.student_id ?? lesson.student_id ?? null;
        const placeholderDuration =
          slot?.duration_minutes ?? lesson.duration_minutes ?? 60;
        const placeholderType = slot?.lesson_type ?? lesson.lesson_type ?? 'Range';
        const placeholderPkg = slot?.package_id ?? null;

        // Avoid duplicating: if a row already exists for this slot on the
        // original date at the canonical time, just flip it to skipped+open.
        const { data: existing } = await supabase
          .from('lessons')
          .select('id')
          .eq('recurring_slot_id', lesson.recurring_slot_id)
          .eq('lesson_date', originalDateIso)
          .eq('lesson_time', placeholderTime)
          .neq('id', lesson.id)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('lessons')
            .update({
              skipped: true,
              skipped_at: new Date().toISOString(),
              skip_keep_closed: false,
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('lessons').insert({
            student_id: placeholderStudent,
            lesson_date: originalDateIso,
            lesson_time: placeholderTime,
            duration_minutes: placeholderDuration,
            lesson_type: placeholderType,
            recurring_slot_id: lesson.recurring_slot_id,
            auto_generated: true,
            status: 'scheduled' as any,
            skipped: true,
            skipped_at: new Date().toISOString(),
            skip_keep_closed: false,
            package_id: placeholderPkg,
            currency: 'MXN',
          });
        }
      }

      toast.success('Lesson updated');
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['today-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-packages'] });
      queryClient.invalidateQueries({ queryKey: ['student-others-package-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-detail'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Error updating lesson');
    } finally {
      setSaving(false);
    }
  };

  const selectedSharedMembers = packageId !== '__none__' ? sharedMembersByPkg[packageId] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lesson</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Student</Label>
            <SearchableStudentSelect value={studentId} onValueChange={setStudentId} variant="light" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[100]" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time</Label>
              <HourPicker value={time} onChange={setTime} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={lessonType} onValueChange={handleLessonTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {LESSON_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 60)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <Label htmlFor="lesson-revenue-payment">Revenue / Payment Received (MXN)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="lesson-revenue-payment"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={revenueInput}
                onChange={(e) => setRevenueInput(e.target.value)}
                className="pl-7"
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Package
              {selectedSharedMembers && selectedSharedMembers.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[#F0C040]/15 text-[#F0C040] border border-[#F0C040]/30">
                  <Users className="h-3 w-3" /> shared
                </span>
              )}
            </Label>
            <Select
              value={packageId}
              onValueChange={setPackageId}
              disabled={!studentId || loadingPackages}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingPackages ? 'Loading packages…' : 'No package — pay later'} />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="__none__">No package — pay later</SelectItem>
                {packages.map((p) => {
                  const remaining = p.remaining ?? 0;
                  const isCurrentlyLinked = p.id === (lesson?.package_id ?? null);
                  return (
                    <SelectItem key={p.id} value={p.id} disabled={!isCurrentlyLinked && remaining <= 0}>
                      {(p.package_name || `${p.size ?? p.package_size}-Lesson`)} ·{' '}
                      {remaining <= 0 ? 'sin clases disponibles' : `${remaining} clases disponibles`}
                      {(p.__shared || (sharedMembersByPkg[p.id]?.length ?? 0) > 0) ? ' · 👥 shared' : ''}
                    </SelectItem>
                  );
                })}

              </SelectContent>
            </Select>
            {selectedSharedMembers && selectedSharedMembers.length > 0 && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Shared with: <span className="font-medium">{selectedSharedMembers.join(', ')}</span> — this lesson will count once and appear on every member's profile.
              </p>
            )}
          </div>

          {showOpenSlotCheckbox && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3 cursor-pointer">
              <Checkbox
                checked={openOriginalSlot}
                onCheckedChange={(v) => setOpenOriginalSlot(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs leading-snug">
                <span className="font-medium">Open this time slot for other students</span>
                <span className="block text-muted-foreground mt-0.5">
                  Frees the original {originalTimeHHMM} time on{' '}
                  {originalDateIso
                    ? format(parseISO(originalDateIso), 'EEE, MMM d')
                    : 'that date'}{' '}
                  so another student can book it as a one-off — only for that date, not future weeks.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          {isRecurring && (
            <Button
              variant="outline"
              onClick={handleSkipToggle}
              disabled={saving || skipping}
              className="mr-auto"
            >
              {skipping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSkipped ? (
                <><RotateCcw className="h-4 w-4 mr-2" /> Unskip Week</>
              ) : (
                <><CalendarOff className="h-4 w-4 mr-2" /> Skip Week</>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
