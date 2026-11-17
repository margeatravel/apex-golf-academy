import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCoachPreview } from '@/contexts/CoachPreviewContext';
import { demoClassPackages, demoProfiles } from '@/data/demoData';
import { fmtMXN } from '@/lib/formatCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, User, Search, AlertTriangle, ArrowUpDown, GitMerge, Loader2, Pencil, Trash2, MoreVertical, Archive as ArchiveIcon, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { EditPackageModal } from '@/components/EditPackageModal';
import { CreatePackageDraftModal } from '@/components/CreatePackageDraftModal';
import { ArchiveStudentDialog } from '@/components/ArchiveStudentDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { hasRemainingLessons, getCurrentPackageId } from '@/lib/packageStatus';
import { computePackageProgress, computePackageCounts } from '@/lib/lessonPackageUsage';
import { syncPersistedPackageCounters } from '@/lib/syncPackageCounters';
import { estimatePackageEndDate, parseLocalYmd } from '@/lib/estimatePackageEndDate';

type UrgencyLevel = 'active' | 'renewal';

// Renewal needed only when the student has actually consumed lessons
// AND has 2 or fewer remaining (e.g. 8/10 used, 18/20 used).
// Brand-new packages (nothing used yet) always show as Active.
function getUrgency(remaining: number, used: number, size: number): UrgencyLevel {
  if (size <= 0) return 'active';
  if (used <= 0) return 'active';
  if (remaining <= 2) return 'renewal';
  return 'active';
}


type SortField = 'usage' | 'urgency' | 'purchase_date' | 'student' | 'est_end';
type SortDir = 'asc' | 'desc';

function dupKey(pkg: any) {
  // Same student + same package_name + same payment_date (or same created_at day if no payment_date)
  const date = pkg.payment_date || (pkg.created_at ? pkg.created_at.slice(0, 10) : '');
  return `${pkg.user_id}|${(pkg.package_name || '').trim().toLowerCase()}|${date}`;
}

export function AdminPackagesView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const { t } = useLanguage();
  const es = language === 'es';
  const { effectiveIsAdmin, effectiveCoachId, user } = useAuth();
  // Coaches (real or previewed) only ever see their own assigned students' packages.
  const scopeCoachId = useCoachPreview()?.coachId ?? (effectiveIsAdmin ? null : (effectiveCoachId ?? user?.id ?? 'none'));
  const [search, setSearch] = useState('');
  
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('usage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tab, setTab] = useState<'active' | 'finished'>('active');
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [editingPkg, setEditingPkg] = useState<any | null>(null);
  const [deletingPkg, setDeletingPkg] = useState<any | null>(null);
  const [draftFromPkg, setDraftFromPkg] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showReviewDup, setShowReviewDup] = useState(false);
  // Paused / archived packages are hidden by default; toggle to review them (records stay in DB).
  const [showPausedArchived, setShowPausedArchived] = useState(false);
  const [archivingStudent, setArchivingStudent] = useState<{ userId: string; name: string } | null>(null);
  // Batch selection — package ids selected via the checkbox column
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<'archive' | 'cxc' | 'delete' | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  // Selection resets whenever the tab or filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, search, urgencyFilter]);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['admin-packages-view', isDemoModeActive() ? 'demo' : 'live', scopeCoachId ?? 'all'],
    queryFn: async () => {
      if (isDemoModeActive()) {
        const profileMap = new Map(demoProfiles.map((p: any) => [p.id, p]));
        // Synthesize completed lessons per package so computePackageProgress
        // renders the spec'd "used" counts (e.g. Carlos 6/10).
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const pastIso = yesterday.toISOString().slice(0, 10);
        return demoClassPackages.map((p: any) => {
          const usedCount = Math.max(0, (p.package_size || 0) - (p.classes_remaining || 0));
          const _linkedLessons = Array.from({ length: usedCount }, (_, i) => ({
            id: `${p.id}-l-${i + 1}`,
            package_id: p.id,
            status: 'completed',
            lesson_date: pastIso,
            lesson_type: 'individual',
          }));
          return {
            ...p,
            profile: profileMap.get(p.user_id) || null,
            _linkedLessons,
          };
        });
      }
      // 1. Fetch packages (no FK to profiles, so manual join)
      let pq = supabase
        .from('class_packages')
        .select('*')
        .order('created_at', { ascending: false });
      // Coach (real or previewed): restrict to packages of their assigned students.
      if (scopeCoachId) {
        const { data: assigned } = await supabase.from('profiles').select('id').eq('assigned_coach_id', scopeCoachId);
        const ids = (assigned || []).map((r: any) => r.id);
        if (ids.length === 0) return [];
        pq = pq.in('user_id', ids);
      }
      const { data: pkgs, error } = await pq;
      if (error) { console.error('Error fetching packages:', error); return []; }
      if (!pkgs?.length) return [];

      // 2. Fetch matching profiles in one shot
      const userIds = [...new Set(pkgs.map((p: any) => p.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_archived')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Exclude packages whose student is archived — read-only filter, records untouched
      const visiblePkgs = pkgs.filter((p: any) => !profileMap.get(p.user_id)?.is_archived);

      // 3. Fetch ALL lessons linked to these packages so we can compute the
      // canonical "used" count live (status='completed', not future-dated,
      // Playing Lesson weighted as 2). The stored class_packages.classes_used
      // column is not trusted here — it has drifted on legacy rows.
      const pkgIds = visiblePkgs.map((p: any) => p.id);
      let lessonsByPkg = new Map<string, any[]>();
      if (pkgIds.length) {
        // Paginate: the API caps responses at 1000 rows, which silently
        // dropped lessons and under-counted some packages.
        const lessons: any[] = [];
        const PAGE = 1000;
        for (let i = 0; i < pkgIds.length; i += 200) {
          const chunk = pkgIds.slice(i, i + 200);
          for (let from = 0; ; from += PAGE) {
            const { data, error: lErr } = await supabase
              .from('lessons')
              .select('id, package_id, status, lesson_date, lesson_type, skipped, recurring_slot_id')
              .in('package_id', chunk)
              .order('id')
              .range(from, from + PAGE - 1);
            if (lErr) throw lErr;
            lessons.push(...(data || []));
            if (!data || data.length < PAGE) break;
          }
        }
        for (const l of lessons) {
          const arr = lessonsByPkg.get(l.package_id!) || [];
          arr.push(l);
          lessonsByPkg.set(l.package_id!, arr);
        }
      }
      // Active recurring slots linked to each package (for end-date projection).
      const slotsByPkg = new Map<string, any[]>();
      if (pkgIds.length) {
        const { data: rs } = await supabase
          .from('recurring_lesson_slots')
          .select('id, package_id, weekday, is_active, starts_on, paused_until, interval_weeks, interval_anchor')
          .eq('is_active', true)
          .in('package_id', pkgIds);
        for (const r of rs || []) {
          const arr = slotsByPkg.get(r.package_id!) || [];
          arr.push(r);
          slotsByPkg.set(r.package_id!, arr);
        }
      }

      // Stored counters drift on some rows; expose the live (canonical) values
      // everywhere in this view and reconcile the persisted columns in the
      // background so other screens (student list, search) match too.
      const drifted: string[] = [];
      const result = visiblePkgs.map((p: any) => {
        const linked = lessonsByPkg.get(p.id) || [];
        const counts = computePackageCounts(p, linked);
        if (p.classes_used !== counts.used || p.classes_remaining !== counts.remaining) drifted.push(p.id);
        return {
          ...p,
          classes_used: counts.used,
          classes_remaining: counts.remaining,
          profile: profileMap.get(p.user_id) || null,
          _linkedLessons: linked,
          _recurringSlots: slotsByPkg.get(p.id) || [],
        };
      });
      if (drifted.length) {
        void Promise.all(drifted.map((id) => syncPersistedPackageCounters(id)));
      }
      return result;
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Find duplicate groups (same student, same name, same payment date)
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const pkg of packages) {
      if (!pkg.user_id) continue;
      const key = dupKey(pkg);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pkg);
    }
    return Array.from(groups.entries())
      .filter(([, pkgs]) => pkgs.length > 1)
      .map(([key, pkgs]) => ({ key, pkgs }));
  }, [packages]);

  // Looser potential-duplicate groups — any student with 2+ packages.
  // Lets the coach review and decide which to merge, even when names/dates differ.
  const potentialDuplicateGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const pkg of packages) {
      if (!pkg.user_id) continue;
      const arr = groups.get(pkg.user_id) || [];
      arr.push(pkg);
      groups.set(pkg.user_id, arr);
    }
    return Array.from(groups.entries())
      .filter(([, pkgs]) => pkgs.length > 1)
      .map(([key, pkgs]) => ({ key, pkgs }))
      .sort((a, b) => b.pkgs.length - a.pkgs.length);
  }, [packages]);

  const handleMergeGroup = async (group: { key: string; pkgs: any[] }) => {
    setMergingKey(group.key);
    try {
      // Sort by created_at asc — keep oldest as the "primary"
      const sorted = [...group.pkgs].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const primary = sorted[0];
      const others = sorted.slice(1);
      const otherIds = others.map(p => p.id);

      const totalSize = sorted.reduce((s, p) => s + (p.package_size || 0), 0);
      const totalUsed = sorted.reduce((s, p) => s + (p.classes_used || 0), 0);
      const totalRemaining = sorted.reduce((s, p) => s + (p.classes_remaining || 0), 0);
      const totalPaid = sorted.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      const totalPrice = sorted.reduce((s, p) => s + Number(p.price || 0), 0);
      const anyActive = totalRemaining > 0;
      const anyPaid = sorted.some(p => p.payment_status === 'paid');

      // 1. Reassign lessons from other packages → primary
      const { error: lessonsErr } = await supabase
        .from('lessons')
        .update({ package_id: primary.id })
        .in('package_id', otherIds);
      if (lessonsErr) throw lessonsErr;

      // 2. Reassign package_payments from other packages → primary
      const { error: paysErr } = await supabase
        .from('package_payments')
        .update({ package_id: primary.id })
        .in('package_id', otherIds);
      if (paysErr) throw paysErr;

      // 3. Reassign package_members (shared students) from other → primary
      const { error: membersErr } = await supabase
        .from('package_members')
        .update({ package_id: primary.id })
        .in('package_id', otherIds);
      if (membersErr) console.warn('package_members update:', membersErr);

      // 4. Update primary with combined totals
      const { error: updateErr } = await supabase
        .from('class_packages')
        .update({
          package_size: totalSize,
          classes_used: totalUsed,
          classes_remaining: totalRemaining,
          amount_paid: totalPaid,
          price: totalPrice,
          is_active: anyActive,
          payment_status: anyPaid ? 'paid' : primary.payment_status,
        })
        .eq('id', primary.id);
      if (updateErr) throw updateErr;

      // 5. Delete the other duplicates
      const { error: delErr } = await supabase
        .from('class_packages')
        .delete()
        .in('id', otherIds);
      if (delErr) throw delErr;

      toast({ title: 'Packages merged', description: `Combined ${sorted.length} duplicate packages into one.` });
      queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
    } catch (e: any) {
      console.error('Merge failed:', e);
      toast({ title: 'Merge failed', description: e?.message || 'Could not merge packages', variant: 'destructive' });
    } finally {
      setMergingKey(null);
    }
  };

  const handleDeletePackage = async () => {
    if (!deletingPkg?.id) return;
    setDeleting(true);
    try {
      // Unlink lessons first so we don't violate constraints / lose history
      await supabase.from('lessons').update({ package_id: null }).eq('package_id', deletingPkg.id);
      await supabase.from('package_payments').delete().eq('package_id', deletingPkg.id);
      await supabase.from('package_members').delete().eq('package_id', deletingPkg.id);
      const { error } = await supabase.from('class_packages').delete().eq('id', deletingPkg.id);
      if (error) throw error;
      toast({ title: 'Package deleted', description: 'The package was removed and its lessons were unlinked.' });
      queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
      setDeletingPkg(null);
    } catch (e: any) {
      console.error('Delete failed:', e);
      toast({ title: 'Delete failed', description: e?.message || 'Could not delete package', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const processed = useMemo(() => {
    // For each student, find the FIFO "currently used" package id so we can
    // tag it in the table (matches the deduction order used by book-lesson).
    const currentByStudent = new Map<string, string | null>();
    {
      const byStudent = new Map<string, any[]>();
      for (const p of packages as any[]) {
        if (!p.user_id) continue;
        const arr = byStudent.get(p.user_id) || [];
        arr.push(p);
        byStudent.set(p.user_id, arr);
      }
      for (const [uid, pkgs] of byStudent) {
        currentByStudent.set(uid, getCurrentPackageId(pkgs as any));
      }
    }
    let result = packages.map((pkg: any) => {
      // Canonical progress: derived live from linked lessons (completed only,
      // weighted). Single source of truth for every progress display.
      const { used, remaining, size: displaySize, pct: usagePct } =
        computePackageProgress(pkg, pkg._linkedLessons || []);
      const isFinished = displaySize > 0 ? used >= displaySize : !hasRemainingLessons(pkg);
      return {
        ...pkg,
        displaySize,
        liveUsed: used,
        liveRemaining: remaining,
        usagePct,
        isFinished,
        urgency: getUrgency(remaining, used, displaySize),
        studentName: pkg.profile?.full_name || pkg.profile?.email || 'Unknown',
        studentEmail: pkg.profile?.email || '',
        isCurrentlyUsed: currentByStudent.get(pkg.user_id) === pkg.id,
        estEnd: estimatePackageEndDate(pkg, pkg._linkedLessons || [], pkg._recurringSlots || []),
      };
    });

    // Paused / archived packages are hidden from this view by default (they
    // stay saved in the database; nothing is deleted or unlinked).
    if (!showPausedArchived) {
      result = result.filter((p: any) => p.is_paused !== true && p.is_archived !== true);
    }

    // Tab partition: Active = still has remaining lessons; Finished = fully used / inactive
    result = result.filter((p: any) => tab === 'finished' ? p.isFinished : !p.isFinished);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p: any) => p.studentName.toLowerCase().includes(q) || p.studentEmail.toLowerCase().includes(q) || (p.package_name || '').toLowerCase().includes(q));
    }
    if (urgencyFilter !== 'all') result = result.filter((p: any) => p.urgency === urgencyFilter);

    const urgencyOrder: Record<UrgencyLevel, number> = { renewal: 0, active: 1 };
    result.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortField) {
        case 'usage': cmp = a.usagePct - b.usagePct; break;
        case 'urgency': cmp = urgencyOrder[a.urgency as UrgencyLevel] - urgencyOrder[b.urgency as UrgencyLevel]; break;
        case 'purchase_date': cmp = (a.created_at || '').localeCompare(b.created_at || ''); break;
        case 'student': cmp = a.studentName.localeCompare(b.studentName); break;
        // "—" (no estimate) always sorts last, in both directions.
        case 'est_end': {
          const av = a.estEnd?.date, bv = b.estEnd?.date;
          cmp = !av && !bv ? 0 : !av ? 1 : !bv ? -1 : av.localeCompare(bv);
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [packages, search, urgencyFilter, sortField, sortDir, tab, showPausedArchived]);

  const stats = useMemo(() => {
    const active = packages.filter((p: any) => hasRemainingLessons(p));
    const renewal = active.filter((p: any) => getUrgency(p.classes_remaining || 0, p.classes_used || 0, p.package_size || 0) === 'renewal');
    const healthy = active.filter((p: any) => getUrgency(p.classes_remaining || 0, p.classes_used || 0, p.package_size || 0) === 'active');
    const finished = packages.length - active.length;
    return { active: active.length, healthy: healthy.length, renewal: renewal.length, total: packages.length, finished };
  }, [packages]);

  // ---- Batch selection ----
  // Selection applies to the currently visible rows (tab + search + filters).
  const visibleSelected = useMemo(
    () => processed.filter((p: any) => selectedIds.has(p.id)),
    [processed, selectedIds]
  );
  const allVisibleSelected = processed.length > 0 && processed.every((p: any) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processed.map((p: any) => p.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Unique students in the current selection (archive is per student, not per package)
  const selectedUniqueStudents = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of visibleSelected) {
      if (p.user_id && !map.has(p.user_id)) map.set(p.user_id, p.studentName || 'Unknown');
    }
    return map;
  }, [visibleSelected]);

  // Batch ARCHIVE — same operation as ArchiveStudentDialog's handleArchive,
  // iterated once per unique student in the selection.
  const handleBatchArchive = async () => {
    if (selectedUniqueStudents.size === 0) return;
    setBatchRunning(true);
    try {
      for (const [userId] of selectedUniqueStudents) {
        const { error } = await supabase
          .from('profiles')
          .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
          .eq('id', userId);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['all-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-canonical'] });
      toast({ title: 'Estudiantes archivados', description: `Se archivaron ${selectedUniqueStudents.size} alumno(s). Puedes restaurarlos desde archivados.` });
      queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
      clearSelection();
      setBatchAction(null);
    } catch (e: any) {
      console.error('Batch archive failed:', e);
      toast({ title: 'Error', description: e?.message || 'No se pudieron archivar los alumnos', variant: 'destructive' });
    } finally {
      setBatchRunning(false);
    }
  };

  // Batch PENDIENTE CXC — same insert as CreatePackageDraftModal's handleCreate,
  // iterated per selected package (uses that package's size and price).
  const handleBatchCxc = async () => {
    if (visibleSelected.length === 0) return;
    setBatchRunning(true);
    try {
      for (const pkg of visibleSelected) {
        const size = pkg.displaySize || pkg.package_size || 0;
        const amt = Number(pkg.price) || 0;
        if (size <= 0 || amt <= 0 || !pkg.user_id) continue;
        const { error } = await supabase
          .from('class_packages')
          .insert({
            user_id: pkg.user_id,
            package_name: `${size}-Lesson Package`,
            package_size: size,
            classes_remaining: size,
            classes_used: 0,
            price: amt,
            amount_paid: 0,
            payment_status: 'pending',
            is_active: true,
            imported: false,
            ar_status: 'active_pending',
          } as any);
        if (error) throw error;
      }
      toast({ title: 'Pendientes creados', description: `Se crearon ${visibleSelected.length} pendiente(s) CXC.` });
      queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
      clearSelection();
      setBatchAction(null);
    } catch (e: any) {
      console.error('Batch CXC failed:', e);
      toast({ title: 'Error', description: e?.message || 'No se pudieron crear los pendientes', variant: 'destructive' });
    } finally {
      setBatchRunning(false);
    }
  };

  // Batch DELETE — same sequence as handleDeletePackage (unlink lessons,
  // remove payments/members, delete the package), iterated per selected package.
  const handleBatchDelete = async () => {
    if (visibleSelected.length === 0) return;
    setBatchRunning(true);
    try {
      for (const pkg of visibleSelected) {
        await supabase.from('lessons').update({ package_id: null }).eq('package_id', pkg.id);
        await supabase.from('package_payments').delete().eq('package_id', pkg.id);
        await supabase.from('package_members').delete().eq('package_id', pkg.id);
        const { error } = await supabase.from('class_packages').delete().eq('id', pkg.id);
        if (error) throw error;
      }
      toast({ title: 'Packages deleted', description: `Removed ${visibleSelected.length} package(s); their lessons were unlinked.` });
      queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
      clearSelection();
      setBatchAction(null);
    } catch (e: any) {
      console.error('Batch delete failed:', e);
      toast({ title: 'Delete failed', description: e?.message || 'Could not delete the selected packages', variant: 'destructive' });
    } finally {
      setBatchRunning(false);
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Always-visible Review Duplicate Packages button */}
      {potentialDuplicateGroups.length > 0 && (
        <Card className="card-elevated border-primary/30">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <GitMerge className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Review Duplicate Packages</p>
                <p className="text-xs text-muted-foreground">
                  {potentialDuplicateGroups.length} student{potentialDuplicateGroups.length === 1 ? '' : 's'} with multiple packages — merge if they're duplicates.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={() => setShowReviewDup(v => !v)}
            >
              <GitMerge className="h-4 w-4" />
              {showReviewDup ? 'Hide' : 'Review & Merge'}
            </Button>
          </CardContent>

          {showReviewDup && (
            <CardContent className="pt-0 space-y-2">
              {potentialDuplicateGroups.map(group => {
                const first = group.pkgs[0];
                const studentName = first.profile?.full_name || first.profile?.email || 'Unknown';
                // Use the same merge handler — make a synthetic key for state tracking
                const groupKey = `student:${group.key}`;
                const merging = mergingKey === groupKey;
                return (
                  <div key={groupKey} className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium truncate">{studentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.pkgs.length} packages · total size {group.pkgs.reduce((s, p) => s + (p.package_size || 0), 0)} · remaining {group.pkgs.reduce((s, p) => s + (p.classes_remaining || 0), 0)} · paid {fmtMXN(group.pkgs.reduce((s, p) => s + Number(p.amount_paid || 0), 0))}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleMergeGroup({ key: groupKey, pkgs: group.pkgs })}
                        disabled={merging}
                      >
                        {merging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                        Merge all
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 pl-1">
                      {group.pkgs.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 border-t border-border/40 pt-1">
                          <span className="truncate">
                            {p.package_name || `${p.package_size}-class`} · {p.classes_used || 0}/{p.package_size || 0} used · {fmtMXN(p.amount_paid || 0)}/{fmtMXN(p.price || 0)}
                          </span>
                          <span className="shrink-0">{p.payment_date || (p.created_at ? p.created_at.slice(0, 10) : '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">
                Merging combines all sizes, used, remaining, paid amounts and lessons into the oldest package; the rest are deleted.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Duplicate packages — merge prompt */}
      {duplicateGroups.length > 0 && (
        <Card className="card-elevated border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-amber-400" />
              Duplicate packages detected ({duplicateGroups.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These look like duplicates (same student, same package name, same payment date). Merge to combine sizes, used, remaining and paid amounts into one record.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {duplicateGroups.map(group => {
              const first = group.pkgs[0];
              const studentName = first.profile?.full_name || first.profile?.email || 'Unknown';
              const date = first.payment_date || (first.created_at ? first.created_at.slice(0, 10) : '—');
              const merging = mergingKey === group.key;
              return (
                <div key={group.key} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div className="text-sm flex-1 min-w-0">
                    <p className="font-medium truncate">{studentName} · {first.package_name || `${first.package_size}-class`}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.pkgs.length} copies · date: {date} · sizes: {group.pkgs.map(p => p.package_size).join(' + ')} · remaining: {group.pkgs.map(p => p.classes_remaining).join(' + ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-amber-500/40 hover:bg-amber-500/10"
                    onClick={() => handleMergeGroup(group)}
                    disabled={merging}
                  >
                    {merging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                    Merge
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'finished')}>
              <TabsList>
                <TabsTrigger value="active">{t('adminTabs.statusActive')} ({stats.active})</TabsTrigger>
                <TabsTrigger value="finished">{t('adminTabs.statusFinished')} ({stats.finished})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('adminTabs.searchStudentOrPackage')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            {tab === 'active' && (
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Urgency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminTabs.filterAll')}</SelectItem>
                <SelectItem value="active">{t('adminTabs.statusActive')}</SelectItem>
                <SelectItem value="renewal">{t('adminTabs.filterUrgencyRenewal')}</SelectItem>
              </SelectContent>
            </Select>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={showPausedArchived} onCheckedChange={(v) => setShowPausedArchived(v === true)} />
              {es ? 'Mostrar pausados/archivados' : 'Show paused/archived'}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Batch action bar — visible when at least one row is selected */}
      {visibleSelected.length > 0 && (
        <Card className="card-elevated border-primary/40 sticky top-2 z-20">
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {visibleSelected.length} {es ? `paquete${visibleSelected.length === 1 ? '' : 's'} seleccionado${visibleSelected.length === 1 ? '' : 's'}` : `package${visibleSelected.length === 1 ? '' : 's'} selected`}
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBatchAction('archive')} disabled={batchRunning}>
                <ArchiveIcon className="h-4 w-4" />
                {es ? 'Archivar alumnos' : 'Archive students'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBatchAction('cxc')} disabled={batchRunning}>
                <Package className="h-4 w-4" />
                {es ? 'Pendiente CXC' : 'Pending AR'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setBatchAction('delete')} disabled={batchRunning}>
                <Trash2 className="h-4 w-4" />
                {es ? 'Eliminar' : 'Delete'}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={clearSelection} disabled={batchRunning}>
                <X className="h-4 w-4" />
                {es ? 'Limpiar' : 'Clear'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : processed.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-heading font-semibold text-lg mb-2">{t('adminTabs.noPackagesFound')}</h3>
              <p className="text-muted-foreground text-sm">{t('adminTabs.noPackagesMatchFilters')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label={es ? 'Seleccionar todos' : 'Select all'}
                      />
                    </TableHead>
                    <TableHead><SortButton field="student" label={t('adminTabs.hdrStudent')} /></TableHead>
                    <TableHead className="font-semibold">{t('adminTabs.hdrPackage')}</TableHead>
                    <TableHead className="text-center min-w-[180px]"><SortButton field="usage" label={t('adminTabs.hdrProgress')} /></TableHead>
                    <TableHead className="font-semibold text-center">{t('adminTabs.hdrPayment')}</TableHead>
                    <TableHead><SortButton field="purchase_date" label={t('adminTabs.hdrPurchased')} /></TableHead>
                    {tab === 'active' && (
                      <TableHead><SortButton field="est_end" label={t('adminTabs.hdrEstEnd')} /></TableHead>
                    )}
                    <TableHead className="font-semibold text-right">{t('adminTabs.hdrPrice')}</TableHead>
                    <TableHead className="font-semibold text-right">{t('adminTabs.hdrActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processed.map((pkg: any) => {
                    return (
                      <TableRow key={pkg.id} className={`hover:bg-secondary/30 ${selectedIds.has(pkg.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(pkg.id)}
                            onCheckedChange={() => toggleSelectOne(pkg.id)}
                            aria-label={es ? 'Seleccionar fila' : 'Select row'}
                          />
                        </TableCell>
                        <TableCell>
                          {pkg.profile?.id ? (
                            <Link
                              to={`/admin/student/${pkg.profile.id}`}
                              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                            >
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-xs">
                                {pkg.studentName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-sm hover:underline">{pkg.studentName}</p>
                                {pkg.studentEmail && <p className="text-xs text-muted-foreground">{pkg.studentEmail}</p>}
                              </div>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-xs">
                                {pkg.studentName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{pkg.studentName}</p>
                                {pkg.studentEmail && <p className="text-xs text-muted-foreground">{pkg.studentEmail}</p>}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{pkg.displaySize}</span>
                          {pkg.ar_status === 'draft' && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                              {es ? 'Borrador' : 'Draft'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const used = pkg.liveUsed ?? 0;
                            const total = pkg.displaySize || 0;
                            const pct = pkg.usagePct;
                            const near = !pkg.isFinished && pct >= 80;
                            const barColor = pkg.isFinished
                              ? 'bg-muted-foreground/60'
                              : near
                                ? 'bg-destructive'
                                : pct >= 50
                                  ? 'bg-amber-400'
                                  : 'bg-success';
                            return (
                              <div className="flex flex-col items-stretch gap-1 min-w-[160px]">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className={`text-sm font-bold ${near ? 'text-destructive' : ''}`}>
                                    {used}<span className="text-muted-foreground font-normal">/{total}</span>
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">{pct}%</span>
                                </div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className={`h-full transition-all ${barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const isPaid = pkg.payment_status === 'paid';
                            const paid = Number(pkg.amount_paid || 0);
                            const total = Number(pkg.price || 0);
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <Badge
                                  variant={isPaid ? 'default' : 'secondary'}
                                  className={isPaid ? 'bg-success/15 text-success border-success/25' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}
                                >
                                  {isPaid ? t('adminTabs.statusPaid') : pkg.payment_status === 'partial' ? t('adminTabs.statusPartial') : t('adminTabs.statusPending')}
                                </Badge>
                                {!isPaid && total > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {fmtMXN(paid)} / {fmtMXN(total)}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {pkg.payment_status === 'paid' && pkg.payment_date
                            ? (language === 'es'
                                ? format(new Date(pkg.payment_date), "d MMM ''yy", { locale: esLocale })
                                : format(new Date(pkg.payment_date), "MMM d ''yy"))
                            : '—'}
                        </TableCell>
                        {tab === 'active' && (
                          <TableCell className="text-sm whitespace-nowrap">
                            {pkg.estEnd ? (
                              <span className={pkg.estEnd.approximate ? 'text-muted-foreground' : ''}>
                                {pkg.estEnd.approximate ? '~' : ''}
                                {language === 'es'
                                  ? format(parseLocalYmd(pkg.estEnd.date), "d MMM ''yy", { locale: esLocale })
                                  : format(parseLocalYmd(pkg.estEnd.date), "MMM d ''yy")}
                              </span>
                            ) : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {pkg.price > 0 ? fmtMXN(Number(pkg.price)) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={es ? 'Más acciones' : 'More actions'}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setEditingPkg(pkg)} className="gap-2 cursor-pointer">
                                <Pencil className="h-4 w-4" />
                                {es ? 'Editar' : 'Edit'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDraftFromPkg(pkg)} className="gap-2 cursor-pointer">
                                <Package className="h-4 w-4" />
                                {es ? 'Pendiente CXC' : 'Pending AR'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setArchivingStudent({ userId: pkg.user_id, name: pkg.studentName })} className="gap-2 cursor-pointer">
                                <ArchiveIcon className="h-4 w-4" />
                                {es ? 'Archivar alumno' : 'Archive student'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeletingPkg(pkg)}
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                                {es ? 'Eliminar' : 'Delete'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit package modal — same flow as student profile */}
      {editingPkg && (
        <EditPackageModal
          open={!!editingPkg}
          onOpenChange={(o) => !o && setEditingPkg(null)}
          pkg={editingPkg}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
            setEditingPkg(null);
          }}
        />
      )}

      {/* Create draft AR pendiente — pre-filled from the selected package */}
      {draftFromPkg && (
        <CreatePackageDraftModal
          open={!!draftFromPkg}
          onOpenChange={(o) => !o && setDraftFromPkg(null)}
          studentId={draftFromPkg.user_id}
          studentName={draftFromPkg.studentName}
          defaultPackageSize={draftFromPkg.displaySize || draftFromPkg.package_size || 4}
          defaultPrice={Number(draftFromPkg.price) || undefined}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
            setDraftFromPkg(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingPkg} onOpenChange={(o) => !o && !deleting && setDeletingPkg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPkg && (
                <>
                  This will permanently remove the <strong>{deletingPkg.package_name || `${deletingPkg.displaySize || deletingPkg.package_size}-class`}</strong> package
                  for <strong>{deletingPkg.profile?.full_name || deletingPkg.profile?.email || 'this student'}</strong>.
                  Linked lessons will be unlinked (kept in history) and any payment records for this package will be removed. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDeletePackage(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch action confirmation — one modal per batch action */}
      <AlertDialog open={!!batchAction} onOpenChange={(o) => !o && !batchRunning && setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchAction === 'archive' && (es ? '¿Archivar alumnos seleccionados?' : 'Archive selected students?')}
              {batchAction === 'cxc' && (es ? '¿Crear pendientes CXC?' : 'Create pending AR entries?')}
              {batchAction === 'delete' && (es ? '¿Eliminar paquetes seleccionados?' : 'Delete selected packages?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchAction === 'archive' && (
                es
                  ? <>Se archivarán <strong>{selectedUniqueStudents.size} alumno(s) único(s)</strong> (la selección incluye {visibleSelected.length} paquete(s)). Sus datos se conservan y puedes restaurarlos desde la sección de archivados.</>
                  : <>This will archive <strong>{selectedUniqueStudents.size} unique student(s)</strong> (selection covers {visibleSelected.length} package(s)). Their data is kept and they can be restored from the archived section.</>
              )}
              {batchAction === 'cxc' && (
                es
                  ? <>Se creará un pendiente CXC (borrador) por cada uno de los <strong>{visibleSelected.length} paquete(s) seleccionados</strong>, con el mismo tamaño y precio de cada paquete. No se activan ni consumen clases hasta aprobarlos.</>
                  : <>A pending AR draft will be created for each of the <strong>{visibleSelected.length} selected package(s)</strong>, using each package's size and price. They won't activate or consume lessons until approved.</>
              )}
              {batchAction === 'delete' && (
                es
                  ? <>Se eliminarán permanentemente <strong>{visibleSelected.length} paquete(s)</strong>. Sus lecciones ligadas se conservarán en el historial (desvinculadas) y se borrarán sus registros de pago del paquete. Esto no se puede deshacer.</>
                  : <>This will permanently delete <strong>{visibleSelected.length} package(s)</strong>. Linked lessons will be kept in history (unlinked) and their package payment records removed. This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchRunning}>{es ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchRunning}
              onClick={(e) => {
                e.preventDefault();
                if (batchAction === 'archive') handleBatchArchive();
                else if (batchAction === 'cxc') handleBatchCxc();
                else if (batchAction === 'delete') handleBatchDelete();
              }}
              className={batchAction === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {batchRunning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {batchAction === 'archive' && (es ? 'Archivar' : 'Archive')}
              {batchAction === 'cxc' && (es ? 'Crear pendientes' : 'Create pending')}
              {batchAction === 'delete' && (es ? 'Eliminar' : 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive student confirmation — reused from student profile */}
      {archivingStudent && (
        <ArchiveStudentDialog
          open={!!archivingStudent}
          onOpenChange={(o) => !o && setArchivingStudent(null)}
          studentId={archivingStudent.userId}
          studentName={archivingStudent.name}
          onArchived={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-packages-view'] });
            setArchivingStudent(null);
          }}
        />
      )}
    </div>
  );
}
