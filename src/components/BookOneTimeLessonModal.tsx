import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, CalendarPlus, Clock, Package as PackageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import {
  fetchLinkablePackages,
  pickFifoLinkable,
  linkablePackageLabel,
  type LinkablePackage,
} from '@/lib/recurringSlotPackages';
import { syncPersistedPackageCounters } from '@/lib/syncPackageCounters';

const LESSON_TYPES = ['Range', 'Playing Lesson'] as const;

function fmtFullDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillDate: string | null;
  prefillTime: string | null;
}

export function BookOneTimeLessonModal({ open, onOpenChange, prefillDate, prefillTime }: Props) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [lessonType, setLessonType] = useState<string>('Range');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<LinkablePackage[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);

  useEffect(() => {
    if (!open) {
      setStudentId('');
      setLessonType('Range');
      setNotes('');
      setPackages([]);
    }
  }, [open]);

  // Auto-pull the student's linkable package (same source of truth as the
  // recurring-schedule / packages screens) as soon as a student is picked.
  useEffect(() => {
    let cancelled = false;
    if (!open || !studentId) { setPackages([]); return; }
    setLoadingPkgs(true);
    fetchLinkablePackages(studentId)
      .then((list) => { if (!cancelled) setPackages(list); })
      .catch((e) => { console.warn('[BookOneTimeLessonModal] package load failed', e); if (!cancelled) setPackages([]); })
      .finally(() => { if (!cancelled) setLoadingPkgs(false); });
    return () => { cancelled = true; };
  }, [open, studentId]);

  const autoPkg = pickFifoLinkable(packages);

  const handleSave = async () => {
    if (!studentId) { toast.error('Pick a student first'); return; }
    if (!prefillDate || !prefillTime) return;
    setSaving(true);
    try {
      // Server-fresh re-check so the link is never based on stale UI state.
      const freshList = await fetchLinkablePackages(studentId);
      const activePkg = pickFifoLinkable(freshList);

      if (!activePkg) {
        toast.warning('No active package found — booking as a single lesson (no package deduction).');
      }

      const { error } = await supabase.from('lessons').insert({
        student_id: studentId,
        lesson_date: prefillDate,
        lesson_time: prefillTime,
        lesson_type: lessonType,
        duration_minutes: 60,
        coach_notes: notes || null,
        status: 'scheduled' as any,
        revenue: 0,
        package_id: activePkg?.id ?? null,
      });
      if (error) throw error;

      // Keep the stored counters in step with the canonical computed counts.
      let computedRemaining: number | undefined;
      if (activePkg) {
        await syncPersistedPackageCounters(activePkg.id);
        const after = await fetchLinkablePackages(studentId, { includePackageId: activePkg.id });
        computedRemaining = after.find((p) => p.id === activePkg.id)?.remaining;
        toast.success(
          `Linked to ${activePkg.package_name || `${activePkg.package_size}-Lesson`}` +
            (computedRemaining !== undefined
              ? ` · ${computedRemaining} lesson${computedRemaining === 1 ? '' : 's'} remaining`
              : ''),
        );
      }


      toast.success('One-time lesson booked!');
      qc.invalidateQueries({ queryKey: ['master-calendar-week'] });
      qc.invalidateQueries({ queryKey: ['all-lessons'] });
      qc.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      qc.invalidateQueries({ queryKey: ['student-packages'] });
      qc.invalidateQueries({ queryKey: ['class-packages'] });

      // Send student confirmation email + admin notification (non-blocking)
      try {
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', studentId)
          .maybeSingle();

        if (studentProfile?.email) {
          supabase.functions
            .invoke('send-notification-email', {
              body: {
                to: studentProfile.email,
                studentName: studentProfile.full_name || 'there',
                notificationType: 'lesson_booked',
                lessonDate: prefillDate,
                lessonTime: prefillTime,
                lessonType,
                lessonsRemaining: computedRemaining ?? null,
                lessonDurationMinutes: 60,
              },
            })
            .catch((e) => console.warn('[BookOneTimeLessonModal] student email failed:', e));
        }

        // Notify admin
        supabase.functions
          .invoke('notify-admin', {
            body: {
              eventType: 'lesson_booked',
              studentName: studentProfile?.full_name || 'A student',
              studentEmail: studentProfile?.email,
              lessonDate: prefillDate,
              lessonTime: prefillTime,
              lessonType,
              notes: notes || '',
            },
          })
          .catch((e) => console.warn('[BookOneTimeLessonModal] admin notify failed:', e));
      } catch (emailErr) {
        console.warn('[BookOneTimeLessonModal] email/notify setup failed:', emailErr);
      }

      onOpenChange(false);
    } catch (err: any) {
      console.error('[BookOneTimeLessonModal] error:', err);
      toast.error(err?.message || 'Failed to book lesson');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-[#F0C040]" />
            Book a one-time lesson
          </DialogTitle>
          <DialogDescription className="text-[#F5F0E8]/60 text-xs">
            Assign a student to this open spot as a one-time lesson.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Date + time summary */}
          {prefillDate && prefillTime && (
            <div className="rounded-xl bg-[#4a7c59]/15 border border-[#4a7c59]/30 px-4 py-3 flex items-center gap-3">
              <Clock className="h-5 w-5 text-[#4a7c59] shrink-0" />
              <div className="min-w-0">
                <p className="text-[#F5F0E8] font-medium text-sm">{fmtFullDate(prefillDate)}</p>
                <p className="text-[#F5F0E8]/70 text-sm">{fmtTime12(prefillTime)}</p>
              </div>
            </div>
          )}

          {/* Student picker */}
          <div>
            <Label className="text-[#F5F0E8]/80 text-sm">Student</Label>
            <div className="mt-1">
              <SearchableStudentSelect
                value={studentId}
                onValueChange={setStudentId}
                variant="dark"
              />
            </div>

            {/* Auto-linked package */}
            {studentId && (
              <div className="mt-2 text-xs flex items-center gap-2">
                {loadingPkgs ? (
                  <span className="text-[#F5F0E8]/50 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking packages…
                  </span>
                ) : autoPkg ? (
                  <span className="flex items-center gap-1.5 rounded-lg bg-[#4a7c59]/20 border border-[#4a7c59]/40 px-2.5 py-1.5 text-[#F5F0E8]">
                    <PackageIcon className="h-3.5 w-3.5 text-[#4a7c59]" />
                    Auto-deducts from {linkablePackageLabel(autoPkg)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg bg-[#F0C040]/10 border border-[#F0C040]/30 px-2.5 py-1.5 text-[#F0C040]">
                    <PackageIcon className="h-3.5 w-3.5" />
                    No active package — books as a single lesson
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Lesson type */}
          <div>
            <Label className="text-[#F5F0E8]/80 text-sm">Lesson type</Label>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LESSON_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[#F5F0E8]/80 text-sm">Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this lesson?"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!studentId || saving}
            className="bg-[#F0C040] hover:bg-[#F0C040]/90 text-[#0d1f18] font-semibold"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Book lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
