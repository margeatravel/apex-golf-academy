import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserMinus } from 'lucide-react';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { HourPicker } from '@/components/HourPicker';
import { fetchLinkablePackages, isLinkable, linkablePackageLabel, type LinkablePackage } from '@/lib/recurringSlotPackages';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { getCancunToday } from '@/lib/cancunDate';
import {
  findRecurringMoveConflicts,
  findRecurringMoveConflictSlots,
  WEEKDAYS_SHORT_LABEL as WD_LABEL,
  fmtTime12h as fmt12,
  type RecurringConflictSlot,
  getPendingMove,
  cancelPendingMove,
  pendingMoveLabel,
} from '@/lib/pendingRecurringMove';
import { StartsOnField, startsOnShortLabel } from '@/components/recurring/StartsOnField';
import { PauseSlotControl } from '@/components/recurring/PauseSlotControl';
import { ReassignConflictDialog, type ReassignChoice } from '@/components/recurring/ReassignConflictDialog';
import { CadenceSelect } from '@/components/recurring/CadenceSelect';
import { mondayOf, firstWeekdayOnOrAfter } from '@/lib/recurringCadence';

interface Slot {
  id: string;
  student_id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  package_id: string | null;
  no_package_intentional?: boolean;
  /** Future start date (YYYY-MM-DD): the slot only generates lessons from it. */
  starts_on?: string | null;
  coach_id?: string | null;
  pending_weekday?: number | null;
  pending_start_time?: string | null;
  pending_effective_date?: string | null;
  /**
   * Which leg of a scheduled move this card represents:
   * 'current' = lessons BEFORE the effective date, 'pending' = lessons FROM it.
   */
  __segment?: 'current' | 'pending';
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: Slot | null;
  onSaved?: () => void;
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

function normalizeTime(t: string) {
  // "HH:MM" or "HH:MM:SS" → "HH:MM"
  return t.length >= 5 ? t.substring(0, 5) : t;
}

export function EditRecurringSlotModal({ open, onOpenChange, slot, onSaved }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [studentId, setStudentId] = useState('');
  const [weekday, setWeekday] = useState('2');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [lessonType, setLessonType] = useState('Range');
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [packageId, setPackageId] = useState<string>('');
  const [packages, setPackages] = useState<LinkablePackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [saving, setSaving] = useState(false);
  // Single-conflict reassignment (swap / move / remove the other student's slot).
  const [reassignConflict, setReassignConflict] = useState<RecurringConflictSlot | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [updateFuture, setUpdateFuture] = useState(true);
  const [noPackageOverride, setNoPackageOverride] = useState(false);
  const [noPackageIntentional, setNoPackageIntentional] = useState(false);
  const [keepOldTimeOpen, setKeepOldTimeOpen] = useState(true);
  const [confirmConvertOpen, setConfirmConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sharedMembersByPkg, setSharedMembersByPkg] = useState<Record<string, string[]>>({});
  // now = change today (legacy behaviour) · keep = keep lessons before the date ·
  // wipe = delete future scheduled lessons and start fresh on the date
  const [applyMode, setApplyMode] = useState<'now' | 'keep' | 'wipe'>('now');
  const [effectiveDate, setEffectiveDate] = useState('');
  // Draft of the slot's own start date, editable via the "Edit start date" row.
  const [startsOnDraft, setStartsOnDraft] = useState('');
  const [showStartsOnEditor, setShowStartsOnEditor] = useState(false);
  const [cancellingPending, setCancellingPending] = useState(false);

  // A slot with a scheduled move is edited one leg at a time.
  const pendingMove = slot ? getPendingMove(slot) : null;
  const isPendingSegment = !!pendingMove && slot?.__segment === 'pending';
  const isCurrentSegment = !!pendingMove && slot?.__segment === 'current';
  const segmentEdit = isPendingSegment || isCurrentSegment;

  // Hydrate fields when slot changes / modal opens
  useEffect(() => {
    if (open && slot) {
      const move = getPendingMove(slot);
      const usePending = !!move && slot.__segment === 'pending';
      setStudentId(slot.student_id);
      setWeekday(String(usePending ? move!.weekday : slot.weekday));
      setStartTime(usePending ? move!.startTime : normalizeTime(slot.start_time));
      const sp = slot as any;
      const usePendingFields = isPendingSegment && sp.pending_duration_minutes != null;
      setDuration(String((usePendingFields ? sp.pending_duration_minutes : slot.duration_minutes) ?? 60));
      setLessonType((isPendingSegment && sp.pending_lesson_type) || slot.lesson_type || 'Range');
      setPackageId(
        (isPendingSegment && sp.pending_lesson_type ? sp.pending_package_id : slot.package_id) ?? '',
      );
      setIntervalWeeks(
        Number((isPendingSegment && sp.pending_interval_weeks) || sp.interval_weeks || 1),
      );
      setNoPackageOverride(!slot.package_id);
      setNoPackageIntentional(!!slot.no_package_intentional);
      setKeepOldTimeOpen(true);
      setApplyMode('now');
      const tomorrow = new Date(Date.now() - 5 * 3600 * 1000 + 24 * 3600 * 1000)
        .toISOString()
        .substring(0, 10);
      setEffectiveDate(getPendingMove(slot)?.effectiveDate ?? tomorrow);
      const slotStartsOn = slot.starts_on ? String(slot.starts_on).substring(0, 10) : null;
      setStartsOnDraft(slotStartsOn && slotStartsOn > getCancunToday() ? slotStartsOn : '');
      setShowStartsOnEditor(false);
    }
  }, [open, slot]);

  // Fetch packages for the (possibly newly chosen) student
  useEffect(() => {
    if (!open || !studentId) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      // Unified source of truth: only is_active packages whose computePackageCounts
      // remaining (total − completed) is > 0, plus the currently linked one.
      let list: LinkablePackage[] = [];
      try {
        list = await fetchLinkablePackages(studentId, {
          includePackageId: slot && studentId === slot.student_id ? slot.package_id : null,
        });
      } catch (e) {
        console.warn('[EditRecurringSlotModal] Failed to load packages:', e);
      }
      if (cancelled) return;
      setPackages(list);
      {
        const stillValid =
          slot && slot.package_id && list.some((p) => p.id === slot.package_id) && studentId === slot.student_id;
        if (stillValid) {
          setPackageId(slot!.package_id as string);
        } else if (list.length === 1) {
          setPackageId(list[0].id);
        } else {
          setPackageId('');
        }
      }
      setLoadingPackages(false);

      // Fetch member names for "Shared with: …" hint
      const ids = list.map((p: any) => p.id);
      if (ids.length > 0) {
        const { data: memberRows } = await supabase
          .from('package_members')
          .select('package_id, student_id')
          .in('package_id', ids);
        const memberIds = Array.from(new Set((memberRows || []).map((m: any) => m.student_id).filter(Boolean)));
        const ownerIds = list.map((p: any) => (p as any).user_id).filter(Boolean);
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
          const all = Array.from(new Set([(p as any).user_id, ...memberStudentIds])).filter(Boolean);
          const others = all.filter((id: string) => id !== studentId);
          if (others.length > 0) map[p.id] = others.map((id: string) => nameById.get(id) || 'Student');
        });
        if (!cancelled) setSharedMembersByPkg(map);
      } else if (!cancelled) {
        setSharedMembersByPkg({});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId]);

  // Only is_active packages with remaining > 0 are selectable. The currently
  // linked package is fetched (includePackageId) so we can display it, but it
  // never becomes a selectable option once it runs out of lessons.
  const selectablePackages = packages.filter(isLinkable);

  // Did the weekly day/time move? (recurring times are fixed slots)
  const baseWeekday = isPendingSegment ? pendingMove!.weekday : slot?.weekday;
  const baseStartTime = isPendingSegment
    ? pendingMove!.startTime
    : slot
    ? normalizeTime(slot.start_time)
    : '';
  const timeChanged =
    !!slot && (parseInt(weekday, 10) !== baseWeekday || startTime !== baseStartTime);
  // Any schedule field changed (day, time, duration, lesson type or package).
  const slotAny = slot as any;
  const scheduleChanged =
    timeChanged ||
    (!!slot &&
      (parseInt(duration, 10) !== (slotAny.duration_minutes ?? 60) ||
        lessonType !== (slotAny.lesson_type ?? 'Range') ||
        (noPackageOverride ? null : packageId || null) !== (slotAny.package_id ?? null) ||
        intervalWeeks !== Number(slotAny.interval_weeks ?? 1)));

  const handleSave = async (reassign?: { conflict: RecurringConflictSlot; choice: ReassignChoice }) => {
    if (!slot) return;
    if (!studentId) {
      toast({ title: 'Pick a student', variant: 'destructive' });
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
    // Editing one leg of a scheduled move never re-asks how to apply it:
    // the 'pending' card always writes the future leg, 'current' the present one.
    const scheduled =
      isPendingSegment || (!segmentEdit && scheduleChanged && applyMode !== 'now');
    const wipeBefore = scheduled && !segmentEdit && applyMode === 'wipe';
    // Only the "Starting from" date changed (future): it becomes the slot's
    // start date (starts_on). Keep/Delete don't apply; no pending segment.
    // When the slot already has a future starts_on and the "Edit start date"
    // draft changed, applyMode is irrelevant: it's a pure start-date edit.
    const slotStartsOn = slot.starts_on ? String(slot.starts_on).substring(0, 10) : null;
    const startsOnDraftChanged =
      !!slotStartsOn && startsOnDraft.length > 0 && startsOnDraft !== slotStartsOn;
    const startsOnOnly =
      !segmentEdit &&
      !scheduleChanged &&
      studentId === slot.student_id &&
      (startsOnDraftChanged
        ? startsOnDraft > getCancunToday()
        : applyMode !== 'now' && !!effectiveDate && effectiveDate > getCancunToday());
    // The date actually written/used on the startsOnOnly route.
    const activeStartsOn = startsOnDraftChanged ? startsOnDraft : effectiveDate;
    if (scheduled) {
      if (!effectiveDate) {
        toast({ title: 'Pick a start date', variant: 'destructive' });
        return;
      }
      if (effectiveDate <= getCancunToday()) {
        toast({
          title: 'Date must be in the future',
          description: 'Use “Apply now” to change the schedule starting today.',
          variant: 'destructive',
        });
        return;
      }
    }
    setSaving(true);
    try {
      const newTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const newWeekday = parseInt(weekday, 10);
      const newDuration = parseInt(duration, 10);
      const studentChanged = studentId !== slot.student_id;
      // Cadence anchor: Monday of the first occurrence (now) or of the effective date (scheduled).
      const intervalAnchor = scheduled
        ? mondayOf(effectiveDate)
        : mondayOf(firstWeekdayOnOrAfter(getCancunToday(), newWeekday));

      // Conflict guard: another student already sitting on the target
      // day/time (Playing Lessons span two hours).
      if (timeChanged || (scheduled && !segmentEdit)) {
        const clashSlots = (
          await findRecurringMoveConflictSlots({
            slotId: slot.id,
            weekday: newWeekday,
            startTime,
            durationMinutes: newDuration,
            lessonType,
            coachId: slot.coach_id ?? user?.id ?? null,
            effectiveDate: scheduled ? effectiveDate : getCancunToday(),
            intervalWeeks,
            intervalAnchor,
          })
        ).filter((c) => c.slotId !== reassign?.conflict.slotId);
        if (clashSlots.length === 1 && !reassign) {
          // Exactly one student in the way: offer to reassign them instead of failing.
          setReassignConflict(clashSlots[0]);
          setReassignOpen(true);
          setSaving(false);
          return;
        }
        if (clashSlots.length > 0) {
          const clashes = clashSlots.map((c) => `${c.studentName} · ${WD_LABEL[c.weekday]} ${fmt12(c.startTime)}`);
          toast({
            title: 'Time already taken',
            description: `Another recurring spot overlaps: ${clashes.join(', ')}.`,
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }
      }

      // Step 1 of a reassignment: update the OTHER slot first (same apply mode).
      let otherPrev: Record<string, any> | null = null;
      let otherLabel = '';
      const otherEffective = scheduled ? effectiveDate : getCancunToday();
      if (reassign) {
        const { conflict, choice } = reassign;
        const { data: prevRow, error: prevErr } = await supabase
          .from('recurring_lesson_slots')
          .select('*')
          .eq('id', conflict.slotId)
          .single();
        if (prevErr || !prevRow) throw prevErr ?? new Error('Conflicting slot not found');
        const pr: any = prevRow;
        otherPrev = {
          weekday: pr.weekday, start_time: pr.start_time, is_active: pr.is_active,
          pending_weekday: pr.pending_weekday, pending_start_time: pr.pending_start_time,
          pending_effective_date: pr.pending_effective_date, pending_wipe: pr.pending_wipe,
          pending_duration_minutes: pr.pending_duration_minutes, pending_lesson_type: pr.pending_lesson_type,
          pending_package_id: pr.pending_package_id, pending_no_package_intentional: pr.pending_no_package_intentional,
          pending_interval_weeks: pr.pending_interval_weeks, updated_at: pr.updated_at,
        };
        let otherPatch: Record<string, any>;
        if (choice.kind === 'remove') {
          otherPatch = { is_active: false, updated_at: new Date().toISOString() };
          otherLabel = 'sin horario fijo';
        } else {
          const tWd = choice.kind === 'swap' ? slot.weekday : choice.weekday;
          const tHM = choice.kind === 'swap' ? String(slot.start_time).substring(0, 5) : choice.startTime;
          const tTime = `${tHM}:00`;
          otherLabel = `${WD_LABEL[tWd]} ${fmt12(tHM)}`;
          otherPatch = scheduled
            ? {
                pending_weekday: tWd,
                pending_start_time: tTime,
                pending_effective_date: effectiveDate,
                pending_wipe: wipeBefore,
                pending_duration_minutes: pr.duration_minutes,
                pending_lesson_type: pr.lesson_type,
                pending_package_id: pr.package_id,
                pending_no_package_intentional: pr.no_package_intentional,
                pending_interval_weeks: pr.interval_weeks,
                pending_interval_anchor: pr.interval_anchor,
                updated_at: new Date().toISOString(),
              }
            : { weekday: tWd, start_time: tTime, updated_at: new Date().toISOString() };
        }
        const { error: oErr } = await supabase
          .from('recurring_lesson_slots')
          .update(otherPatch)
          .eq('id', conflict.slotId);
        if (oErr) throw oErr;
      }

      const basePatch: Record<string, any> = {
        student_id: studentId,
        duration_minutes: newDuration,
        lesson_type: lessonType,
        package_id: noPackageOverride ? null : packageId,
        no_package_intentional: noPackageOverride ? noPackageIntentional : false,
        updated_at: new Date().toISOString(),
      };
      const patch = isCurrentSegment
        ? {
            // Only the leg BEFORE the effective date moves; the scheduled change stays.
            ...basePatch,
            weekday: newWeekday,
            start_time: newTime,
          }
        : scheduled
        ? {
            // Base leg keeps its original day/time/duration/type/package until
            // the effective date; the new values live on the pending leg.
            student_id: studentId,
            updated_at: basePatch.updated_at,
            pending_weekday: newWeekday,
            pending_start_time: newTime,
            pending_effective_date: effectiveDate,
            pending_wipe: wipeBefore,
            pending_duration_minutes: newDuration,
            pending_lesson_type: lessonType,
            pending_package_id: basePatch.package_id,
            pending_no_package_intentional: basePatch.no_package_intentional,
            pending_interval_weeks: intervalWeeks,
            pending_interval_anchor: intervalAnchor,
          }
        : {
            ...basePatch,
            weekday: newWeekday,
            start_time: newTime,
            pending_weekday: null,
            pending_start_time: null,
            pending_effective_date: null,
            pending_wipe: false,
            pending_duration_minutes: null,
            pending_lesson_type: null,
            pending_package_id: null,
            pending_no_package_intentional: null,
            interval_weeks: intervalWeeks,
            interval_anchor: intervalAnchor,
            pending_interval_weeks: null,
            pending_interval_anchor: null,
          };

      const { error } = await supabase
        .from('recurring_lesson_slots')
        .update(
          startsOnOnly
            ? { starts_on: activeStartsOn, updated_at: new Date().toISOString() }
            : patch,
        )
        .eq('id', slot.id);
      if (error) {
        // Step 2 failed: revert the other slot to its previous values.
        if (reassign && otherPrev) {
          await supabase.from('recurring_lesson_slots').update(otherPrev).eq('id', reassign.conflict.slotId);
        }
        throw error;
      }

      // Option "remove": only the other slot's auto-generated, still-scheduled
      // lessons from the effective date on are deleted. The slot row stays.
      if (reassign?.choice.kind === 'remove') {
        await supabase
          .from('lessons')
          .delete()
          .eq('recurring_slot_id', reassign.conflict.slotId)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .gte('lesson_date', otherEffective);
      }

      // Recurring times are fixed slots: if the spot moved, keep the previous
      // day/time on the calendar as an open spot other students can claim.
      if (timeChanged && !scheduled && !segmentEdit && keepOldTimeOpen && user?.id) {
        const oldStart =
          String(slot.start_time).length === 5 ? `${slot.start_time}:00` : String(slot.start_time);
        const { data: existingOpen } = await supabase
          .from('fixed_schedule_slots')
          .select('id')
          .eq('day_of_week', slot.weekday)
          .eq('start_time', oldStart)
          .is('student_id', null)
          .limit(1);
        if (!existingOpen || existingOpen.length === 0) {
          const { error: openErr } = await supabase.from('fixed_schedule_slots').insert({
            day_of_week: slot.weekday,
            start_time: oldStart,
            duration_minutes: slot.duration_minutes ?? 60,
            lesson_type: slot.lesson_type ?? lessonType,
            is_available: true,
            student_id: null,
            created_by: user.id,
            coach_id: user.id,
            notes: 'Kept open after recurring spot moved',
          });
          if (openErr) console.warn('[EditRecurringSlotModal] Failed to keep old time open:', openErr);
        }
      }

      // If the spot moved onto a day/time that already had an OPEN slot, that open
      // slot is now taken by this student: remove it so the time isn't double-booked.
      if (timeChanged && !scheduled && !segmentEdit) {
        const { error: dropErr } = await supabase
          .from('fixed_schedule_slots')
          .delete()
          .eq('day_of_week', newWeekday)
          .eq('start_time', newTime)
          .is('student_id', null);
        if (dropErr) console.warn('[EditRecurringSlotModal] Failed to consume open spot:', dropErr);
      }

      if (startsOnOnly) {
        // Only auto-generated, still-scheduled lessons of THIS slot before the
        // new start date go away; completed/no_show/cancelled/manual stay.
        // Moving the start EARLIER (or to the same date) deletes nothing.
        const oldStart = slot.starts_on ? String(slot.starts_on).substring(0, 10) : null;
        if (!oldStart || activeStartsOn > oldStart) {
          await supabase
            .from('lessons')
            .delete()
            .eq('recurring_slot_id', slot.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .lt('lesson_date', activeStartsOn);
        }
      }

      if (updateFuture || scheduled || startsOnOnly) {
        // Wipe future auto-generated, still-scheduled lessons from this slot, then regenerate.
        // Completed / no_show / cancelled lessons are never touched.
        const todayStr = getCancunToday();
        await supabase
          .from('lessons')
          .delete()
          .eq('recurring_slot_id', slot.id)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .gte('lesson_date', todayStr);

        const { error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', {
          body: { student_id: studentId },
        });
        if (fnErr) console.warn('generate-recurring-lessons failed:', fnErr);

        // If student changed, also regenerate for the original student so any cleanup propagates
        if (studentChanged) {
          await supabase.functions.invoke('generate-recurring-lessons', {
            body: { student_id: slot.student_id },
          });
        }
      }

      if (reassign) {
        // Regenerate for both students (edited one only if not already done above).
        if (!(updateFuture || scheduled || startsOnOnly)) {
          await supabase.functions.invoke('generate-recurring-lessons', { body: { student_id: studentId } });
        }
        if (reassign.conflict.studentId) {
          await supabase.functions.invoke('generate-recurring-lessons', {
            body: { student_id: reassign.conflict.studentId },
          });
        }
        toast({ title: `Horario actualizado. ${reassign.conflict.studentName} → ${otherLabel}.` });
        setReassignOpen(false);
        setReassignConflict(null);
        onSaved?.();
        onOpenChange(false);
        return;
      }

      toast({
        title: isCurrentSegment
          ? 'Current schedule updated'
          : scheduled
          ? 'Scheduled change saved'
          : 'Spot updated',
        description: scheduled ? `New schedule starts on ${effectiveDate}.` : undefined,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to update spot', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToOpen = async () => {
    if (!slot) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    setConverting(true);
    try {
      const newTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const newWeekday = parseInt(weekday, 10);
      const newDuration = parseInt(duration, 10);

      // 1) Post a new OPEN spot in fixed_schedule_slots so subscribed students can claim it.
      const { error: insertErr } = await supabase.from('fixed_schedule_slots').insert({
        day_of_week: newWeekday,
        start_time: newTime,
        duration_minutes: newDuration,
        lesson_type: lessonType,
        is_available: true,
        student_id: null,
        created_by: user.id,
        coach_id: user.id,
        notes: 'Released from recurring schedule',
      });
      if (insertErr) throw insertErr;

      // 2) Wipe future auto-generated, still-scheduled lessons tied to this recurring slot.
      const todayStr = new Date().toISOString().substring(0, 10);
      await supabase
        .from('lessons')
        .delete()
        .eq('recurring_slot_id', slot.id)
        .eq('auto_generated', true)
        .eq('status', 'scheduled')
        .gte('lesson_date', todayStr);

      // 3) Remove the recurring slot itself.
      const { error: delErr } = await supabase
        .from('recurring_lesson_slots')
        .delete()
        .eq('id', slot.id);
      if (delErr) throw delErr;

      toast({
        title: 'Slot released and posted as open',
        description: 'Students can now claim it from the open spots list.',
      });
      setConfirmConvertOpen(false);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to release spot',
        variant: 'destructive',
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit recurring spot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Student *</Label>
            <SearchableStudentSelect value={studentId} onValueChange={setStudentId} variant="dark" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Day of week</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = String(d.value) === weekday;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setWeekday(String(d.value))}
                    className={
                      'h-10 rounded-md text-xs font-medium border transition-colors ' +
                      (active
                        ? 'bg-[#4a7c59] text-ivory border-[#4a7c59]'
                        : 'bg-transparent text-ivory/70 border-ivory/20 hover:border-ivory/40')
                    }
                    title={d.full}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Start time</Label>
              <HourPicker value={startTime} onChange={(v) => setStartTime(v)} className="w-full" />
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

          {!isCurrentSegment && (
            <CadenceSelect value={intervalWeeks} onChange={setIntervalWeeks} />
          )}

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
              {studentId && !loadingPackages && (
                <span className="text-ivory/40 ml-1">· {selectablePackages.length} available</span>
              )}
            </Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!studentId || loadingPackages || selectablePackages.length === 0 || noPackageOverride}>
              <SelectTrigger>
                <SelectValue placeholder={
                  noPackageOverride
                    ? 'No package — pay later'
                    : loadingPackages
                    ? 'Loading packages…'
                    : selectablePackages.length === 0
                      ? 'No packages with lessons remaining — create one first'
                      : 'Select a package'
                } />
              </SelectTrigger>
              <SelectContent>
                {selectablePackages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {linkablePackageLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {packageId && sharedMembersByPkg[packageId]?.length > 0 && (
              <p className="text-[11px] text-[#F0C040]/90 leading-snug">
                👥 Shared with: <span className="font-medium">{sharedMembersByPkg[packageId].join(', ')}</span> — every auto-generated lesson will count once and show on every member's profile.
              </p>
            )}
            {studentId && !loadingPackages && packages.length === 0 && !noPackageOverride && (
              <p className="text-[11px] text-red-400">
                This student has no package with lessons remaining. Add one in their profile before saving this spot.
              </p>
            )}

            <label className="flex items-start gap-2 text-xs text-ivory/80 cursor-pointer pt-1">
              <Checkbox
                checked={noPackageOverride}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setNoPackageOverride(next);
                  if (next) setPackageId('');
                  if (!next) setNoPackageIntentional(false);
                }}
                className="mt-0.5"
              />
              <span>
                Override — no package yet (student will pay later).{' '}
                <span className="text-amber-300/90">Lessons will not auto-deduct until you link a package.</span>
              </span>
            </label>

            {noPackageOverride && (
              <label className="flex items-start gap-2 text-xs text-ivory/80 cursor-pointer pt-1 pl-6">
                <Checkbox
                  checked={noPackageIntentional}
                  onCheckedChange={(v) => setNoPackageIntentional(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Mark as permanently no-package{' '}
                  <span className="text-ivory/60">(exclude from warnings and auto-generate lessons without a package).</span>
                </span>
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-ivory/70 cursor-pointer">
            <input
              type="checkbox"
              checked={updateFuture}
              onChange={(e) => setUpdateFuture(e.target.checked)}
            />
            Replace future auto-generated lessons with the new schedule
          </label>

          {segmentEdit && pendingMove && (
            <div className="space-y-2 rounded-md border border-[#F0C040]/30 bg-[#F0C040]/5 px-3 py-2">
              <p className="text-[11px] text-[#F0C040] leading-snug">
                {isCurrentSegment
                  ? `You're editing the schedule used until ${pendingMove.effectiveDate}. Lessons from that date on keep the new time.`
                  : `You're editing the schedule used from ${pendingMove.effectiveDate} on. Earlier lessons keep the current time.`}
              </p>
              {isPendingSegment && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Applies from</Label>
                  <DateField
                    value={effectiveDate}
                    min={getCancunToday()}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {!segmentEdit && slot && getPendingMove(slot) && (
            <div className="rounded-md border border-[#F0C040]/40 bg-[#F0C040]/10 px-3 py-2 flex items-start justify-between gap-2">
              <p className="text-[11px] text-[#F0C040] leading-snug">
                {pendingMoveLabel(getPendingMove(slot)!)}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] flex-shrink-0"
                disabled={cancellingPending}
                onClick={async () => {
                  setCancellingPending(true);
                  try {
                    await cancelPendingMove(slot.id);
                    await supabase.functions.invoke('generate-recurring-lessons', {
                      body: { student_id: slot.student_id },
                    });
                    toast({ title: 'Scheduled change cancelled' });
                    onSaved?.();
                    onOpenChange(false);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message, variant: 'destructive' });
                  } finally {
                    setCancellingPending(false);
                  }
                }}
              >
                {cancellingPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Cancel
              </Button>
            </div>
          )}

          {/* Existing future start date: show it and let the coach edit just that date. */}
          {!segmentEdit &&
            slot &&
            slot.starts_on &&
            String(slot.starts_on).substring(0, 10) > getCancunToday() &&
            !showStartsOnEditor && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-[#F0C040]/30 bg-[#F0C040]/5 px-3 py-2">
                <p className="text-[11px] text-[#F0C040] leading-snug">
                  Start date: {startsOnShortLabel(String(slot.starts_on).substring(0, 10))}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] flex-shrink-0"
                  onClick={() => setShowStartsOnEditor(true)}
                >
                  Edit start date
                </Button>
              </div>
            )}
          {showStartsOnEditor && !segmentEdit && (
            <StartsOnField value={startsOnDraft} onChange={setStartsOnDraft} labelClassName="text-xs" />
          )}

          {!segmentEdit && (
            <div className="space-y-2 rounded-md border border-ivory/15 bg-white/5 p-3">
              <Label className="text-xs">Starting from</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['now', 'keep', 'wipe'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setApplyMode(m)}
                    className={
                      'h-9 rounded-md text-[11px] font-medium border transition-colors px-1 ' +
                      (applyMode === m
                        ? 'bg-[#4a7c59] text-ivory border-[#4a7c59]'
                        : 'bg-transparent text-ivory/70 border-ivory/20 hover:border-ivory/40')
                    }
                  >
                    {m === 'now'
                      ? 'Today'
                      : m === 'keep'
                      ? 'Keep scheduled'
                      : 'Delete scheduled'}
                  </button>
                ))}
              </div>
              {applyMode !== 'now' && (
                <div className="space-y-1">
                  <DateField
                    value={effectiveDate}
                    min={getCancunToday()}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[11px] text-ivory/50 leading-snug">
                    {applyMode === 'keep'
                      ? 'Lessons before this date stay on the current time; from this date on they use the new day/time. Nothing extra is generated — the package total is unchanged.'
                      : 'All future scheduled lessons are deleted; the new day/time starts on this date. Completed, no-show and cancelled lessons are never touched.'}
                  </p>
                </div>
              )}

              {applyMode === 'now' && (
                <label className="flex items-start gap-2 text-xs text-ivory/80 cursor-pointer pt-1">
                  <Checkbox
                    checked={keepOldTimeOpen}
                    onCheckedChange={(v) => setKeepOldTimeOpen(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Keep the previous time ({WEEKDAYS.find((d) => d.value === slot?.weekday)?.label}{' '}
                    {slot ? normalizeTime(slot.start_time) : ''}) open for other students{' '}
                    <span className="text-ivory/50">— it stays on the calendar as an open spot.</span>
                  </span>
                </label>
              )}
            </div>
          )}



          <div className="pt-2 border-t border-ivory/10">
            <button
              type="button"
              onClick={() => setConfirmConvertOpen(true)}
              disabled={saving || converting}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 text-xs font-medium py-2 transition-colors disabled:opacity-50"
            >
              <UserMinus className="h-3.5 w-3.5" />
              Release as open spot (no student)
            </button>
            <p className="text-[11px] text-ivory/50 mt-1.5 leading-snug">
              Removes the student from this weekly slot and posts it as an open spot Scratch / Pro members can claim.
            </p>
          </div>
          {slot?.id && (
            <div className="pt-3 border-t border-white/10">
              <Label className="text-xs">Pausar hasta / Pause until</Label>
              <div className="mt-1.5">
                <PauseSlotControl slot={slot} onDone={() => onSaved?.()} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => handleSave()} disabled={saving} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save changes
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmConvertOpen} onOpenChange={setConfirmConvertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Release this recurring spot?</AlertDialogTitle>
              <AlertDialogDescription>
                The student will be removed from this weekly slot, and any future auto-generated lessons
                from it will be deleted. The slot will be posted as an open recurring spot that
                Scratch and Pro members can claim.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={converting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConvertToOpen();
                }}
                disabled={converting}
                className="bg-amber-500 hover:bg-amber-500/90 text-black"
              >
                {converting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Release as open spot
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {slot && (
          <ReassignConflictDialog
            open={reassignOpen}
            onOpenChange={(o) => {
              setReassignOpen(o);
              if (!o) setReassignConflict(null);
            }}
            conflict={reassignConflict}
            editedSlotId={slot.id}
            originalWeekday={slot.weekday}
            originalStartTime={String(slot.start_time)}
            newWeekday={parseInt(weekday, 10)}
            newStartTime={startTime}
            newDurationMinutes={parseInt(duration, 10)}
            newLessonType={lessonType}
            coachId={slot.coach_id ?? user?.id ?? null}
            effectiveDate={
              isPendingSegment || (!segmentEdit && scheduleChanged && applyMode !== 'now')
                ? effectiveDate
                : getCancunToday()
            }
            busy={saving}
            onConfirm={(choice) => reassignConflict && handleSave({ conflict: reassignConflict, choice })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
