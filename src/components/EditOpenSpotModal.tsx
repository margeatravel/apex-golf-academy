import { useState, useEffect } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { HourPicker } from '@/components/HourPicker';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hasRemainingLessons } from '@/lib/packageStatus';
import {
  fetchLinkablePackages,
  isLinkable,
  linkablePackageLabel,
  pickFifoLinkable,
  type LinkablePackage,
} from '@/lib/recurringSlotPackages';

import { Loader2 } from 'lucide-react';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  onUpdated?: () => void;
  /** When true, the modal opens with the "Assign to a student" flow pre-selected. */
  initialAssignMode?: boolean;
}

type PkgRow = {
  id: string;
  package_name?: string | null;
  package_size: number;
  classes_remaining: number;
  is_active: boolean;
  __shared?: boolean;
};

/**
 * Edit an existing OPEN (unclaimed) recurring spot in `fixed_schedule_slots`.
 * Coaches can also assign a student + package, which converts the open spot into
 * a regular recurring slot: inserts into `recurring_lesson_slots`, then invokes
 * the shared `generate-recurring-lessons` Edge Function (same FIFO flow used by
 * the "Regenerate lessons" button on the student profile Packages tab) and
 * finally deletes the open spot.
 */
export function EditOpenSpotModal({ open, onOpenChange, spot, onUpdated, initialAssignMode = false }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [day, setDay] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [lessonType, setLessonType] = useState('Range');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Assign-to-student flow
  const [assignStudent, setAssignStudent] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [packages, setPackages] = useState<LinkablePackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [noPackageOverride, setNoPackageOverride] = useState(false);

  useEffect(() => {
    if (open && spot) {
      setDay(spot.day_of_week);
      setStartTime((spot.start_time || '09:00:00').substring(0, 5));
      setDuration(String(spot.duration_minutes ?? 60));
      setLessonType(spot.lesson_type || 'Range');
      setNotes(spot.notes || '');
      setAssignStudent(initialAssignMode);
      setStudentId('');
      setPackageId('');
      setPackages([]);
      setNoPackageOverride(false);
    }
  }, [open, spot, initialAssignMode]);

  // Fetch owned + shared packages for the picked student
  useEffect(() => {
    if (!open || !assignStudent || !studentId) {
      setPackages([]);
      setPackageId('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      // Unified source of truth (same helper as every other recurring-slot
      // package selector): only is_active packages whose computePackageCounts
      // remaining (total − completed) is > 0.
      let list: LinkablePackage[] = [];
      try {
        list = await fetchLinkablePackages(studentId);
      } catch (e) {
        console.warn('[EditOpenSpotModal] Failed to load packages:', e);
      }
      if (cancelled) return;
      setPackages(list);
      const fifo = pickFifoLinkable(list);
      setPackageId(fifo ? fifo.id : '');
      setLoadingPackages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, assignStudent, studentId]);

  const activePackages = packages.filter(isLinkable);

  const normalizedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;

  const handleSave = async () => {
    if (!spot) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }

    // ===== Assign-student path: convert open spot into a real recurring slot =====
    if (assignStudent) {
      if (!studentId) {
        toast({ title: 'Pick a student first', variant: 'destructive' });
        return;
      }
      if (!packageId && !noPackageOverride) {
        toast({
          title: 'Package required',
          description: 'Recurring spots must be linked to a package with lessons remaining so lessons auto-deduct.',
          variant: 'destructive',
        });
        return;
      }
      setSaving(true);
      try {
        // 1) Create the recurring slot — capture the id so we can roll back
        //    if the lesson-generation step fails.
        const { data: insertedSlot, error: slotErr } = await supabase
          .from('recurring_lesson_slots')
          .insert({
            student_id: studentId,
            weekday: day,
            start_time: normalizedStartTime,
            duration_minutes: parseInt(duration, 10),
            lesson_type: lessonType,
            package_id: noPackageOverride ? null : packageId,
            no_package_intentional: noPackageOverride,
            is_active: true,
            notes: notes.trim() || null,
            coach_id: user.id,
          })
          .select('id')
          .single();
        if (slotErr || !insertedSlot?.id) throw slotErr ?? new Error('Failed to create recurring slot');

        // 2) Generate lessons via the shared FIFO flow (same Edge Function the
        //    "Regenerate lessons" button on the Packages tab calls). It consumes
        //    the active package FIFO, or generates indefinitely when the slot is
        //    flagged no_package_intentional. If this fails, roll back the
        //    just-inserted recurring_lesson_slots row and leave the open spot
        //    intact so the coach can retry.
        const { error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', {
          body: { student_id: studentId },
        });
        if (fnErr) {
          await supabase.from('recurring_lesson_slots').delete().eq('id', insertedSlot.id);
          throw new Error(fnErr.message || 'Failed to generate lessons for the new recurring slot');
        }

        // 3) Only after the slot is saved AND lessons are generated, remove
        //    the converted open spot. Target by primary key (not day/time) so
        //    other open spots are never touched.
        const { error: delErr } = await supabase
          .from('fixed_schedule_slots')
          .delete()
          .eq('id', spot.id)
          .eq('coach_id', user.id);
        if (delErr) throw delErr;

        toast({
          title: 'Spot assigned',
          description: `${WEEKDAYS_SHORT[day]} at ${startTime} is now a recurring slot.`,
        });

        // Send confirmation email to the student — non-blocking
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', studentId)
            .maybeSingle();
          if (profile?.email) {
            supabase.functions
              .invoke('send-notification-email', {
                body: {
                  to: profile.email,
                  studentName: profile.full_name || 'there',
                  notificationType: 'priority_spot_claimed',
                  spotDay: WEEKDAYS_FULL[day],
                  spotTime: startTime,
                },
              })
              .catch((err) => console.warn('Assign confirmation email failed:', err));
          }
        } catch (mailErr) {
          console.warn('Assign confirmation email lookup failed:', mailErr);
        }

        onUpdated?.();
        onOpenChange(false);
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message ?? 'Failed to assign spot', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // ===== Plain edit path =====
    setSaving(true);
    try {
      const clashes = await findWeeklySlotConflicts({
        weekday: day,
        time: normalizedStartTime.slice(0, 5),
        durationMinutes: parseInt(duration, 10),
        lessonType,
        coachId: user.id,
        excludeFixedId: spot.id,
      });
      if (clashes.length > 0) throw new Error(`Choca con ${clashes.join(', ')}. No se guardó.`);
      const { error } = await supabase
        .from('fixed_schedule_slots')
        .update({
          day_of_week: day,
          start_time: normalizedStartTime,
          duration_minutes: parseInt(duration, 10),
          lesson_type: lessonType,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', spot.id)
        .eq('coach_id', user.id);
      if (error) throw error;
      toast({ title: 'Open spot updated', description: `${WEEKDAYS_SHORT[day]} at ${startTime}` });
      onUpdated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to update spot', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialAssignMode ? 'Assign open spot to a student' : 'Edit open spot'}</DialogTitle>
          <DialogDescription>
            {initialAssignMode
              ? `Pick a student and a package to convert ${WEEKDAYS_SHORT[day]} at ${startTime} into their fixed schedule slot.`
              : 'Update this unclaimed weekly spot, or assign it directly to a student to convert it into a recurring slot.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Day of week *</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS_FULL.map((full, value) => {
                const active = day === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDay(value)}
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Start time</Label>
              <HourPicker value={startTime} onChange={setStartTime} className="w-full" />
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
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Range only, Morning spot"
              rows={2}
            />
          </div>

          <div className="border-t border-ivory/10 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-xs text-ivory cursor-pointer">
              <Checkbox
                checked={assignStudent}
                onCheckedChange={(v) => setAssignStudent(v === true)}
              />
              <span>
                Assign to a student now{' '}
                <span className="text-ivory/50">(converts to recurring slot)</span>
              </span>
            </label>

            {assignStudent && (
              <div className="space-y-3 pl-1">
                <div className="space-y-2">
                  <Label className="text-xs">Student *</Label>
                  <SearchableStudentSelect value={studentId} onValueChange={setStudentId} variant="dark" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">
                    Auto-deduct from package <span className="text-red-400">*</span>
                    {studentId && !loadingPackages && (
                      <span className="text-ivory/40 ml-1">· {activePackages.length} available</span>
                    )}
                  </Label>
                  <Select
                    value={packageId}
                    onValueChange={setPackageId}
                    disabled={!studentId || loadingPackages || activePackages.length === 0 || noPackageOverride}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          noPackageOverride
                            ? 'No package — pay later'
                            : !studentId
                            ? 'Pick a student first'
                            : loadingPackages
                              ? 'Loading packages…'
                              : activePackages.length === 0
                                ? 'No packages with lessons remaining'
                                : 'Select a package'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {activePackages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {linkablePackageLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {studentId && !loadingPackages && activePackages.length === 0 && !noPackageOverride && (
                    <p className="text-[11px] text-red-400">
                      This student has no package with lessons remaining. Add one in their profile first.
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

              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {assignStudent ? 'Assign to student' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
