import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, AlertTriangle, CheckCircle2, Search, ChevronsUpDown, UserCheck, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStudentsList } from '@/components/SearchableStudentSelect';
import { cn } from '@/lib/utils';
import { detectImportDuplicates, type StudentProfile } from '@/lib/duplicateDetection';
import {
  fetchLinkablePackagesByStudent,
  isLinkable,
  linkablePackageLabel,
  type LinkablePackage,
} from '@/lib/recurringSlotPackages';

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

interface SlotInput {
  id: string;
  student_id: string;
  weekday: number;
  start_time: string;
  no_package_intentional?: boolean | null;
  profile?: { full_name?: string | null; email?: string | null } | null;
}

type PackageOption = LinkablePackage;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Slots that currently have no package_id. */
  slots: SlotInput[];
  onLinked?: () => void;
}

/** Sentinel pick values for manual (non-package) link choices. */
const PICK_NO_PACKAGE = '__no_package__';
const PICK_PENDING = '__pending__';

async function loadAvailablePackageGroups(studentIds: string[]): Promise<Record<string, PackageOption[]>> {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (uniqueStudentIds.length === 0) return {};

  // Unified source of truth shared with the Edit / Add recurring spot modals:
  // is_active packages whose computePackageCounts remaining is > 0. Counts are
  // computed once per package (shared packages are NOT counted per member).
  const grouped = await fetchLinkablePackagesByStudent(uniqueStudentIds);
  const out: Record<string, PackageOption[]> = {};
  for (const [studentId, list] of Object.entries(grouped)) {
    const selectable = list.filter(isLinkable);
    if (selectable.length > 0) out[studentId] = selectable;
  }
  return out;
}

/** Inline searchable picker over the existing students list (no "add new"). */
function StudentMatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: students = [] } = useStudentsList();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = students.find((s) => s.id === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) => (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-8 w-full justify-between text-xs font-normal bg-white/5 border-white/10 text-[#F5F0E8] hover:bg-white/10',
            !value && 'text-[#F5F0E8]/40',
          )}
        >
          <span className="truncate">
            {selected ? selected.full_name || selected.email : 'Match to student…'}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-background border-white/10 z-[60]"
        align="start"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50 text-[#F5F0E8] placeholder:text-[#F5F0E8]/40"
            autoFocus
          />
        </div>
        <div className="max-h-[220px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#F5F0E8]/50">No students found</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                  setSearch('');
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors text-[#F5F0E8] hover:bg-white/10',
                  s.id === value && 'bg-white/5',
                )}
              >
                <UserCheck
                  className={cn('h-4 w-4 shrink-0', s.id === value ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{s.full_name || s.email}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BulkLinkPackagesModal({ open, onOpenChange, slots: rawSlots, onLinked }: Props) {
  const { toast } = useToast();
  // Bug 0 — defensively exclude slots intentionally without a package
  // (e.g. students like Maria Baleva who should never appear in this modal).
  const slots = useMemo(
    () => (rawSlots ?? []).filter((s) => !s.no_package_intentional),
    [rawSlots],
  );
  const { data: allStudents = [] } = useStudentsList(open);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  // student_id -> available packages
  const [packagesByStudent, setPackagesByStudent] = useState<Record<string, PackageOption[]>>({});
  // slot.id -> selected package_id
  const [picks, setPicks] = useState<Record<string, string>>({});
  // slot.id -> selected (checkbox)
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // slot.id -> matched student override (for unlinkable rows)
  const [matches, setMatches] = useState<Record<string, string>>({});
  // tracks which student ids we've already requested packages for (to avoid refetching)
  const [fetchedStudents, setFetchedStudents] = useState<Set<string>>(new Set());

  // Load packages for original slot students whenever the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const studentIds = Array.from(new Set(slots.map((s) => s.student_id).filter(Boolean)));
      console.log(
        '[BulkLinkPackagesModal] recurring_lesson_slots.student_id values used for package lookup:',
        studentIds,
        slots.map((s) => ({ slot_id: s.id, student_id: s.student_id, name: s.profile?.full_name || s.profile?.email })),
      );
      if (studentIds.length === 0) {
        setPackagesByStudent({});
        setFetchedStudents(new Set());
        setLoading(false);
        return;
      }
      try {
        const grouped = await loadAvailablePackageGroups(studentIds);
        if (cancelled) return;
        setPackagesByStudent(grouped);
        setFetchedStudents(new Set(studentIds));
        setPicks({});
        setSelected({});
        setMatches({});
      } catch (error: any) {
        if (cancelled) return;
        toast({ title: 'Error loading packages', description: error.message, variant: 'destructive' });
        setPackagesByStudent({});
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, slots, toast]);

  /** Resolve which student_id should be used for a slot (override > original). */
  const effectiveStudentId = (slot: SlotInput) => matches[slot.id] || slot.student_id;

  /**
   * A row needs a manual student match only when the slot has no resolvable
   * profile (no full_name AND no email) AND the coach hasn't picked one yet.
   * Rows whose user_id is already known (Diana, Paulo, Arantxa, etc.) are NOT
   * "needs match" — we just show their packages directly.
   */
  const needsMatch = (s: SlotInput) =>
    !matches[s.id] && !(s.profile?.full_name || s.profile?.email);

  // Rows the coach can act on right now (have an effective student_id).
  const actionableSlots = useMemo(
    () => slots.filter((s) => !needsMatch(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, matches],
  );
  // Rows still needing a student match (rendered with inline matcher).
  const unmatchedSlots = useMemo(
    () => slots.filter((s) => needsMatch(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, matches],
  );

  const allActionableSelected =
    actionableSlots.length > 0 && actionableSlots.every((s) => selected[s.id]);
  const someActionableSelected =
    actionableSlots.some((s) => selected[s.id]) && !allActionableSelected;

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const s of actionableSlots) next[s.id] = checked;
      return next;
    });
    if (checked) {
      setPicks((prev) => {
        const next = { ...prev };
        for (const s of actionableSlots) {
          if (!next[s.id]) {
            const pkgs = packagesByStudent[effectiveStudentId(s)] ?? [];
            if (pkgs.length > 0) next[s.id] = pkgs[0].id;
          }
        }
        return next;
      });
    }
  };

  // Only checked rows with an effective student AND a pick get processed.
  const qualifyingSlots = useMemo(() => {
    return slots.filter(
      (s) => !!selected[s.id] && !!effectiveStudentId(s) && !!picks[s.id],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, picks, matches, selected]);
  const qualifyingCount = qualifyingSlots.length;
  const selectedSlots = slots.filter((s) => selected[s.id]);
  const selectedCount = selectedSlots.length;

  /** When the coach matches an unlinkable slot to an existing student, fetch that student's packages. */
  const handleMatchStudent = async (slot: SlotInput, newStudentId: string) => {
    setMatches((prev) => ({ ...prev, [slot.id]: newStudentId }));
    if (fetchedStudents.has(newStudentId)) {
      // Auto-pick first package and select the row
      const pkgs = packagesByStudent[newStudentId] ?? [];
      if (pkgs.length > 0) {
        setPicks((prev) => ({ ...prev, [slot.id]: pkgs[0].id }));
        setSelected((prev) => ({ ...prev, [slot.id]: true }));
      }
      return;
    }
    try {
      const grouped = await loadAvailablePackageGroups([newStudentId]);
      const pkgs = grouped[newStudentId] ?? [];
      setPackagesByStudent((prev) => ({ ...prev, [newStudentId]: pkgs }));
      setFetchedStudents((prev) => new Set(prev).add(newStudentId));
      if (pkgs.length > 0) {
        setPicks((prev) => ({ ...prev, [slot.id]: pkgs[0].id }));
        setSelected((prev) => ({ ...prev, [slot.id]: true }));
      } else {
        toast({
          title: 'No active packages',
          description: 'That student has no active package with lessons remaining.',
        });
      }
    } catch (error: any) {
      toast({ title: 'Error loading packages', description: error.message, variant: 'destructive' });
      return;
    }
  };

  const handleApply = async () => {
    if (qualifyingCount === 0) return;
    setSaving(true);
    let linked = 0;
    let failed = 0;
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      for (const slot of qualifyingSlots) {
        const pick = picks[slot.id];
        const newStudentId = matches[slot.id];
        const effStudentId = newStudentId || slot.student_id;

        // Resolve the pick into concrete column values.
        let resolvedPackageId: string | null = null;
        let resolvedNoPackageIntentional = false;

        if (pick === PICK_NO_PACKAGE) {
          resolvedPackageId = null;
          resolvedNoPackageIntentional = true;
        } else if (pick === PICK_PENDING) {
          // Look up the student's most recent active_pending package.
          const { data: pendingPkg } = await supabase
            .from('class_packages')
            .select('id')
            .eq('user_id', effStudentId)
            .eq('ar_status', 'active_pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          resolvedPackageId = (pendingPkg as any)?.id ?? null;
          // Important: NOT intentional — keep slot eligible for FIFO auto-link
          // once a real active package is activated for this student.
          resolvedNoPackageIntentional = false;
        } else {
          resolvedPackageId = pick;
          resolvedNoPackageIntentional = false;
        }

        const slotUpdate: Record<string, any> = {
          package_id: resolvedPackageId,
          no_package_intentional: resolvedNoPackageIntentional,
          updated_at: new Date().toISOString(),
        };
        if (newStudentId && newStudentId !== slot.student_id) {
          slotUpdate.student_id = newStudentId;
        }
        const { error: upErr } = await supabase
          .from('recurring_lesson_slots')
          .update(slotUpdate)
          .eq('id', slot.id);
        if (upErr) {
          console.warn('[BulkLinkPackagesModal] update slot failed:', slot.id, upErr);
          failed++;
          continue;
        }
        const { data: verifiedRow } = await supabase
          .from('recurring_lesson_slots')
          .select('id, package_id')
          .eq('id', slot.id)
          .maybeSingle();
        if (!verifiedRow || (verifiedRow as any).package_id !== resolvedPackageId) {
          console.warn('[BulkLinkPackagesModal] link did not persist:', slot.id);
          failed++;
          continue;
        }
        // Backfill scheduled-and-still-null future lessons (only when we have
        // a concrete package_id). Also rebind student_id if it changed.
        if (resolvedPackageId) {
          const lessonUpdate: Record<string, any> = { package_id: resolvedPackageId };
          if (newStudentId && newStudentId !== slot.student_id) {
            lessonUpdate.student_id = newStudentId;
          }
          const { error: lessonErr } = await supabase
            .from('lessons')
            .update(lessonUpdate)
            .eq('recurring_slot_id', slot.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .is('package_id', null)
            .gte('lesson_date', todayStr);
          if (lessonErr) {
            console.warn('[BulkLinkPackagesModal] backfill lessons failed:', slot.id, lessonErr);
          }
        } else if (newStudentId && newStudentId !== slot.student_id) {
          // No package linked, but still rebind student on future lessons.
          await supabase
            .from('lessons')
            .update({ student_id: newStudentId })
            .eq('recurring_slot_id', slot.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .gte('lesson_date', todayStr);
        }
        linked++;
      }
      toast({
        title: `Linked ${linked} spot${linked !== 1 ? 's' : ''}`,
        description:
          failed > 0
            ? `${failed} failed — check console.`
            : 'Future lessons will deduct from the linked packages.',
      });
      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to apply', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Auto-match every still-unmatched unlinkable slot to the closest existing student
   * by fuzzy name (mirrors the import-duplicate matcher used elsewhere).
   */
  const handleAutoMatchAll = async () => {
    if (allStudents.length === 0) {
      toast({ title: 'Student list not loaded yet', variant: 'destructive' });
      return;
    }
    setAutoMatching(true);
    try {
      const candidates = unmatchedSlots
        .filter((s) => !matches[s.id])
        .map((s, idx) => ({
          slot: s,
          rowIndex: idx,
          clientName: s.profile?.full_name || s.profile?.email || '',
        }))
        .filter((c) => c.clientName.trim().length > 0);

      if (candidates.length === 0) {
        toast({ title: 'Nothing to auto-match' });
        return;
      }

      // Exclude each slot's own current student record from the pool.
      const slotStudentIds = new Set(slots.map((s) => s.student_id));
      const candidatePool: StudentProfile[] = (allStudents as any[])
        .filter((s) => !slotStudentIds.has(s.id))
        .map((s) => ({ id: s.id, full_name: s.full_name, email: s.email }));

      const importedNames = candidates.map((c) => ({
        rowIndex: c.rowIndex,
        clientName: c.clientName,
      }));
      const results = detectImportDuplicates(importedNames, candidatePool);

      const bestByRow = new Map<number, { studentId: string }>();
      for (const r of results) {
        if (!bestByRow.has(r.rowIndex)) {
          bestByRow.set(r.rowIndex, { studentId: r.existingStudent.id });
        }
      }

      let matched = 0;
      let noMatch = 0;
      for (const c of candidates) {
        const best = bestByRow.get(c.rowIndex);
        if (!best) {
          noMatch++;
          continue;
        }
        await handleMatchStudent(c.slot, best.studentId);
        matched++;
      }

      toast({
        title: `Auto-matched ${matched} spot${matched !== 1 ? 's' : ''}`,
        description:
          noMatch > 0
            ? `${noMatch} had no confident match — pick manually or leave blank to skip.`
            : 'Review the matches, then click "Merge & Link all".',
      });
    } catch (e: any) {
      toast({
        title: 'Auto-match failed',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setAutoMatching(false);
    }
  };

  /**
   * Merge & Link all:
   * For each unlinkable slot with a matched student, call merge-students edge function
   * (duplicate=slot.student_id, primary=matched id) so all data consolidates under the
   * existing student. Then link the slot to that student's first active package.
   * Already-linkable rows the coach has selected are linked normally (no merge needed).
   * Rows with no match are skipped.
   */
  const handleMergeAndLinkAll = async () => {
    const toMerge = unmatchedSlots.filter(
      (s) => matches[s.id] && matches[s.id] !== s.student_id,
    );
    const toLinkOnly = actionableSlots.filter((s) => selected[s.id] && picks[s.id]);

    if (toMerge.length === 0 && toLinkOnly.length === 0) {
      toast({
        title: 'Nothing to do',
        description: 'Auto-match or pick rows first, then try again.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    let merged = 0;
    let mergeFailed = 0;
    let linked = 0;
    let linkFailed = 0;
    const alreadyMergedDuplicates = new Set<string>();

    try {
      const todayStr = new Date().toISOString().substring(0, 10);

      for (const slot of toMerge) {
        const primaryId = matches[slot.id];
        const duplicateId = slot.student_id;
        if (!primaryId || primaryId === duplicateId) continue;

        if (!alreadyMergedDuplicates.has(duplicateId)) {
          try {
            const { error: mergeErr } = await supabase.functions.invoke('merge-students', {
              body: { primaryId, duplicateId },
            });
            if (mergeErr) {
              console.warn(
                '[BulkLinkPackagesModal] merge failed:',
                duplicateId,
                '->',
                primaryId,
                mergeErr,
              );
              mergeFailed++;
              continue;
            }
            alreadyMergedDuplicates.add(duplicateId);
            merged++;
          } catch (e) {
            console.warn('[BulkLinkPackagesModal] merge threw:', e);
            mergeFailed++;
            continue;
          }
        }

        // Re-read primary's linkable packages through the unified helper
        // (is_active === true AND remaining > 0). Merge moved any duplicate's
        // packages here too.
        const regrouped = await fetchLinkablePackagesByStudent([primaryId]);
        const pkgs = (regrouped[primaryId] ?? []).filter(isLinkable);
        if (pkgs.length === 0) {
          linkFailed++;
          continue;
        }
        const pkgId = pkgs[0].id;

        const { error: slotErr } = await supabase
          .from('recurring_lesson_slots')
          .update({
            student_id: primaryId,
            package_id: pkgId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id);
        if (slotErr) {
          console.warn('[BulkLinkPackagesModal] slot update failed:', slot.id, slotErr);
          linkFailed++;
          continue;
        }
        // Confirm the write actually landed before counting it as linked.
        const { data: verified } = await supabase
          .from('recurring_lesson_slots')
          .select('id, package_id')
          .eq('id', slot.id)
          .maybeSingle();
        if (!verified || (verified as any).package_id !== pkgId) {
          console.warn('[BulkLinkPackagesModal] slot link did not persist:', slot.id);
          linkFailed++;
          continue;
        }

        await supabase
          .from('lessons')
          .update({ student_id: primaryId, package_id: pkgId })
          .eq('recurring_slot_id', slot.id)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .is('package_id', null)
          .gte('lesson_date', todayStr);

        linked++;
      }

      for (const slot of toLinkOnly) {
        const pick = picks[slot.id];
        const newStudentId = matches[slot.id];
        const effStudentId = newStudentId || slot.student_id;

        // Resolve sentinel picks to concrete column values (same as handleApply).
        let resolvedPackageId: string | null = null;
        let resolvedNoPackageIntentional = false;
        if (pick === PICK_NO_PACKAGE) {
          resolvedPackageId = null;
          resolvedNoPackageIntentional = true;
        } else if (pick === PICK_PENDING) {
          const { data: pendingPkg } = await supabase
            .from('class_packages')
            .select('id')
            .eq('user_id', effStudentId)
            .eq('ar_status', 'active_pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          resolvedPackageId = (pendingPkg as any)?.id ?? null;
          resolvedNoPackageIntentional = false;
        } else {
          resolvedPackageId = pick;
          resolvedNoPackageIntentional = false;
        }

        const slotUpdate: Record<string, any> = {
          package_id: resolvedPackageId,
          no_package_intentional: resolvedNoPackageIntentional,
          updated_at: new Date().toISOString(),
        };
        if (newStudentId && newStudentId !== slot.student_id) {
          slotUpdate.student_id = newStudentId;
        }
        const { error: upErr } = await supabase
          .from('recurring_lesson_slots')
          .update(slotUpdate)
          .eq('id', slot.id);
        if (upErr) {
          console.warn('[BulkLinkPackagesModal] toLinkOnly update failed:', slot.id, upErr);
          linkFailed++;
          continue;
        }
        const { data: verifiedRow } = await supabase
          .from('recurring_lesson_slots')
          .select('id, package_id, no_package_intentional')
          .eq('id', slot.id)
          .maybeSingle();
        if (!verifiedRow || (verifiedRow as any).package_id !== resolvedPackageId) {
          console.warn('[BulkLinkPackagesModal] toLinkOnly link did not persist:', slot.id);
          linkFailed++;
          continue;
        }
        if (resolvedPackageId) {
          const lessonUpdate: Record<string, any> = { package_id: resolvedPackageId };
          if (newStudentId && newStudentId !== slot.student_id) {
            lessonUpdate.student_id = newStudentId;
          }
          await supabase
            .from('lessons')
            .update(lessonUpdate)
            .eq('recurring_slot_id', slot.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .is('package_id', null)
            .gte('lesson_date', todayStr);
        } else if (newStudentId && newStudentId !== slot.student_id) {
          await supabase
            .from('lessons')
            .update({ student_id: newStudentId })
            .eq('recurring_slot_id', slot.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .gte('lesson_date', todayStr);
        }
        linked++;
      }

      const parts: string[] = [];
      if (merged > 0) parts.push(`${merged} student${merged !== 1 ? 's' : ''} merged`);
      if (linked > 0) parts.push(`${linked} spot${linked !== 1 ? 's' : ''} linked`);
      if (mergeFailed > 0) parts.push(`${mergeFailed} merge failed`);
      if (linkFailed > 0) parts.push(`${linkFailed} link failed`);

      toast({
        title: 'Merge & Link complete',
        description: parts.length > 0 ? parts.join(' · ') : 'Nothing changed.',
      });
      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const matchedUnlinkableCount = unmatchedSlots.filter(
    (s) => matches[s.id] && matches[s.id] !== s.student_id,
  ).length;
  const mergeAndLinkTotal =
    matchedUnlinkableCount + selectedSlots.filter((s) => !!picks[s.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link recurring spots to packages</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading packages…
          </div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-[#4a7c59] mx-auto mb-2" />
            All recurring spots are already linked to a package.
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {/* Top toolbar — Auto-match all */}
            {unmatchedSlots.length > 0 && (
              <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {unmatchedSlots.length} spot{unmatchedSlots.length !== 1 ? 's' : ''} need a student match
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoMatchAll}
                  disabled={autoMatching || saving}
                  className="h-8 text-xs gap-1.5"
                >
                  {autoMatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Auto-match all
                </Button>
              </div>
            )}

            {/* Unified table: every slot, one row each. */}
            <div className="rounded-md border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/5 hover:bg-white/5">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allActionableSelected ? true : someActionableSelected ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleAll(v === true)}
                        aria-label="Select all"
                        disabled={actionableSlots.length === 0}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-32">Day / Time</TableHead>
                    <TableHead className="w-64">Link to package</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slots.map((s) => {
                    const matchedId = matches[s.id];
                    const studentIdForPkgs = effectiveStudentId(s);
                    const displayName = s.profile?.full_name || s.profile?.email || 'Unknown';
                    const rowNeedsMatch = needsMatch(s);
                    const hasEffStudent = !!studentIdForPkgs && !rowNeedsMatch;
                    const pkgs = hasEffStudent ? (packagesByStudent[studentIdForPkgs] ?? []) : [];
                    const isSel = !!selected[s.id];
                    const missingPick = isSel && !picks[s.id];
                    return (
                      <TableRow key={s.id} data-state={isSel ? 'selected' : undefined}>
                        <TableCell className="py-2">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={(v) =>
                              setSelected((prev) => ({ ...prev, [s.id]: v === true }))
                            }
                            aria-label={`Select ${displayName}`}
                            disabled={rowNeedsMatch && !matchedId}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="text-sm font-medium text-foreground truncate" title={displayName}>
                            {displayName}
                          </div>
                          {matchedId && (
                            <div className="text-[10px] text-[#4a7c59] mt-0.5 flex items-center gap-1">
                              <UserCheck className="h-3 w-3" /> rebound to existing student
                            </div>
                          )}
                          {rowNeedsMatch && (
                            <div className="mt-1">
                              <StudentMatchPicker
                                value={matches[s.id] ?? ''}
                                onChange={(id) => handleMatchStudent(s, id)}
                              />
                              <div className="text-[10px] text-amber-300/80 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> match a student to enable
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {WEEKDAYS_SHORT[s.weekday]} · {fmtTime(s.start_time)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Select
                            value={picks[s.id] ?? ''}
                            onValueChange={(v) => setPicks((prev) => ({ ...prev, [s.id]: v }))}
                            disabled={!hasEffStudent}
                          >
                            <SelectTrigger
                              className={`h-8 text-xs ${missingPick ? 'border-amber-500/60' : ''}`}
                            >
                              <SelectValue
                                placeholder={hasEffStudent ? 'Pick a package' : 'Match student first'}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {pkgs.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {linkablePackageLabel(p)}
                                </SelectItem>
                              ))}
                              {pkgs.length > 0 && (
                                <div className="my-1 -mx-1 h-px bg-white/10" />
                              )}
                              <SelectItem value={PICK_NO_PACKAGE}>
                                No package (intentional)
                              </SelectItem>
                              <SelectItem value={PICK_PENDING}>
                                Pending payment
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {selectedCount > 0 && selectedSlots.some((s) => !picks[s.id]) && (
              <p className="text-[11px] text-amber-300">
                Rows without a pick will be skipped.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={saving || loading || qualifyingCount === 0}
            variant="outline"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Link {qualifyingCount > 0 ? qualifyingCount : ''} spot{qualifyingCount !== 1 ? 's' : ''}
          </Button>
          <Button
            onClick={handleMergeAndLinkAll}
            disabled={saving || loading || autoMatching || mergeAndLinkTotal === 0}
            className="bg-[#4a7c59] hover:bg-[#4a7c59]/80"
            title={
              matchedUnlinkableCount > 0
                ? `Merges ${matchedUnlinkableCount} duplicate student${matchedUnlinkableCount !== 1 ? 's' : ''} into the matched existing record, then links the spot.`
                : 'No matched unlinkable rows — picks a package for already-linkable selected rows only.'
            }
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Merge & Link all{mergeAndLinkTotal > 0 ? ` (${mergeAndLinkTotal})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
