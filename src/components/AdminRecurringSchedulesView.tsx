import { RecurringSchedulePdfButton } from '@/components/pdf/ScheduleExportButtons';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoRecurringSlots } from '@/data/demoData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Repeat, RefreshCw, Trash2, Loader2, ExternalLink, Plus, Upload, AlertTriangle, X, UserPlus, CalendarPlus, CalendarOff, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddOpenSpotModal } from '@/components/AddOpenSpotModal';
import { subscriptionTierStyle } from '@/components/calendar/calendarTypes';
import { resolveStudentTiers } from '@/components/calendar/resolveStudentTiers';
import { AddRecurringSlotModal } from '@/components/AddRecurringSlotModal';
import { EditRecurringSlotModal } from '@/components/EditRecurringSlotModal';
import { EditOpenSpotModal } from '@/components/EditOpenSpotModal';
import { AssignSpotModal } from '@/components/AssignSpotModal';
import { ImportRecurringSlotsModal } from '@/components/ImportRecurringSlotsModal';
import { BulkLinkPackagesModal } from '@/components/BulkLinkPackagesModal';
import { fetchLinkablePackagesByStudent, pickFifoLinkable } from '@/lib/recurringSlotPackages';
import { SkipWeekModal } from '@/components/SkipWeekModal';
import { RecurringScheduleActionSheet, type RecurringSheetSlot } from '@/components/RecurringScheduleActionSheet';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { Pencil } from 'lucide-react';
import { PendingMoveBadge } from '@/components/PendingMoveBadge';
import { StartsOnBadge } from '@/components/StartsOnBadge';
import { PausedChip } from '@/components/recurring/PausedChip';
import { EndsOnChip } from '@/components/recurring/EndsOnChip';
import { CadenceBadge } from '@/components/recurring/CadenceBadge';
import { getPendingMove, cancelPendingMove, normalizeTimeHM } from '@/lib/pendingRecurringMove';
import { getCancunToday } from '@/lib/cancunDate';
import { hasRemainingLessons } from '@/lib/packageStatus';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Small badge with lessons left in the student's package — same colors as Live Calendar:
// white: 6+ left · yellow: 5-3 · red: 2 or fewer (incl. 0)
function RemainingBadge({ remaining, fontSize = 9, corner = false }: { remaining: number | null | undefined; fontSize?: number; corner?: boolean }) {
  if (remaining == null) return null;
  const r = remaining;
  const tone =
    r >= 6
      ? { text: '#FFFFFF', bg: 'rgba(255,255,255,0.18)', border: 'rgba(255,255,255,0.55)' }
      : r >= 3
      ? { text: '#F0C040', bg: 'rgba(240,192,64,0.2)', border: 'rgba(240,192,64,0.55)' }
      : { text: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.45)' };
  return (
    <span
      className={`rounded px-1 py-[1px] font-semibold shrink-0 ${corner ? 'absolute top-1 right-1.5 z-10' : 'inline-block align-middle'}`}
      style={{ color: tone.text, background: tone.bg, border: `1px solid ${tone.border}`, fontSize, lineHeight: 1 }}
      title={`${r} lessons left in package`}
    >
      {r}
    </span>
  );
}

function fmtTime(t: string) {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

interface Props {
  /** 'compact' = grouped list. 'minimal' = list with reassign dropdown. 'buttons' = only action buttons, no list. */
  variant?: 'full' | 'compact' | 'minimal' | 'buttons';
  /**
   * 'dashboard' shows only "Add slot" and links the title to the recurring schedule page.
   * 'full' (default) shows Add slot, Import CSV, and Generate next 8 weeks.
   */
  mode?: 'dashboard' | 'full';
}

export function AdminRecurringSchedulesView({ variant = 'full', mode = 'full' }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [keepTimeOpen, setKeepTimeOpen] = useState(true);
  const [pendingDeleteOpenId, setPendingDeleteOpenId] = useState<string | null>(null);
  const [deletingOpen, setDeletingOpen] = useState(false);
  const [editingOpenSpot, setEditingOpenSpot] = useState<any | null>(null);
  const [assigningOpenSpot, setAssigningOpenSpot] = useState<any | null>(null);
  const [sheet, setSheet] = useState<{ mode: 'open' | 'claimed'; slot: any } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [autoLinking, setAutoLinking] = useState(false);
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);
  const [skipSlot, setSkipSlot] = useState<any | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('recurring-unlinked-warning-dismissed') === '1';
  });

  const { data: slots = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-all-recurring-slots', user?.id, isDemoModeActive() ? 'demo' : 'live'],
    enabled: isDemoModeActive() || !!user?.id,
    queryFn: async () => {
      if (isDemoModeActive()) return demoRecurringSlots as any[];
      let query = supabase
        .from('recurring_lesson_slots')
        .select('*')
        .eq('is_active', true);
      if (user?.id) query = query.eq('coach_id', user.id);
      query = query.order('weekday', { ascending: true }).order('start_time', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;

      // Manually fetch profiles since there is no FK between recurring_lesson_slots and profiles
      const studentIds = Array.from(new Set((data ?? []).map((s: any) => s.student_id)));
      if (studentIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);
      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      // Build package members map → shared_with names per slot
      const pkgIds = Array.from(
        new Set((data ?? []).map((s: any) => s.package_id).filter(Boolean)),
      ) as string[];
      const sharedByPkg = new Map<string, { ownerId: string | null; memberIds: string[] }>();
      if (pkgIds.length) {
        const [{ data: pkgs = [] }, { data: members = [] }] = await Promise.all([
          supabase.from('class_packages').select('id, user_id').in('id', pkgIds),
          supabase.from('package_members').select('package_id, student_id').in('package_id', pkgIds),
        ]);
        (pkgs || []).forEach((p: any) =>
          sharedByPkg.set(p.id, { ownerId: p.user_id ?? null, memberIds: [] }),
        );
        (members || []).forEach((m: any) => {
          const e = sharedByPkg.get(m.package_id) ?? { ownerId: null, memberIds: [] };
          e.memberIds.push(m.student_id);
          sharedByPkg.set(m.package_id, e);
        });
        const extraIds = Array.from(
          new Set(
            Array.from(sharedByPkg.values()).flatMap((e) => [
              ...(e.ownerId ? [e.ownerId] : []),
              ...e.memberIds,
            ]),
          ),
        ).filter((id) => !profileById.has(id));
        if (extraIds.length) {
          const { data: extraProfiles = [] } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', extraIds);
          (extraProfiles || []).forEach((p: any) => profileById.set(p.id, p));
        }
      }
      const nameOf = (id: string) => {
        const p: any = profileById.get(id);
        return p?.full_name || p?.email || null;
      };

      // Paid tier (Stripe subs + manual plan overrides on profile)
      const tierStudentIds = (data ?? [])
        .map((s: any) => s.student_id)
        .filter(Boolean) as string[];
      const { paidIds: paidSubscriberIds, tierById: tierByStudent } =
        await resolveStudentTiers(tierStudentIds);

      // Package remaining per student (same source as Live Calendar / Manage Lessons)
      const linkableByStudent = await fetchLinkablePackagesByStudent(studentIds, {
        includePackageIds: pkgIds,
      });
      const remainingOf = (studentId: string | null, pkgId: string | null): number | null => {
        if (!studentId) return null;
        const list = linkableByStudent[studentId] ?? [];
        if (pkgId) {
          const exact = list.find((p) => p.id === pkgId);
          if (exact) return exact.remaining;
        }
        return list[0]?.remaining ?? null;
      };

      return (data ?? []).map((s: any) => {
        const info = s.package_id ? sharedByPkg.get(s.package_id) : null;
        let shared_with: string[] = [];
        if (info) {
          const all = new Set<string>([
            ...(info.ownerId ? [info.ownerId] : []),
            ...info.memberIds,
          ]);
          if (s.student_id) all.delete(s.student_id);
          shared_with = Array.from(all).map(nameOf).filter(Boolean) as string[];
        }
        return {
          ...s,
          profile: profileById.get(s.student_id) ?? null,
          shared_with,
          has_active_subscription: !!s.student_id && paidSubscriberIds.has(s.student_id),
          subscription_tier: (s.student_id && tierByStudent.get(s.student_id)) || null,
          package_remaining: remainingOf(s.student_id ?? null, s.package_id ?? null),
        };
      });
    },
  });

  // Open priority spots (fixed_schedule_slots) — unclaimed weekly spots students can grab
  const { data: openSpots = [], refetch: refetchOpen } = useQuery({
    queryKey: ['admin-open-priority-spots', user?.id, isDemoModeActive() ? 'demo' : 'live'],
    enabled: isDemoModeActive() || !!user?.id,
    queryFn: async () => {
      if (isDemoModeActive()) return [];
      let query = supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, notes, is_available, student_id')
        .is('student_id', null)
        .eq('is_available', true);
      if (user?.id) query = query.eq('coach_id', user.id);
      query = query.order('day_of_week', { ascending: true }).order('start_time', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Package health per recurring slot ─────────────────────────────
  // Slots whose linked package is exhausted (remaining === 0) or inactive,
  // or that have no package at all, are FLAGGED (never hidden or removed).
  const slotPkgIds = useMemo(
    () => Array.from(new Set((slots as any[]).map((s) => s.package_id).filter(Boolean))) as string[],
    [slots],
  );

  const { data: pkgStatusById } = useQuery({
    queryKey: ['recurring-slot-pkg-status', slotPkgIds.slice().sort().join(',')],
    enabled: slotPkgIds.length > 0 && !isDemoModeActive(),
    queryFn: async () => {
      const [{ data: pkgs = [] }, { data: lessonRows = [] }] = await Promise.all([
        supabase
          .from('class_packages')
          .select('id, package_size, classes_used, classes_remaining, is_active')
          .in('id', slotPkgIds),
        supabase
          .from('lessons')
          .select('id, package_id, status, lesson_date, lesson_type')
          .in('package_id', slotPkgIds),
      ]);
      const map = new Map<string, { remaining: number; is_active: boolean }>();
      (pkgs || []).forEach((p: any) => {
        const counts = computePackageCounts(p, lessonRows || []);
        map.set(p.id, { remaining: counts.remaining, is_active: !!p.is_active });
      });
      return map;
    },
  });

  /**
   * True when the slot should show the amber "Sin paquete activo" badge.
   * Derived EXCLUSIVELY from the presence of a package_id on the slot row,
   * so the badge and the header counter always match what was written to
   * recurring_lesson_slots. Slots flagged no_package_intentional (e.g. Maria
   * Baleva's Sunday 10:00am) never warn.
   */
  const slotNeedsPackage = (s: any) => {
    if (!s || s.__open || s.no_package_intentional) return false;
    return !s.package_id;
  };

  const noActivePackageCount = (slots as any[]).filter(slotNeedsPackage).length;


  const confirmDelete = async (alsoDeleteFuture: boolean) => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      // Optionally leave the time slot posted as an open spot so other
      // students can claim it (the coach keeps the weekly time).
      if (keepTimeOpen) {
        const src = (slots as any[]).find((s) => s.id === pendingDeleteId);
        if (!src) throw new Error('Slot not found');
        if (!user?.id) throw new Error('Sign in required to keep the time open');
        const startTime =
          String(src.start_time).length === 5 ? `${src.start_time}:00` : String(src.start_time);
        const weekday = src.weekday ?? 0;

        // Don't duplicate an open spot that already exists at this day/time.
        const { data: existing } = await supabase
          .from('fixed_schedule_slots')
          .select('id')
          .eq('day_of_week', weekday)
          .eq('start_time', startTime)
          .is('student_id', null)
          .limit(1);

        if (!existing || existing.length === 0) {
          const { error: openErr } = await supabase.from('fixed_schedule_slots').insert({
            day_of_week: weekday,
            start_time: startTime,
            duration_minutes: src.duration_minutes ?? 60,
            lesson_type: src.lesson_type ?? '1on1',
            is_available: true,
            student_id: null,
            created_by: user.id,
            coach_id: user.id,
            notes: 'Released from recurring schedule',
          });
          if (openErr) throw openErr;
        }
      }


      if (alsoDeleteFuture) {
        const todayStr = new Date().toISOString().substring(0, 10);
        await supabase
          .from('lessons')
          .delete()
          .eq('recurring_slot_id', pendingDeleteId)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .gte('lesson_date', todayStr);
      }
      const { error } = await supabase
        .from('recurring_lesson_slots')
        .delete()
        .eq('id', pendingDeleteId);
      if (error) throw error;

      toast({
        title: keepTimeOpen ? 'Student removed · time kept open' : 'Spot removed',
        description: keepTimeOpen
          ? 'The weekly time stays on the calendar as an open spot other students can claim.'
          : undefined,
      });
      setPendingDeleteId(null);
      setKeepTimeOpen(true);
      refetch();
      refetchOpen();
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-open-priority-spots'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-week'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to remove', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleAutoLinkPackages = async () => {
    const missing = (slots as any[]).filter((s) => !s.package_id && !s.no_package_intentional);
    if (missing.length === 0) return;
    setAutoLinking(true);
    try {
      const studentIds = Array.from(new Set(missing.map((s) => s.student_id)));
      // Unified helper: only is_active packages whose computePackageCounts
      // remaining (total − completed) is > 0 are eligible for auto-link.
      const grouped = await fetchLinkablePackagesByStudent(studentIds);

      // Pick the oldest eligible package per student (FIFO)
      const oldestByStudent = new Map<string, string>();
      for (const sid of studentIds) {
        const pick = pickFifoLinkable(grouped[sid] ?? []);
        if (pick) oldestByStudent.set(sid, pick.id);
      }

      let linked = 0;
      const studentsWithoutPackage: string[] = [];
      for (const slot of missing) {
        const pkgId = oldestByStudent.get(slot.student_id);
        if (!pkgId) {
          const name = slot.profile?.full_name || slot.profile?.email || 'Unknown';
          if (!studentsWithoutPackage.includes(name)) studentsWithoutPackage.push(name);
          continue;
        }
        const { error: upErr } = await supabase
          .from('recurring_lesson_slots')
          .update({ package_id: pkgId, updated_at: new Date().toISOString() })
          .eq('id', slot.id);
        if (upErr) continue;
        // Confirm the write persisted before reporting success.
        const { data: verified } = await supabase
          .from('recurring_lesson_slots')
          .select('id, package_id')
          .eq('id', slot.id)
          .maybeSingle();
        if ((verified as any)?.package_id === pkgId) linked++;
      }

      // Backfill package_id on already-generated future lessons from these slots
      const linkedSlotIds = missing
        .filter((s) => oldestByStudent.has(s.student_id))
        .map((s) => s.id);
      if (linkedSlotIds.length > 0) {
        const todayStr = new Date().toISOString().substring(0, 10);
        // Update each slot's future scheduled lessons with its student's package
        for (const s of missing) {
          const pkgId = oldestByStudent.get(s.student_id);
          if (!pkgId) continue;
          await supabase
            .from('lessons')
            .update({ package_id: pkgId })
            .eq('recurring_slot_id', s.id)
            .eq('auto_generated', true)
            .eq('status', 'scheduled')
            .is('package_id', null)
            .gte('lesson_date', todayStr);
        }
      }

      const skippedCount = studentsWithoutPackage.length;
      toast({
        title: `Linked ${linked} spot${linked !== 1 ? 's' : ''}`,
        description:
          skippedCount > 0
            ? `${skippedCount} student${skippedCount !== 1 ? 's have' : ' has'} no package with lessons remaining: ${studentsWithoutPackage.slice(0, 5).join(', ')}${skippedCount > 5 ? '…' : ''}`
            : 'All matching spots are now linked to their package.',
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to auto-link', variant: 'destructive' });
    } finally {
      setAutoLinking(false);
    }
  };
  const grouped = slots.reduce((acc: Record<string, any[]>, s: any) => {
    const key = s.student_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // Sort slots Mon→Sun then by time for the minimal list
  const dayOrderIndex: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
  const slotsSortedMonSun = [...slots].sort((a: any, b: any) => {
    const da = dayOrderIndex[a.weekday] ?? 99;
    const db = dayOrderIndex[b.weekday] ?? 99;
    if (da !== db) return da - db;
    return a.start_time.localeCompare(b.start_time);
  });

  /**
   * Deleting one leg of a scheduled move.
   *  - 'pending' → drop the scheduled change, everything stays on the current time.
   *  - 'current' → drop the old leg, the new day/time applies from today.
   * Future auto-generated lessons are rebuilt so scheduled = remaining.
   */
  const handleDeleteSegment = async (s: any) => {
    const move = getPendingMove(s);
    if (!move) return;
    try {
      if (s.__segment === 'pending') {
        await cancelPendingMove(s.id);
      } else {
        const t = move.startTime.length === 5 ? `${move.startTime}:00` : move.startTime;
        const { error } = await supabase
          .from('recurring_lesson_slots')
          .update({
            weekday: move.weekday,
            start_time: t,
            pending_weekday: null,
            pending_start_time: null,
            pending_effective_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id);
        if (error) throw error;
      }

      const todayStr = getCancunToday();
      await supabase
        .from('lessons')
        .delete()
        .eq('recurring_slot_id', s.id)
        .eq('auto_generated', true)
        .eq('status', 'scheduled')
        .gte('lesson_date', todayStr);
      await supabase.functions.invoke('generate-recurring-lessons', {
        body: { student_id: s.student_id },
      });

      toast({
        title:
          s.__segment === 'pending' ? 'Scheduled change cancelled' : 'New schedule applies from today',
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-week'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to update', variant: 'destructive' });
    }
  };


  const reassignSlot = async (slotId: string, newStudentId: string) => {
    try {
      const { error } = await supabase
        .from('recurring_lesson_slots')
        .update({ student_id: newStudentId, updated_at: new Date().toISOString() })
        .eq('id', slotId);
      if (error) throw error;
      toast({ title: 'Spot reassigned' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to reassign', variant: 'destructive' });
    }
  };

  const handleDeleteOpenSpot = async () => {
    if (!pendingDeleteOpenId) return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    setDeletingOpen(true);
    try {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .delete()
          .eq('id', pendingDeleteOpenId)
        .eq('coach_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) {
        toast({ title: 'Spot already removed or belongs to another coach', variant: 'destructive' });
        setPendingDeleteOpenId(null);
        refetchOpen();
        queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
        queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
        return;
      }
      toast({ title: 'Open spot removed' });
      setPendingDeleteOpenId(null);
      refetchOpen();
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to remove', variant: 'destructive' });
    } finally {
      setDeletingOpen(false);
    }
  };

  return (
    <>
      <Card className="card-elevated" id="recurring">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4 text-[#4a7c59]" />
            {mode === 'dashboard' ? (
              <Link
                to="/admin/lessons#recurring"
                className="hover:text-[#4a7c59] inline-flex items-center gap-1 group"
              >
                Recurring Schedules
                <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </Link>
            ) : (
              <>Recurring Schedules</>
            )}
            {slots.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{slots.length} spot{slots.length !== 1 ? 's' : ''}</Badge>
            )}
            {openSpots.length > 0 && (
              <Badge variant="outline" className="ml-1 text-xs border-[#4a7c59]/40 text-[#4a7c59]">
                {openSpots.length} open
              </Badge>
            )}
            {noActivePackageCount > 0 && (
              <Badge variant="outline" className="ml-1 text-xs border-amber-500/50 text-amber-300">
                {noActivePackageCount} slots sin paquete activo
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {variant === 'full' && <RecurringSchedulePdfButton />}
            {variant !== 'buttons' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 text-xs bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
                    <Plus className="h-3 w-3 mr-1" /> Add spot
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => setAddStudentOpen(true)} className="cursor-pointer">
                    <UserPlus className="h-4 w-4 mr-2 text-[#4a7c59]" />
                    <div className="flex flex-col">
                      <span className="font-medium">Add for a student</span>
                      <span className="text-[11px] text-muted-foreground">Assign now · auto-generate lessons</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddOpen(true)} className="cursor-pointer">
                    <CalendarPlus className="h-4 w-4 mr-2 text-[#F0C040]" />
                    <div className="flex flex-col">
                      <span className="font-medium">Add open spot</span>
                      <span className="text-[11px] text-muted-foreground">Students can claim it</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {mode === 'full' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-8 text-xs">
                  <Upload className="h-3 w-3 mr-1" /> Import CSV
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Show-warning toggle (visible only when banner is dismissed and there are unlinked slots) */}
          {!isLoading && variant !== 'buttons' && warningDismissed && (() => {
            const missingCount = (slots as any[]).filter((s) => !s.package_id && !s.no_package_intentional).length;
            if (missingCount === 0) return null;
            return (
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => {
                    setWarningDismissed(false);
                    try { localStorage.removeItem('recurring-unlinked-warning-dismissed'); } catch {}
                  }}
                  className="inline-flex items-center gap-1 text-xs text-amber-300/80 hover:text-amber-200 underline-offset-2 hover:underline"
                  title="Show the unlinked-spots warning again"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Show warning ({missingCount} unlinked)
                </button>
              </div>
            );
          })()}

          {/* Missing-package warning banner */}
          {!isLoading && variant !== 'buttons' && !warningDismissed && (() => {
            const missing = (slots as any[]).filter((s) => !s.package_id && !s.no_package_intentional);
            if (missing.length === 0) return null;
            return (
              <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs relative">
                <button
                  onClick={() => {
                    setWarningDismissed(true);
                    try { localStorage.setItem('recurring-unlinked-warning-dismissed', '1'); } catch {}
                  }}
                  className="absolute top-2 right-2 text-amber-300/70 hover:text-amber-100 p-1 rounded hover:bg-amber-500/10"
                  title="Dismiss this warning"
                  aria-label="Dismiss warning"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2 mb-2 pr-6">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-200">
                      {missing.length} spot{missing.length !== 1 ? 's' : ''} not linked to a package
                    </p>
                    <p className="text-amber-200/80 mt-0.5">
                      Recurring spots must auto-deduct from a package. Open the linker to review and link them.
                    </p>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        onClick={() => setBulkLinkOpen(true)}
                        className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Link to active packages ({missing.length})
                      </Button>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1 ml-6">
                  {missing.slice(0, 20).map((s: any) => {
                    const name = s.profile?.full_name || s.profile?.email || 'Unknown';
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setEditingSlot(s)}
                          className="text-left text-amber-100 hover:text-amber-50 underline-offset-2 hover:underline truncate"
                        >
                          {name} · {WEEKDAYS_SHORT[s.weekday]} {fmtTime(s.start_time)}
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0"
                          onClick={() => setPendingDeleteId(s.id)}
                          title="Remove this spot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                  {missing.length > 20 && (
                    <li className="text-amber-200/60">…and {missing.length - 20} more</li>
                  )}
                </ul>
              </div>
            );
          })()}

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : variant === 'buttons' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                className="h-9 text-xs bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add spot
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 text-xs">
                <Link to="/admin/lessons#recurring">
                  <Repeat className="h-3.5 w-3.5 mr-1" /> Reassign students
                </Link>
              </Button>
            </div>
          ) : slots.length === 0 && openSpots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No recurring spots configured yet. {variant === 'full' ? 'Click “Add spot” or “Import CSV” above to get started.' : 'Add weekly spots from each student\'s admin profile (Lessons tab).'}
            </p>
          ) : variant === 'compact' ? (
            <ul className="space-y-1.5">
              {Object.entries(grouped).map(([studentId, studentSlots]) => {
                const profile = (studentSlots[0] as any).profile;
                const name = profile?.full_name || profile?.email || 'Unknown';
                return (
                  <li key={studentId} className="relative flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                    <div className="min-w-0 flex-1 pr-8">
                      <Link to={`/admin/student/${studentId}`} className="font-medium text-foreground hover:text-[#4a7c59] truncate">
                        {name}
                      </Link>
                      <RemainingBadge corner remaining={(studentSlots[0] as any).package_remaining} />
                      <div className="text-xs text-muted-foreground">
                        {(studentSlots as any[]).map((s) => `${WEEKDAYS_SHORT[s.weekday]} ${fmtTime(s.start_time)} (${s.lesson_type})`).join(' · ')}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : variant === 'minimal' ? (
            <ul className="space-y-2">
              {slotsSortedMonSun.map((s: any) => {
                const profile = s.profile;
                const name = profile?.full_name || profile?.email || 'Unknown';
                const tierStyle = subscriptionTierStyle(s.subscription_tier);
                return (
                  <li
                    key={s.id}
                    className={`flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 ${slotNeedsPackage(s) ? 'opacity-60' : ''}`}
                    style={s.has_active_subscription && tierStyle ? { borderLeft: `3px solid ${tierStyle.accent}` } : undefined}
                  >
                    <div className="min-w-0 flex-1 relative pr-9">
                      <div className="text-xs font-semibold text-[#F0C040] uppercase tracking-wide">
                        {WEEKDAYS_SHORT[s.weekday]} · {fmtTime(s.start_time)}
                        <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">
                          · {s.duration_minutes}m · {s.lesson_type}
                        </span>
                        {slotNeedsPackage(s) && (
                          <span
                            className="ml-1 inline-flex items-center rounded px-1 py-[1px] font-semibold normal-case tracking-normal"
                            style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24', fontSize: 9 }}
                          >
                            Sin paquete activo
                          </span>
                        )}
                        <PendingMoveBadge slot={s} className="ml-1" />
                        <StartsOnBadge slot={s} className="ml-1" />
                        <PausedChip slot={s} className="ml-1" />
                        <EndsOnChip slot={s} className="ml-1" />
                        <CadenceBadge weeks={s.interval_weeks} className="ml-1" />
                      </div>
                      <Link
                        to={`/admin/student/${s.student_id}`}
                        className="text-sm font-medium text-foreground hover:text-[#4a7c59] truncate block"
                      >
                        {name}
                        {s.subscription_tier && tierStyle && (
                          <span
                            className="ml-1 inline-block rounded px-1 py-[1px] align-middle font-semibold uppercase tracking-wide"
                            style={{
                              color: tierStyle.text,
                              background: tierStyle.bg,
                              border: tierStyle.border,
                              fontSize: 9,
                              lineHeight: 1,
                            }}
                            title={`Active ${s.subscription_tier} subscription`}
                          >
                            {s.subscription_tier === 'apex' ? 'Apex' : s.subscription_tier === 'pro' ? 'Pro' : 'Scratch'}
                        </span>
                        )}
                      </Link>
                    </div>
                    <RemainingBadge corner remaining={s.package_remaining} />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditingSlot(s)}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-[#F0C040]/40 text-[#F0C040] hover:bg-[#F0C040]/10"
                        onClick={() => setSkipSlot(s)}
                        title="Skip a specific week"
                      >
                        <CalendarOff className="h-3 w-3 mr-1" /> Skip Week
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-400 hover:text-red-300"
                        onClick={() => setPendingDeleteId(s.id)}
                        title="Remove spot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            (() => {
              // Mon-Sun column order; weekday: 0=Sun..6=Sat
              const dayOrder = [1, 2, 3, 4, 5, 6, 0];
              const byDay: Record<number, any[]> = {};
              dayOrder.forEach((d) => (byDay[d] = []));
              const todayStr = getCancunToday();
              // A slot with a scheduled move shows TWO normal cards: the leg in
              // use until the effective date and the leg that starts on it.
              const takenKeys = new Set<string>();
              slots.forEach((s: any) => {
                const move = getPendingMove(s);
                const upcoming = move && move.effectiveDate > todayStr;
                if (upcoming) {
                  // pending_wipe = scheduled lessons were deleted: no old leg to show.
                  const wiped = s.pending_wipe === true;
                  if (!wiped && byDay[s.weekday]) byDay[s.weekday].push({ ...s, __segment: 'current' });
                  if (byDay[move!.weekday]) {
                    byDay[move!.weekday].push({
                      ...s,
                      weekday: move!.weekday,
                      start_time: move!.startTime,
                      __segment: 'pending',
                    });
                  }
                  if (!wiped) takenKeys.add(`${s.weekday}-${normalizeTimeHM(s.start_time)}`);
                  takenKeys.add(`${move!.weekday}-${normalizeTimeHM(move!.startTime)}`);
                } else if (byDay[s.weekday]) {
                  byDay[s.weekday].push(s);
                }
              });
              // Mix in open priority spots so they're visible alongside assigned ones
              (openSpots as any[]).forEach((o: any) => {
                const w = o.day_of_week;
                // A time held by either leg of a scheduled move is not claimable.
                if (takenKeys.has(`${w}-${normalizeTimeHM(o.start_time)}`)) return;
                if (byDay[w]) byDay[w].push({ ...o, weekday: w, __open: true });
              });
              dayOrder.forEach((d) =>
                byDay[d].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
              );
              // A student moving within the same day still counts once.
              const dayCount = (d: number) => new Set(byDay[d].map((s: any) => s.id)).size;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {dayOrder.map((d) => (
                    <div
                      key={d}
                      className="rounded-md border border-white/10 bg-white/5 p-2 min-h-[100px] flex flex-col"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-[#F0C040] mb-2 text-center">
                        {WEEKDAYS_SHORT[d]}
                        <span className="ml-1 text-muted-foreground font-normal">({dayCount(d)})</span>
                      </div>
                      <div className="space-y-1.5 flex-1">
                        {byDay[d].length === 0 ? (
                          <p className="text-[11px] text-muted-foreground text-center pt-2">—</p>
                        ) : (
                          (() => {
                            const am = byDay[d].filter((s: any) => parseInt(s.start_time.split(':')[0], 10) < 12);
                            const pm = byDay[d].filter((s: any) => parseInt(s.start_time.split(':')[0], 10) >= 12);
                            const renderSlot = (s: any) => {
                              if (s.__open) {
                                return (
                                  <div
                                    key={`open-${s.id}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSheet({ mode: 'open', slot: s })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSheet({ mode: 'open', slot: s });
                                      }
                                    }}
                                    className="group relative rounded border border-dashed border-[#4a7c59]/60 bg-[#4a7c59]/10 hover:bg-[#4a7c59]/20 transition-colors p-1.5 cursor-pointer"
                                    title="Click for actions"
                                  >
                                    <div className="block text-xs font-medium text-[#4a7c59] truncate">
                                      Open spot
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                      {fmtTime(s.start_time)} · {s.duration_minutes}m
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/80 truncate">
                                      {s.lesson_type} · claimable
                                    </div>
                                    <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 text-[#4a7c59] hover:text-[#4a7c59]/80"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setEditingOpenSpot(s);
                                        }}
                                        title="Edit open spot"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 text-red-400 hover:text-red-300"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setPendingDeleteOpenId(s.id);
                                        }}
                                        title="Remove open spot"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              }
                              const profile = s.profile;
                              const name = profile?.full_name || profile?.email || 'Unknown';
                              const sharedNames: string[] = s.shared_with ?? [];
                              const isShared = sharedNames.length > 0;
                              const tierStyle = subscriptionTierStyle(s.subscription_tier);
                              return (
                                <div
                                  key={s.__segment ? `${s.id}-${s.__segment}` : s.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSheet({ mode: 'claimed', slot: s })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSheet({ mode: 'claimed', slot: s });
                                    }
                                  }}
                                  className={`group relative rounded border border-white/10 bg-background/40 hover:border-[#4a7c59]/60 hover:bg-white/10 transition-colors p-1.5 cursor-pointer ${slotNeedsPackage(s) ? 'opacity-60' : ''}`}
                                  title={isShared ? `Shared with ${sharedNames.join(', ')}` : 'Click for actions'}
                                  style={s.has_active_subscription && tierStyle ? { borderLeft: `3px solid ${tierStyle.accent}` } : undefined}
                                >
                                   <div className="block text-xs font-medium text-foreground break-words line-clamp-2 leading-tight pr-14" title={name}>
                                     {name}
                                     {s.subscription_tier && tierStyle && (
                                       <span
                                         className="ml-1 inline-block rounded px-1 py-[1px] align-middle font-semibold uppercase tracking-wide"
                                         style={{
                                           color: tierStyle.text,
                                           background: tierStyle.bg,
                                           border: tierStyle.border,
                                           fontSize: 9,
                                           lineHeight: 1,
                                         }}
                                         title={`Active ${s.subscription_tier} subscription`}
                                       >
                                          {s.subscription_tier === 'apex' ? 'Apex' : s.subscription_tier === 'pro' ? 'Pro' : 'Scratch'}
                                        </span>
                                       )}
                                       <RemainingBadge corner remaining={s.package_remaining} fontSize={8} />
                                    </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {fmtTime(s.start_time)} · {s.duration_minutes}m
                                  </div>
                                   <div className="text-[10px] text-muted-foreground/80 truncate flex items-center gap-1 flex-wrap">
                                     <span>{s.lesson_type}</span>
                                     {s.package_id && <span className="text-[#4a7c59]">· pkg</span>}
                                     {slotNeedsPackage(s) && (
                                       <span
                                         className="inline-flex items-center rounded px-1 py-[1px] shrink-0 font-semibold"
                                         style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24', fontSize: 9 }}
                                         title="El paquete ligado se agotó o está inactivo"
                                       >
                                         Sin paquete activo
                                       </span>
                                     )}
                                      <PendingMoveBadge
                                        slot={s}
                                        variant={s.__segment === 'current' ? 'until' : 'from'}
                                      />
                                      <StartsOnBadge slot={s} />
                                      {s.__segment !== 'pending' && <PausedChip slot={s} />}
                                      {s.__segment !== 'pending' && <EndsOnChip slot={s} />}
                                      <CadenceBadge weeks={s.interval_weeks} />
                                     {isShared && (
                                       <Popover>
                                         <PopoverTrigger asChild>
                                           <span
                                             role="button"
                                             tabIndex={0}
                                             onClick={(e) => e.stopPropagation()}
                                             onKeyDown={(e) => e.stopPropagation()}
                                             className="inline-flex items-center gap-0.5 rounded px-1 py-[1px] cursor-pointer shrink-0"
                                             style={{ background: 'rgba(240,192,64,0.18)', color: '#F0C040', fontSize: 9 }}
                                             title={`Shared with ${sharedNames.join(', ')}`}
                                           >
                                             <Users className="h-2.5 w-2.5" />
                                             <span className="font-semibold">shared +{sharedNames.length}</span>
                                           </span>
                                         </PopoverTrigger>
                                         <PopoverContent
                                           className="w-auto max-w-[220px] p-2 text-xs"
                                           onClick={(e) => e.stopPropagation()}
                                         >
                                           <div className="font-semibold mb-1 text-[#F0C040]">Shared package</div>
                                           <div className="text-foreground/85">
                                             Shared with: {sharedNames.join(', ')}
                                           </div>
                                         </PopoverContent>
                                       </Popover>
                                     )}
                                   </div>
                                  <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5 text-ivory/70 hover:text-ivory"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingSlot(s);
                                      }}
                                      title="Edit spot"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5 text-[#F0C040] hover:text-[#F0C040]/80"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSkipSlot(s);
                                      }}
                                      title="Skip a specific week"
                                    >
                                      <CalendarOff className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5 text-red-400 hover:text-red-300"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                         if (s.__segment) handleDeleteSegment(s);
                                         else setPendingDeleteId(s.id);
                                       }}
                                       title={
                                         s.__segment === 'current'
                                           ? 'Remove this leg (new time starts today)'
                                           : s.__segment === 'pending'
                                           ? 'Cancel the scheduled change'
                                           : 'Remove spot'
                                       }
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            };
                            return (
                              <>
                                {am.length > 0 && (
                                  <>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/70 px-0.5">
                                      ☀ AM
                                    </div>
                                    {am.map(renderSlot)}
                                  </>
                                )}
                                {am.length > 0 && pm.length > 0 && (
                                  <div className="border-t border-white/10 my-1" />
                                )}
                                {pm.length > 0 && (
                                  <>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300/70 px-0.5">
                                      ☾ PM
                                    </div>
                                    {pm.map(renderSlot)}
                                  </>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove recurring spot?</AlertDialogTitle>
            <AlertDialogDescription>
              You can also delete future auto-generated lessons from this spot. Past and edited lessons will always stay.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="flex items-start gap-3 rounded-lg border border-[#F0C040]/30 bg-[#F0C040]/5 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={keepTimeOpen}
              onChange={(e) => setKeepTimeOpen(e.target.checked)}
              disabled={deleting}
              className="mt-0.5 h-4 w-4 accent-[#F0C040]"
            />
            <span className="text-sm">
              <span className="font-semibold text-[#F0C040]">Keep this time open for other students</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                The weekly time stays on the calendar as an open spot instead of disappearing, so you don&apos;t have to create it again.
              </span>
            </span>
          </label>

          <AlertDialogFooter className="gap-2 flex-wrap">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmDelete(false)} disabled={deleting}>
              Keep future lessons
            </Button>
            <AlertDialogAction
              onClick={() => confirmDelete(true)}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete spot + future lessons
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteOpenId} onOpenChange={(o) => !o && setPendingDeleteOpenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this open spot?</AlertDialogTitle>
            <AlertDialogDescription>
              The spot will disappear from the calendar and students won&apos;t be able to claim it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingOpen}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOpenSpot}
              disabled={deletingOpen}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingOpen && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddOpenSpotModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSpotAdded={() => {
          refetch();
          refetchOpen();
          queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
        }}
      />
      <EditOpenSpotModal
        open={!!editingOpenSpot}
        onOpenChange={(o) => !o && setEditingOpenSpot(null)}
        spot={editingOpenSpot}
        onUpdated={() => {
          refetch();
          refetchOpen();
          queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <AssignSpotModal
        open={!!assigningOpenSpot}
        onOpenChange={(o) => !o && setAssigningOpenSpot(null)}
        spot={assigningOpenSpot}
        onAssigned={() => {
          refetch();
          refetchOpen();
          queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <AddRecurringSlotModal
        open={addStudentOpen}
        onOpenChange={setAddStudentOpen}
        onSlotAdded={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <ImportRecurringSlotsModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <EditRecurringSlotModal
        open={!!editingSlot}
        onOpenChange={(o) => !o && setEditingSlot(null)}
        slot={editingSlot}
        onSaved={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <BulkLinkPackagesModal
        open={bulkLinkOpen}
        onOpenChange={setBulkLinkOpen}
        slots={(slots as any[]).filter((s) => !s.package_id && !s.no_package_intentional)}
        onLinked={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      <SkipWeekModal
        open={!!skipSlot}
        onOpenChange={(o) => !o && setSkipSlot(null)}
        slot={skipSlot}
        studentProfile={skipSlot?.profile ?? null}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />

      <RecurringScheduleActionSheet
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        mode={sheet?.mode ?? null}
        slot={(sheet?.slot ?? null) as RecurringSheetSlot | null}
        onEditOpenSpot={(s) => setEditingOpenSpot(s)}
        onAssignToStudent={(s) => setAssigningOpenSpot(s)}
        onRemoveOpenSpot={(s) => setPendingDeleteOpenId(s.id)}
        onEditRecurring={(s) => setEditingSlot(s)}
        onChangeStudent={(s) => setEditingSlot(s)}
        onRemoveRecurring={(s) => setPendingDeleteId(s.id)}
        onReleased={() => {
          refetch();
          refetchOpen();
          queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
    </>
  );
}
