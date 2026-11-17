import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { fetchLinkablePackages, isLinkable, linkablePackageLabel, type LinkablePackage } from '@/lib/recurringSlotPackages';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { HourPicker } from '@/components/HourPicker';
import { StartsOnField, startsOnShortLabel } from '@/components/recurring/StartsOnField';
import { getCancunToday } from '@/lib/cancunDate';
import { findRecurringMoveConflicts } from '@/lib/pendingRecurringMove';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** If provided, the student picker is hidden and this id is used. */
  studentId?: string;
  packages?: Array<{ id: string; package_name?: string | null; package_size: number; classes_remaining: number; is_active: boolean }>;
  onSlotAdded?: () => void;
}

const WEEKDAYS = [
  { value: 0, label: 'Sun', full: 'Sunday' },
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
];

export function AddRecurringSlotModal({ open, onOpenChange, studentId, packages = [], onSlotAdded }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pickedStudentId, setPickedStudentId] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<number[]>([2]); // Tue default
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [lessonType, setLessonType] = useState('Range');
  const [packageId, setPackageId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [generateNow, setGenerateNow] = useState(true);
  const [fetchedPackages, setFetchedPackages] = useState<LinkablePackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [noPackageOverride, setNoPackageOverride] = useState(false);
  // Same "Starting from" behaviour as the open-spot flow: today = as before,
  // a future date means lessons only start from that date.
  const [startsOn, setStartsOn] = useState(getCancunToday());

  // Reset on open
  useEffect(() => {
    if (open) {
      if (!studentId) setPickedStudentId('');
      setSelectedDays([2]);
      setPackageId('');
      setNoPackageOverride(false);
      setStartsOn(getCancunToday());
    }
  }, [open, studentId]);

  const effectiveStudentId = studentId || pickedStudentId;

  // Always fetch packages directly for the selected student so the dropdown works
  // regardless of what the parent passed in.
  useEffect(() => {
    if (!open) return;
    if (!effectiveStudentId) {
      setFetchedPackages([]);
      setPackageId('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      try {
        // Unified source: only is_active packages with remaining > 0 (computePackageCounts).
        const list = await fetchLinkablePackages(effectiveStudentId);
        if (cancelled) return;
        setFetchedPackages(list as any);
        setPackageId(list.length === 1 ? list[0].id : '');
      } catch (e) {
        if (!cancelled) {
          console.warn('[AddRecurringSlotModal] Failed to load packages:', e);
          setFetchedPackages([]);
        }
      }
      if (!cancelled) setLoadingPackages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, effectiveStudentId]);


  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    if (!effectiveStudentId) {
      toast({ title: 'Pick a student first', variant: 'destructive' });
      return;
    }
    if (selectedDays.length === 0) {
      toast({ title: 'Pick at least one day', variant: 'destructive' });
      return;
    }
    if (!packageId && !noPackageOverride) {
      toast({
        title: 'Package required',
        description: 'Every recurring spot must be linked to a package with lessons remaining so lessons auto-deduct.',
        variant: 'destructive',
      });
      return;
    }
    const today = getCancunToday();
    const future = !!startsOn && startsOn > today;
    setSaving(true);
    try {
      const normalizedTime = startTime.length === 5 ? `${startTime}:00` : startTime;

      // Same conflict rule as the open-spot flow, valid from the start date
      // (Playing Lessons span 2 slots).
      for (const weekday of selectedDays) {
        const conflicts = await findRecurringMoveConflicts({
          slotId: '',
          weekday,
          startTime: normalizedTime,
          durationMinutes: parseInt(duration, 10),
          lessonType,
          coachId: user.id,
          effectiveDate: future ? startsOn : today,
        });
        if (conflicts.length > 0) {
          toast({
            title: 'Horario ocupado',
            description: `Ya hay un alumno en ${conflicts[0]}.`,
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }
      }

      const rows = selectedDays.map((weekday) => ({
        student_id: effectiveStudentId,
        weekday,
        start_time: normalizedTime,
        duration_minutes: parseInt(duration, 10),
        lesson_type: lessonType,
        package_id: noPackageOverride ? null : packageId,
        is_active: true,
        coach_id: user.id,
        starts_on: future ? startsOn : null,
      }));
      const { error } = await supabase.from('recurring_lesson_slots').insert(rows);
      if (error) throw error;

      let weeksGenerated: number | null = null;
      if (generateNow) {
        const { data: genData, error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', {
          body: { student_id: effectiveStudentId },
        });
        if (fnErr) {
          console.warn('generate-recurring-lessons failed:', fnErr);
        } else if (genData && typeof (genData as any).inserted === 'number') {
          weeksGenerated = (genData as any).inserted as number;
        }
      }

      // Send a single admin email per recurring slot created (replaces per-lesson emails).
      try {
        // Lookup student profile for the email payload
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', effectiveStudentId)
          .maybeSingle();
        const studentName = prof?.full_name || prof?.email || 'Unknown student';
        const studentEmail = prof?.email || undefined;

        // One notification per selected weekday, since each is a distinct schedule.
        const totalSlots = selectedDays.length;
        const perSlotWeeks =
          weeksGenerated != null && totalSlots > 0
            ? Math.round(weeksGenerated / totalSlots)
            : null;

        await Promise.all(
          selectedDays.map((weekday) => {
            const dayLabel = WEEKDAYS.find((d) => d.value === weekday)?.full || '';
            return supabase.functions.invoke('notify-admin', {
              body: {
                eventType: 'recurring_schedule_created',
                studentName,
                studentEmail,
                dayOfWeek: dayLabel,
                spotTime: startTime.length === 5 ? `${startTime}:00` : startTime,
                lessonTime: startTime.length === 5 ? `${startTime}:00` : startTime,
                durationMinutes: parseInt(duration, 10),
                lessonType,
                weeksGenerated: perSlotWeeks,
              },
            });
          }),
        );
      } catch (e) {
        console.warn('notify-admin (recurring_schedule_created) failed:', e);
      }

      toast({
        title: selectedDays.length > 1 ? `${selectedDays.length} recurring spots added` : 'Recurring spot added',
        description: 'Future lessons will be auto-created.',
      });
      onSlotAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to save spot', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Unified remaining-based list (computePackageCounts). Parent-provided packages
  // are ignored on purpose so every screen reports the same number.
  const activePackages = (fetchedPackages as unknown as LinkablePackage[]).filter(isLinkable);
  const startsOnFuture = startsOn > getCancunToday();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add weekly recurring spot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!studentId && (
            <div className="space-y-2">
              <Label className="text-xs">Student *</Label>
              <SearchableStudentSelect value={pickedStudentId} onValueChange={setPickedStudentId} variant="dark" />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Days of week *</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = selectedDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={
                      'h-10 rounded-md text-xs font-medium border transition-colors ' +
                      (active
                        ? 'bg-[#4a7c59] text-ivory border-[#4a7c59]'
                        : 'bg-transparent text-ivory/70 border-ivory/20 hover:border-ivory/40')
                    }
                    aria-pressed={active}
                    title={d.full}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedDays.length === 0
                ? 'Pick one or more days'
                : `${selectedDays.length} day${selectedDays.length > 1 ? 's' : ''} selected — one spot per day will be created`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Start time</Label>
              <HourPicker
                value={startTime}
                onChange={(v) => setStartTime(v)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Duration (min)</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="45">45</SelectItem>
                  <SelectItem value="60">60</SelectItem>
                  <SelectItem value="90">90</SelectItem>
                  <SelectItem value="120">120</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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

          <div className="space-y-2">
            <Label className="text-xs">
              Auto-deduct from package <span className="text-red-400">*</span>
              {effectiveStudentId && !loadingPackages && (
                <span className="text-ivory/40 ml-1">· {activePackages.length} available</span>
              )}
            </Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!effectiveStudentId || loadingPackages || activePackages.length === 0 || noPackageOverride}>
              <SelectTrigger>
                <SelectValue placeholder={
                  noPackageOverride
                    ? 'No package — pay later'
                    : !effectiveStudentId
                    ? 'Pick a student first'
                      : loadingPackages
                        ? 'Loading packages…'
                        : activePackages.length === 0
                          ? 'No packages with lessons remaining — create one first'
                          : 'Select a package'
                } />
              </SelectTrigger>
              <SelectContent>
                {activePackages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {linkablePackageLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {effectiveStudentId && !loadingPackages && activePackages.length === 0 && !noPackageOverride && (
              <p className="text-[11px] text-red-400">
                This student has no package with lessons remaining. Add one in their profile before creating a recurring spot.
              </p>
            )}

            <label className="flex items-start gap-2 text-xs text-ivory/80 cursor-pointer pt-1">
              <Checkbox
                checked={noPackageOverride}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setNoPackageOverride(next);
                  if (next) setPackageId('');
                }}
                className="mt-0.5"
              />
              <span>
                Override — no package yet (student will pay later).{' '}
                <span className="text-amber-300/90">Lessons will not auto-deduct until you link a package.</span>
              </span>
            </label>
          </div>

          <StartsOnField value={startsOn} onChange={setStartsOn} labelClassName="text-xs" />

          <label className="flex items-center gap-2 text-xs text-ivory/70 cursor-pointer">
            <Checkbox
              checked={generateNow}
              onCheckedChange={(v) => setGenerateNow(v === true)}
            />
            {packageId && !noPackageOverride
              ? `${startsOnFuture ? `Generate lessons from ${startsOnShortLabel(startsOn)}` : 'Generate lessons now'} (up to ${activePackages.find((p) => p.id === packageId)?.remaining ?? '?'} remaining in package)`
              : startsOnFuture
                ? `Generate the next 8 weeks of lessons from ${startsOnShortLabel(startsOn)}`
                : 'Generate next 8 weeks of lessons immediately'}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save {selectedDays.length > 1 ? `${selectedDays.length} spots` : 'spot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
