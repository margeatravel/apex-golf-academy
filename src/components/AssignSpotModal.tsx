import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { fetchActivePackagesWithRemaining, pickDefaultPackageId } from '@/lib/packageRemaining';
import { Input } from '@/components/ui/input';
import { getCancunToday } from '@/lib/cancunDate';
import { findRecurringMoveConflicts } from '@/lib/pendingRecurringMove';
import { StartsOnField } from '@/components/recurring/StartsOnField';
import { CadenceSelect } from '@/components/recurring/CadenceSelect';
import { mondayOf, firstWeekdayOnOrAfter } from '@/lib/recurringCadence';


const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface OpenSpot {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  notes?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spot: OpenSpot | null;
  onAssigned?: () => void;
}

type PkgRow = {
  id: string;
  package_name?: string | null;
  package_size: number;
  classes_remaining: number;
  is_active: boolean;
};

type Mode = 'package' | 'no_package_yet' | 'permanent_no_package';

/**
 * Focused "Assign open spot to a student" modal — only handles student
 * assignment. Reuses the shared `generate-recurring-lessons` Edge Function
 * flow, same as everywhere else. Open spot is deleted only after slot + lesson
 * generation succeed; rolls back the recurring slot if generation fails.
 */
export function AssignSpotModal({ open, onOpenChange, spot, onAssigned }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [studentId, setStudentId] = useState('');
  const [mode, setMode] = useState<Mode>('package');
  const [packageId, setPackageId] = useState('');
  const [packages, setPackages] = useState<PkgRow[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startsOn, setStartsOn] = useState(getCancunToday());
  const [intervalWeeks, setIntervalWeeks] = useState(1);

  useEffect(() => {
    if (open) {
      setStudentId('');
      setMode('package');
      setPackageId('');
      setPackages([]);
      setStartsOn(getCancunToday());
      setIntervalWeeks(1);
    }
  }, [open, spot]);

  useEffect(() => {
    if (!open || !studentId) {
      setPackages([]);
      setPackageId('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      const all = await fetchActivePackagesWithRemaining(studentId);
      if (cancelled) return;
      // Every ACTIVE, NON-PAUSED package with classes available is listed.
      // "No active packages" now only shows when none exists.
      // Gate ONLY on computed remaining (total − completed). The stored
      // `is_active` flag goes stale and a partially-paid package must show.
      const list = all.filter(
        (p) => p.is_paused !== true && p.is_archived !== true && (p.remaining ?? 0) > 0,
      ) as any as PkgRow[];
      setPackages(list);
      // Default to the oldest package that still has FREE classes (budget).
      setPackageId(list[0]?.id ?? pickDefaultPackageId(all) ?? '');
      setLoadingPackages(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  const handleConfirm = async () => {
    if (!spot) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    if (!studentId) {
      toast({ title: 'Pick a student first', variant: 'destructive' });
      return;
    }
    if (mode === 'package' && !packageId) {
      toast({
        title: 'Pick a package',
        description: 'Choose an active package or pick one of the manual options below.',
        variant: 'destructive',
      });
      return;
    }

    const today = getCancunToday();
    const future = !!startsOn && startsOn > today;
    const firstDate = future ? startsOn : firstWeekdayOnOrAfter(today, spot.day_of_week);
    const intervalAnchor = mondayOf(firstDate);

    setSaving(true);
    try {
      // Conflicts with other students on that weekday/time, valid from the
      // chosen start date (Playing Lessons span 2 slots).
      const conflicts = await findRecurringMoveConflicts({
        slotId: '',
        weekday: spot.day_of_week,
        startTime: spot.start_time,
        durationMinutes: spot.duration_minutes,
        lessonType: spot.lesson_type,
        coachId: user.id,
        effectiveDate: future ? startsOn : today,
        intervalWeeks,
        intervalAnchor,
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

      const { data: insertedSlot, error: slotErr } = await supabase
        .from('recurring_lesson_slots')
        .insert({
          student_id: studentId,
          weekday: spot.day_of_week,
          start_time: spot.start_time,
          duration_minutes: spot.duration_minutes,
          lesson_type: spot.lesson_type,
          package_id: mode === 'package' ? packageId : null,
          no_package_intentional: mode === 'permanent_no_package',
          is_active: true,
          notes: spot.notes ?? null,
          coach_id: user.id,
          starts_on: future ? startsOn : null,
          interval_weeks: intervalWeeks,
          interval_anchor: intervalAnchor,
        })
        .select('id')
        .single();
      if (slotErr || !insertedSlot?.id)
        throw slotErr ?? new Error('Failed to create recurring slot');

      const { error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', {
        body: { student_id: studentId },
      });
      if (fnErr) {
        await supabase.from('recurring_lesson_slots').delete().eq('id', insertedSlot.id);
        throw new Error(fnErr.message || 'Failed to generate lessons');
      }

      const { error: delErr } = await supabase
        .from('fixed_schedule_slots')
        .delete()
        .eq('id', spot.id)
        .eq('coach_id', user.id);
      if (delErr) throw delErr;

      toast({ title: 'Student assigned and lessons generated' });
      onAssigned?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to assign spot',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!spot) return null;
  const timeLabel = (spot.start_time || '').substring(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign open spot to a student</DialogTitle>
          <DialogDescription>
            {WEEKDAYS_FULL[spot.day_of_week]} at {timeLabel} · {spot.duration_minutes} min ·{' '}
            {spot.lesson_type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Student</Label>
            <SearchableStudentSelect value={studentId} onValueChange={setStudentId} variant="light" />
          </div>

          <StartsOnField value={startsOn} onChange={setStartsOn} />

          <CadenceSelect value={intervalWeeks} onChange={setIntervalWeeks} />

          {studentId && (
            <>
              <div className="space-y-2">
                <Label>Active package</Label>
                <Select
                  value={packageId}
                  onValueChange={(v) => {
                    setPackageId(v);
                    setMode('package');
                  }}
                  disabled={loadingPackages || packages.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingPackages
                          ? 'Loading…'
                          : packages.length === 0
                            ? 'No active packages'
                            : 'Pick a package'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {(p.package_name || `${p.package_size}-Lesson Package`)} —{' '}
                        {`${(p as any).remaining ?? 0} remaining`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Manual options</Label>
                <RadioGroup
                  value={mode === 'package' ? '' : mode}
                  onValueChange={(v) => {
                    setMode(v as Mode);
                    setPackageId('');
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="no_package_yet" id="no_package_yet" className="mt-1" />
                    <Label htmlFor="no_package_yet" className="font-normal cursor-pointer leading-snug">
                      Override — no package yet (will pay later)
                      <div className="text-xs text-muted-foreground">
                        Lessons generate but won't auto-deduct until linked to a package.
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem
                      value="permanent_no_package"
                      id="permanent_no_package"
                      className="mt-1"
                    />
                    <Label
                      htmlFor="permanent_no_package"
                      className="font-normal cursor-pointer leading-snug"
                    >
                      Permanently no package
                      <div className="text-xs text-muted-foreground">
                        Generates lessons indefinitely with no package deduction.
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !studentId}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign to student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}