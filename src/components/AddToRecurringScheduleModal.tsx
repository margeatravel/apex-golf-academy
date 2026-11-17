import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Repeat as RepeatIcon,
  ArrowRightLeft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddOpenSpotModal } from '@/components/AddOpenSpotModal';
import { AddStudentModal } from '@/components/AddStudentModal';
import { EditRecurringSlotModal } from '@/components/EditRecurringSlotModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  fetchLinkablePackages,
  isLinkable,
  linkablePackageLabel,
  pickFifoLinkable,
  type LinkablePackage,
} from '@/lib/recurringSlotPackages';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  if (!t) return '';
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

interface OpenSpot {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  notes?: string | null;
}

interface StudentRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface RecurringSlotRow {
  id: string;
  student_id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  package_id: string | null;
  no_package_intentional: boolean | null;
  notes: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

type Step = 'pick-spot' | 'pick-student' | 'pick-action' | 'pick-slot-to-move';

/**
 * Dashboard "+" entry point for the Recurring Schedule widget.
 *
 * Flow:
 *  1. Pick an OPEN spot from `fixed_schedule_slots`.
 *  2. Pick a student (searchable list, with existing recurring slots shown
 *     inline). "+ Add new student" routes through the existing AddStudentModal.
 *  3. Choose between:
 *      - "Assign to this spot"  → replicates EditOpenSpotModal's assign
 *        handler verbatim (insert recurring slot → invoke
 *        generate-recurring-lessons → delete open spot, with rollback).
 *      - "Move existing slot"   → opens EditRecurringSlotModal pre-populated
 *        with the chosen existing slot whose weekday/time/duration/lesson_type
 *        have been swapped to the picked open spot's values. On save, the
 *        modal performs its normal update + replace-future flow; we then delete
 *        the open spot in the onSaved callback.
 *
 *  We do NOT modify EditOpenSpotModal or EditRecurringSlotModal.
 */
export function AddToRecurringScheduleModal({ open, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('pick-spot');
  const [openSpots, setOpenSpots] = useState<OpenSpot[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<OpenSpot | null>(null);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [allSlots, setAllSlots] = useState<RecurringSlotRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const [assigning, setAssigning] = useState(false);
  const [addOpenSpotOpen, setAddOpenSpotOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);

  // Manual package linking for the new slot (mirrors Edit recurring spot).
  const [packages, setPackages] = useState<LinkablePackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageId, setPackageId] = useState<string>('');
  const [noPackageOverride, setNoPackageOverride] = useState(false);

  // For "Move existing slot": the slot we open EditRecurringSlotModal with.
  const [moveSlot, setMoveSlot] = useState<RecurringSlotRow | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('pick-spot');
      setSelectedSpot(null);
      setSelectedStudent(null);
      setSearch('');
      setMoveSlot(null);
      setPackages([]);
      setPackageId('');
      setNoPackageOverride(false);
    }
  }, [open]);

  // Load open spots on open
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingSpots(true);
      let query = supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, notes')
        .is('student_id', null)
        .eq('is_available', true);
      if (user?.id) query = query.eq('coach_id', user.id);
      query = query.order('day_of_week', { ascending: true }).order('start_time', { ascending: true });
      const { data, error } = await query;
      if (!cancelled) {
        if (error) {
          toast({ title: 'Could not load open spots', description: error.message, variant: 'destructive' });
          setOpenSpots([]);
        } else {
          setOpenSpots((data ?? []) as OpenSpot[]);
        }
        setLoadingSpots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, addOpenSpotOpen, toast, user?.id]);

  // Load students + their recurring slots when we land on step 2
  useEffect(() => {
    if (!open || step !== 'pick-student' || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingStudents(true);
      const [profilesRes, slotsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .order('full_name', { ascending: true }),
        (() => {
          let query = supabase
            .from('recurring_lesson_slots')
            .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, package_id, no_package_intentional, notes, is_active')
            .eq('is_active', true);
          if (user?.id) query = query.eq('coach_id', user.id);
          return query;
        })(),
      ]);
      if (cancelled) return;
      if (profilesRes.error) {
        toast({ title: 'Could not load students', description: profilesRes.error.message, variant: 'destructive' });
      }
      setStudents((profilesRes.data ?? []) as StudentRow[]);
      setAllSlots((slotsRes.data ?? []) as RecurringSlotRow[]);
      setLoadingStudents(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, step, addStudentOpen, toast, user?.id]);

  // Load the picked student's linkable packages (is_active AND remaining > 0),
  // using the same helper as the Edit recurring spot modal.
  useEffect(() => {
    if (!open || !selectedStudent?.id) {
      setPackages([]);
      setPackageId('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      try {
        const list = (await fetchLinkablePackages(selectedStudent.id)).filter(isLinkable);
        if (cancelled) return;
        setPackages(list);
        const fifo = pickFifoLinkable(list);
        setPackageId(fifo ? fifo.id : '');
        setNoPackageOverride(list.length === 0);
      } catch (e) {
        if (!cancelled) {
          console.warn('[AddToRecurringScheduleModal] Failed to load packages:', e);
          setPackages([]);
        }
      }
      if (!cancelled) setLoadingPackages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedStudent?.id]);

  const slotsByStudent = useMemo(() => {
    const m = new Map<string, RecurringSlotRow[]>();
    allSlots.forEach((s) => {
      const arr = m.get(s.student_id) ?? [];
      arr.push(s);
      m.set(s.student_id, arr);
    });
    return m;
  }, [allSlots]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      (s.full_name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q),
    );
  }, [search, students]);

  const selectedStudentSlots = selectedStudent
    ? slotsByStudent.get(selectedStudent.id) ?? []
    : [];

  /**
   * Assign-to-spot — replicates EditOpenSpotModal's assign handler. We fetch
   * the picked student's FIFO-oldest active package (owned or shared) and link
   * the new recurring slot to it. If they have no eligible package we still
   * require the coach to confirm (we flip no_package_intentional on so the
   * Edge Function generates indefinitely).
   */
  const handleAssign = async () => {
    if (!selectedSpot || !selectedStudent) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    if (!packageId && !noPackageOverride) {
      toast({
        title: 'Package required',
        description: 'Pick a package with lessons remaining, or check the no-package override.',
        variant: 'destructive',
      });
      return;
    }
    setAssigning(true);
    try {
      // The coach chooses the package explicitly (or overrides it away).
      const chosen = noPackageOverride ? null : packages.find((p) => p.id === packageId) ?? null;
      const noPackage = !chosen;

      // 1) Insert recurring slot
      const startTime = selectedSpot.start_time.length === 5
        ? `${selectedSpot.start_time}:00`
        : selectedSpot.start_time;
      const { data: insertedSlot, error: slotErr } = await supabase
        .from('recurring_lesson_slots')
        .insert({
          student_id: selectedStudent.id,
          weekday: selectedSpot.day_of_week,
          start_time: startTime,
          duration_minutes: selectedSpot.duration_minutes,
          lesson_type: selectedSpot.lesson_type,
          package_id: chosen ? chosen.id : null,
          no_package_intentional: noPackage,
          is_active: true,
          notes: selectedSpot.notes || null,
          coach_id: user.id,
        })
        .select('id')
        .single();
      if (slotErr || !insertedSlot?.id) throw slotErr ?? new Error('Failed to create recurring slot');

      // 2) Generate lessons (FIFO), with rollback on failure
      const { error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', {
        body: { student_id: selectedStudent.id },
      });
      if (fnErr) {
        await supabase.from('recurring_lesson_slots').delete().eq('id', insertedSlot.id);
        throw new Error(fnErr.message || 'Failed to generate lessons for the new recurring slot');
      }

      // 3) Delete the open spot by PK
      const { error: delErr } = await supabase
        .from('fixed_schedule_slots')
        .delete()
        .eq('id', selectedSpot.id)
        .eq('coach_id', user.id);
      if (delErr) throw delErr;

      toast({
        title: 'Spot assigned',
        description: `${selectedStudent.full_name || selectedStudent.email} is now on ${WEEKDAYS_SHORT[selectedSpot.day_of_week]} ${fmtTime(selectedSpot.start_time)}.${noPackage ? ' No active package found — generated indefinitely.' : ''}`,
      });
      onChanged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Could not assign spot',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  /**
   * Move existing slot — open EditRecurringSlotModal with a "virtual" slot
   * whose weekday/start_time/duration/lesson_type are pre-swapped to the open
   * spot's. The modal will UPDATE the underlying recurring_lesson_slots row to
   * those new values and (with the default "Replace future" checkbox) wipe +
   * regenerate future lessons via the shared FIFO flow. On save we also
   * delete the now-filled open spot.
   */
  const startMove = (existing: RecurringSlotRow) => {
    if (!selectedSpot) return;
    const virtual: RecurringSlotRow = {
      ...existing,
      weekday: selectedSpot.day_of_week,
      start_time: selectedSpot.start_time,
      duration_minutes: selectedSpot.duration_minutes,
      lesson_type: selectedSpot.lesson_type,
    };
    setMoveSlot(virtual);
  };

  const handleMoveSaved = async () => {
    if (!selectedSpot) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    // Open spot has been filled — delete it.
    const { error } = await supabase
      .from('fixed_schedule_slots')
      .delete()
      .eq('id', selectedSpot.id)
      .eq('coach_id', user.id);
    if (error) {
      toast({ title: 'Slot moved, but open spot remained', description: error.message, variant: 'destructive' });
    }
    setMoveSlot(null);
    onChanged?.();
    onOpenChange(false);
  };

  const headerSpot = selectedSpot ? (
    <div className="text-xs text-muted-foreground">
      Spot · {WEEKDAYS_FULL[selectedSpot.day_of_week]} {fmtTime(selectedSpot.start_time)} · {selectedSpot.duration_minutes}m · {selectedSpot.lesson_type}
    </div>
  ) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add to Recurring Schedule</DialogTitle>
            <DialogDescription>
              {step === 'pick-spot' && 'Pick an open spot to fill with a student.'}
              {step === 'pick-student' && 'Pick a student for this spot.'}
              {step === 'pick-action' && 'How should this student take the spot?'}
              {step === 'pick-slot-to-move' && 'Which existing slot would you like to move?'}
            </DialogDescription>
            {step !== 'pick-spot' && headerSpot}
          </DialogHeader>

          {/* ============ STEP 1: PICK OPEN SPOT ============ */}
          {step === 'pick-spot' && (
            <div className="space-y-2 mt-2">
              {loadingSpots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : openSpots.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/15 bg-white/5 p-6 text-center">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-foreground">No open spots yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Create an open recurring spot first, then come back here to fill it.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setAddOpenSpotOpen(true)}
                    className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Create an open spot
                  </Button>
                </div>
              ) : (
                <>
                  {openSpots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSpot(s);
                        setStep('pick-student');
                      }}
                      className="w-full text-left rounded-md border border-[#4a7c59]/40 bg-[#4a7c59]/10 hover:bg-[#4a7c59]/20 transition-colors p-3"
                    >
                      <div className="text-sm font-semibold text-foreground">
                        {WEEKDAYS_FULL[s.day_of_week]} · {fmtTime(s.start_time)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.duration_minutes} min · {s.lesson_type}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ============ STEP 2: PICK STUDENT ============ */}
          {step === 'pick-student' && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setStep('pick-spot')}
                  title="Back to spots"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search students…"
                    className="pl-7 h-9"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAddStudentOpen(true)}
                className="w-full flex items-center gap-2 rounded-md border border-dashed border-[#F0C040]/40 bg-[#F0C040]/5 hover:bg-[#F0C040]/10 transition-colors px-3 py-2 text-sm text-[#F0C040]"
              >
                <UserPlus className="h-4 w-4" />
                Add new student
              </button>

              <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                {loadingStudents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No matches.</p>
                ) : (
                  filteredStudents.map((stu) => {
                    const stuSlots = slotsByStudent.get(stu.id) ?? [];
                    return (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudent(stu);
                          setStep('pick-action');
                        }}
                        className="w-full text-left rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-2"
                      >
                        <div className="text-sm font-medium text-foreground truncate">
                          {stu.full_name || stu.email || 'Unknown'}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                          <RepeatIcon className="h-3 w-3 shrink-0" />
                          {stuSlots.length === 0 ? (
                            <span>No recurring slots</span>
                          ) : (
                            <span>
                              {stuSlots
                                .map((sl) => `${WEEKDAYS_SHORT[sl.weekday]} ${fmtTime(sl.start_time)}`)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ============ STEP 3: PICK ACTION ============ */}
          {step === 'pick-action' && selectedStudent && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setStep('pick-student')}
                  title="Back to students"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium text-foreground truncate flex-1">
                  {selectedStudent.full_name || selectedStudent.email}
                </div>
              </div>

              {selectedStudentSlots.length > 0 && (
                <div className="rounded-md border border-white/10 bg-white/5 p-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Currently on:</span>{' '}
                  {selectedStudentSlots
                    .map((sl) => `${WEEKDAYS_SHORT[sl.weekday]} ${fmtTime(sl.start_time)}`)
                    .join(' · ')}
                </div>
              )}

              <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-2">
                <Label className="text-xs">
                  Auto-deduct from package <span className="text-red-400">*</span>
                  {!loadingPackages && (
                    <span className="text-muted-foreground ml-1">· {packages.length} available</span>
                  )}
                </Label>
                <Select
                  value={packageId}
                  onValueChange={setPackageId}
                  disabled={loadingPackages || packages.length === 0 || noPackageOverride}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue
                      placeholder={
                        noPackageOverride
                          ? 'No package — pay later'
                          : loadingPackages
                            ? 'Loading packages…'
                            : packages.length === 0
                              ? 'No packages with lessons remaining'
                              : 'Select a package'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {linkablePackageLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
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
                    Override — no package yet (student will pay later). Lessons will not auto-deduct.
                  </span>
                </label>
              </div>

              <Button
                onClick={handleAssign}
                disabled={assigning}
                className="w-full justify-start h-11 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
              >
                {assigning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Assign to this spot
                <span className="ml-auto text-[11px] opacity-80">
                  {selectedStudentSlots.length === 0 ? 'first slot' : 'additional slot'}
                </span>
              </Button>

              {selectedStudentSlots.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedStudentSlots.length === 1) {
                      startMove(selectedStudentSlots[0]);
                    } else {
                      setStep('pick-slot-to-move');
                    }
                  }}
                  disabled={assigning}
                  className="w-full justify-start h-11"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Move existing slot to this time
                </Button>
              )}
            </div>
          )}

          {/* ============ STEP 3b: PICK WHICH SLOT TO MOVE ============ */}
          {step === 'pick-slot-to-move' && selectedStudent && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setStep('pick-action')}
                  title="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium text-foreground truncate flex-1">
                  {selectedStudent.full_name || selectedStudent.email}
                </div>
              </div>
              {selectedStudentSlots.map((sl) => (
                <button
                  key={sl.id}
                  type="button"
                  onClick={() => startMove(sl)}
                  className="w-full text-left rounded-md border border-white/10 bg-white/5 hover:border-[#4a7c59]/60 hover:bg-white/10 transition-colors p-3"
                >
                  <div className="text-sm font-medium text-foreground">
                    {WEEKDAYS_FULL[sl.weekday]} · {fmtTime(sl.start_time)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {sl.duration_minutes} min · {sl.lesson_type}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fallback flow: create an open spot when none exist. */}
      <AddOpenSpotModal
        open={addOpenSpotOpen}
        onOpenChange={setAddOpenSpotOpen}
        onSpotAdded={() => {
          // Re-fetch happens via the dep on addOpenSpotOpen in the effect above.
          onChanged?.();
        }}
      />

      {/* New-student flow. After creation, jump straight into the action step. */}
      <AddStudentModal
        open={addStudentOpen}
        onOpenChange={setAddStudentOpen}
        onStudentCreated={(newId) => {
          // Effect refetches students on addStudentOpen change; once the new
          // student lands in the list, auto-select them.
          const pickWhenReady = (attempts = 0) => {
            const found = students.find((s) => s.id === newId);
            if (found) {
              setSelectedStudent(found);
              setStep('pick-action');
              return;
            }
            if (attempts < 10) setTimeout(() => pickWhenReady(attempts + 1), 250);
          };
          pickWhenReady();
          onChanged?.();
        }}
      />

      {/* Move existing slot — reuses EditRecurringSlotModal verbatim. */}
      <EditRecurringSlotModal
        open={!!moveSlot}
        onOpenChange={(o) => !o && setMoveSlot(null)}
        slot={moveSlot as any}
        onSaved={handleMoveSaved}
      />
    </>
  );
}