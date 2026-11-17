import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, FileText, ChevronDown, ChevronUp, Package, CheckCircle2, Play, Sparkles, ArrowRight, CalendarCheck, Lock, X, RefreshCw, CalendarPlus, ArrowRightLeft, Repeat } from 'lucide-react';
import { InternalHeader } from '@/components/InternalHeader';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVisibleRecurringSlots } from '@/hooks/useVisibleRecurringSlots';
import { StudentStartsOnBadge } from '@/components/student/StudentStartsOnBadge';
import { useSharedPackageMemberNames } from '@/hooks/useSharedPackages';
import { InternalBookingModal } from '@/components/InternalBookingModal';
import { SocialFooter } from '@/components/SocialFooter';
import { LinkCoachCard } from '@/components/LinkCoachCard';
import { RequireCoachModal } from '@/components/RequireCoachModal';
import { formatLessonDate, formatLessonTime, getLessonSortKey, getTodayInAppTimezone } from '@/lib/formatLessonDateTime';
import { fmtMXN } from '@/lib/formatCurrency';
import { buildWeightedLessonNumberMap, computePackageCounts, getWeightedLessonCount } from '@/lib/lessonPackageUsage';
import { isEffectivelyTaken } from '@/lib/lessonStatus';
import { PackageGroupDivider } from '@/components/lessons/PackageGroupDivider';
import { translateLessonType } from '@/lib/lessonTypeLabel';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { CreateReportModal } from '@/components/CreateReportModal';
import { StudentReportsPanel } from '@/components/StudentReportsPanel';
import { useSignedMediaUrl as useSignedLessonVideoUrl } from '@/hooks/useSignedMediaUrl';
import { openGoogleCalendar } from '@/lib/addToGoogleCalendar';
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
import { toast } from 'sonner';

/** Group lessons by month and return ordered groups */
function groupByMonth(sortedLessons: any[], locale: string = 'en-US'): { label: string; lessons: any[] }[] {
  const groups: { label: string; lessons: any[] }[] = [];
  let currentLabel = '';
  for (const lesson of sortedLessons) {
    // Use the centralized formatter to get month label in Cancun timezone
    const dateLabel = formatLessonDate(lesson, 'monthDay');
    // Extract month + year for grouping
    const fullDate = formatLessonDate(lesson, 'short'); // "Mon DD, YYYY"
    const parts = fullDate.split(', ');
    const label = parts.length === 2 ? `${parts[0].split(' ')[0]} ${parts[1]}` : fullDate;
    const monthYear = label.replace(/\d{2}\s/, ''); // keep "Mon YYYY"
    const groupLabel = (() => {
      if (lesson.lesson_start_at) {
        const d = new Date(lesson.lesson_start_at);
        return new Intl.DateTimeFormat(locale, { timeZone: 'America/Cancun', month: 'long', year: 'numeric' }).format(d);
      }
      if (lesson.lesson_date) {
        const [y, m] = lesson.lesson_date.split('-').map(Number);
        return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1, 12));
      }
      return 'Unknown';
    })();
    if (groupLabel !== currentLabel) {
      currentLabel = groupLabel;
      groups.push({ label: groupLabel, lessons: [] });
    }
    groups[groups.length - 1].lessons.push(lesson);
  }
  return groups;
}

function LessonVideoThumb({ v, onOpen }: { v: any; onOpen: () => void }) {
  const thumb = useSignedLessonVideoUrl(v.thumbnail_url);
  const file = useSignedLessonVideoUrl(v.file_url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative shrink-0 rounded-lg overflow-hidden group"
      style={{ width: 96, height: 64, background: 'rgba(255,255,255,0.06)' }}
      aria-label={`Play ${v.title || 'lesson video'}`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={v.title || 'Lesson video'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <video
          src={file ?? undefined}
          className="w-full h-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      )}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.9)' }}>
          <Play className="h-3.5 w-3.5 text-black ml-0.5" fill="currentColor" />
        </div>
      </div>
    </button>
  );
}

export default function StudentLessons() {
  const { user, profile, hasLinkedCoach, effectivePlan } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const { blockWrite } = useStudentPreview();
  const { t, language } = useLanguage();
  const locale = language === 'es' ? 'es-MX' : 'en-US';
  /** Localized lesson status label (never the raw DB token). */
  const statusLabel = (status?: string | null) => {
    switch (status) {
      case 'scheduled': return t('ui.studentLessons.statusScheduled');
      case 'completed': return t('ui.studentLessons.statusCompleted');
      case 'cancelled':
      case 'canceled': return t('ui.studentLessons.statusCancelled');
      case 'no_show': return t('ui.studentLessons.statusNoShow');
      default: return status ?? '';
    }
  };
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [rescheduleBookOpen, setRescheduleBookOpen] = useState(false);

  // Refetch lessons, packages, videos and any related cached data.
  const refreshLessons = async () => {
    const start = Date.now();
    await queryClient.invalidateQueries({ refetchType: 'all' });
    const elapsed = Date.now() - start;
    if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
  };

  const handleManualRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await refreshLessons();
      toast.success(t('ui.studentLessons.lessonsUpdated'));
    } catch (e: any) {
      toast.error(e?.message || t('ui.studentLessons.couldNotRefresh'));
    } finally {
      setManualRefreshing(false);
    }
  };

  const { pull, refreshing: pulling, threshold: pullThreshold } = usePullToRefresh({
    onRefresh: refreshLessons,
  });
  const pullProgress = Math.min(1, pull / pullThreshold);

  // Packages shared with me (where I'm a member but not the owner)
  const { data: sharedPackageIds = [] } = useQuery({
    queryKey: ['my-shared-package-ids', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('package_members')
        .select('package_id')
        .eq('student_id', profile?.id);
      return (data || []).map((r: any) => r.package_id);
    },
    enabled: !!profile?.id,
  });

  // Recurring ("Priority Spot") slots of the logged-in student — powers the
  // Schedule tab, which only renders when there is at least one active slot.
  const recurringSlots = useVisibleRecurringSlots(profile?.id);

  const { data: allLessons = [] } = useQuery({
    queryKey: ['all-lessons', profile?.id, sharedPackageIds.join(',')],
    queryFn: async () => {
      let query = supabase.from('lessons').select('*').neq('ar_status', 'draft');
      if (sharedPackageIds.length > 0) {
        query = query.or(
          `student_id.eq.${profile?.id},package_id.in.(${sharedPackageIds.join(',')})`
        );
      } else {
        query = query.eq('student_id', profile?.id);
      }
      const { data } = await query.order('lesson_date', { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Names of the other people whose lessons show up here through a shared
  // package (their lessons are read-only for everyone but themselves).
  const otherStudentIds = Array.from(
    new Set(
      (allLessons as any[])
        .map((l) => l.student_id)
        .filter((id: string) => id && id !== profile?.id),
    ),
  ) as string[];
  const { data: memberNames } = useQuery({
    queryKey: ['shared-lesson-member-names', otherStudentIds.slice().sort().join(',')],
    enabled: otherStudentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', otherStudentIds);
      return data ?? [];
    },
  });
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (memberNames ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.email || ''));
    return map;
  }, [memberNames]);

  const { data: videos = [] } = useQuery({
    queryKey: ['student-lesson-videos', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, title, file_url, file_type, thumbnail_url, lesson_id, upload_date')
        .eq('student_id', profile?.id)
        .not('lesson_id', 'is', null)
        .order('upload_date', { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: allPackages = [] } = useQuery({
    queryKey: ['student-packages', profile?.id, sharedPackageIds.join(',')],
    queryFn: async () => {
      let query = supabase.from('class_packages').select('*');
      if (sharedPackageIds.length > 0) {
        query = query.or(
          `user_id.eq.${profile?.id},id.in.(${sharedPackageIds.join(',')})`
        );
      } else {
        query = query.eq('user_id', profile?.id);
      }
      const { data } = await query.order('created_at', { ascending: false });
      const pkgs = data || [];
      // Look up owner names for shared packages so UI can show "Compartido por …"
      const ownerIds = Array.from(
        new Set(
          pkgs
            .filter((p: any) => p.user_id !== profile?.id)
            .map((p: any) => p.user_id)
        )
      );
      let ownerMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds);
        (owners || []).forEach((o: any) => ownerMap.set(o.id, o.full_name || o.email));
      }
      return pkgs.map((p: any) => ({
        ...p,
        isShared: p.user_id !== profile?.id,
        ownerName: p.user_id !== profile?.id ? (ownerMap.get(p.user_id) || 'otro estudiante') : null,
      }));
    },
    enabled: !!profile?.id,
  });

  // Paused / archived packages are hidden from the student portal, together
  // with the lessons linked to them. Nothing is deleted: admin still sees all,
  // and resuming / unarchiving brings them back automatically.
  const hiddenPackageIds = useMemo(
    () =>
      new Set(
        (allPackages as any[])
          .filter((p) => p.is_paused === true || p.is_archived === true)
          .map((p) => p.id),
      ),
    [allPackages],
  );
  // Completed packages (no remaining classes) are hidden from the student portal
  // so they don't clutter the active packages list or the taken-lessons history.
  const completedPackageIds = useMemo(
    () =>
      new Set(
        (allPackages as any[])
          .filter((p) => computePackageCounts(p, allLessons).remaining <= 0)
          .map((p) => p.id),
      ),
    [allPackages, allLessons],
  );
  const packages = useMemo(
    () =>
      (allPackages as any[]).filter(
        (p) => !hiddenPackageIds.has(p.id) && !completedPackageIds.has(p.id),
      ),
    [allPackages, hiddenPackageIds, completedPackageIds],
  );

  // A package is SHARED when this student is a member of it, or when it has
  // other members besides the viewer. Lessons of a shared package belong to the
  // package, not to a person: any member may cancel / change them.
  const allPackageIds = useMemo(() => (packages as any[]).map((p) => p.id as string), [packages]);
  const pkgMemberNames = useSharedPackageMemberNames(allPackageIds, profile?.id);
  const sharedPackageIdSet = useMemo(
    () =>
      new Set<string>([
        ...(sharedPackageIds as string[]),
        ...Object.entries(pkgMemberNames)
          .filter(([, names]) => (names?.length ?? 0) > 0)
          .map(([id]) => id),
      ]),
    [sharedPackageIds, pkgMemberNames],
  );
  const lessons = useMemo(
    () =>
      (allLessons as any[]).filter(
        (l) => !l.package_id || !hiddenPackageIds.has(l.package_id),
      ),
    [allLessons, hiddenPackageIds],
  );

  const todayStr = getTodayInAppTimezone();

  const upcomingLessons = lessons
    .filter(l => {
      const lessonDateStr = l.lesson_start_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(l.lesson_start_at))
        : l.lesson_date;
      return lessonDateStr >= todayStr && l.status === 'scheduled';
    })
    .sort((a, b) => getLessonSortKey(a).localeCompare(getLessonSortKey(b)));

  const pastLessons = lessons
    .filter(l => {
      const lessonDateStr = l.lesson_start_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(l.lesson_start_at))
        : l.lesson_date;
      // Past = lesson date already passed. A future-dated lesson is never "past",
      // even if it was (incorrectly) marked completed.
      return lessonDateStr < todayStr;
    })
    .sort((a, b) => getLessonSortKey(b).localeCompare(getLessonSortKey(a)));

  // Active package IDs = not paused/archived and not completed (remaining > 0).
  const activePackageIds = useMemo(
    () => new Set((packages as any[]).map((p) => p.id as string)),
    [packages],
  );
  // Past history shown to the student = taken lessons (completed/no-show)
  // from the active package only, plus individual (no-package) lessons.
  const pastCompletedLessons = lessons
    .filter((l) => isEffectivelyTaken(l, todayStr) && (!l.package_id || activePackageIds.has(l.package_id)))
    .sort((a, b) => getLessonSortKey(b).localeCompare(getLessonSortKey(a)));

  // Build weighted lesson number map within each package: a 2-hour lesson consumes 2 slots.
  const lessonNumberMap = useMemo(() => {
    return buildWeightedLessonNumberMap(lessons, { groupByPackage: true, completedOnly: true });
  }, [lessons]);

  const upcomingGroups = useMemo(() => groupByMonth(upcomingLessons, locale), [upcomingLessons, locale]);
  const pastGroups = useMemo(() => groupByMonth(pastLessons, locale), [pastLessons, locale]);

  // Group lessons by package_id for quick lookup
  const lessonsByPackage = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of lessons) {
      if (!l.package_id) continue;
      // Package sessions show taken lessons (completed or no-show), matching
      // the Past tab rule; scheduled / skipped / cancelled stay hidden.
      if (!isEffectivelyTaken(l)) continue;
      if (!map.has(l.package_id)) map.set(l.package_id, []);
      map.get(l.package_id)!.push(l);
    }
    // Sort each group oldest→newest
    map.forEach((arr) => arr.sort((a, b) => getLessonSortKey(a).localeCompare(getLessonSortKey(b))));
    return map;
  }, [lessons]);

  // Group videos by lesson_id for quick lookup on each lesson card
  const videosByLesson = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const v of videos) {
      if (!v.lesson_id) continue;
      if (!map.has(v.lesson_id)) map.set(v.lesson_id, []);
      map.get(v.lesson_id)!.push(v);
    }
    return map;
  }, [videos]);

  const LessonCard = ({ lesson, isLast, cancellable = false, onReschedule }: { lesson: any; isLast: boolean; cancellable?: boolean; onReschedule?: () => void }) => {
    const [notesOpen, setNotesOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [tooSoonOpen, setTooSoonOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [rescheduleConfirmOpen, setRescheduleConfirmOpen] = useState(false);
    // Lessons of a SHARED package belong to the package, not to a person:
    // every member gets the same actions, with the same 24h rules.
    const isSharedPackageLesson = !!lesson.package_id && sharedPackageIdSet.has(lesson.package_id);
    const canCancel = cancellable;
    const hasCoachNotes = !!lesson.coach_notes;
    const hasStudentNotes = !!lesson.student_notes;
    const isCompleted = lesson.status === 'completed';
    const lessonNum = lessonNumberMap.get(lesson.id);
    const lessonVideos = videosByLesson.get(lesson.id) || [];

    const dotColor = isCompleted ? '#4a7c59' : '#E8D5B0';

    // 24-hour cancellation policy. Lesson date/time are in Cancun (UTC-5).
    const lessonStartMs = (() => {
      if (lesson.lesson_start_at) return new Date(lesson.lesson_start_at).getTime();
      if (lesson.lesson_date && lesson.lesson_time) {
        const t = String(lesson.lesson_time).slice(0, 8);
        return new Date(`${lesson.lesson_date}T${t}-05:00`).getTime();
      }
      return NaN;
    })();
    const hoursUntil = Number.isFinite(lessonStartMs) ? (lessonStartMs - Date.now()) / 3_600_000 : Infinity;
    const tooSoonToCancel = hoursUntil < 24;

    const handleCancel = async () => {
      if (blockWrite()) return;
      if (cancelling) return;
      setCancelling(true);
      try {
        const { data, error } = await supabase.functions.invoke('cancel-lesson', {
          body: { lessonId: lesson.id },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success(t('ui.studentLessons.toastCancelled'), {
          description: t('ui.studentLessons.toastCancelledDesc'),
        });
        setCancelOpen(false);
        queryClient.invalidateQueries({ queryKey: ['all-lessons'] });
        queryClient.invalidateQueries({ queryKey: ['student-packages'] });
        queryClient.invalidateQueries({ queryKey: ['lessons'] });
        queryClient.invalidateQueries({ queryKey: ['packages'] });
      } catch (err: any) {
        toast.error(t('ui.studentLessons.toastCancelError'), {
          description: err?.message ?? t('ui.studentLessons.tryAgain'),
        });
      } finally {
        setCancelling(false);
      }
    };

    const handleReschedule = async () => {
      if (blockWrite()) return;
      if (rescheduling) return;
      setRescheduling(true);
      try {
        const { data, error } = await supabase.functions.invoke('cancel-lesson', {
          body: { lessonId: lesson.id },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error);
        toast.success(t('ui.studentLessons.toastRescheduled'));
        setRescheduleConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['all-lessons'] });
        queryClient.invalidateQueries({ queryKey: ['student-packages'] });
        queryClient.invalidateQueries({ queryKey: ['lessons'] });
        queryClient.invalidateQueries({ queryKey: ['packages'] });
        onReschedule?.();
      } catch (err: any) {
        toast.error(t('ui.studentLessons.toastCancelError'), {
          description: err?.message ?? t('ui.studentLessons.tryAgain'),
        });
      } finally {
        setRescheduling(false);
      }
    };

    const onRescheduleClick = () => {
      if (tooSoonToCancel) {
        setTooSoonOpen(true);
      } else {
        setRescheduleConfirmOpen(true);
      }
    };

    const onCancelClick = () => {
      if (tooSoonToCancel) {
        setTooSoonOpen(true);
      } else {
        setCancelOpen(true);
      }
    };

    return (
      <div className="flex gap-0 relative">
        {/* Timeline column */}
        <div className="flex flex-col items-center w-5 shrink-0 relative">
          {/* Dot */}
          <div
            className="rounded-full shrink-0 mt-4 z-10"
            style={{ width: 8, height: 8, backgroundColor: dotColor }}
          />
          {/* Vertical line */}
          {!isLast && (
            <div className="flex-1 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
          )}
        </div>

        {/* Card body */}
        <div className="glass-card overflow-hidden relative flex-1 mb-2 ml-2">
          <div className="p-3 relative">
            {/* Top row: date + time + lesson# + status badge — all on one line */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                <span className="font-heading font-semibold text-ivory text-sm">{formatLessonDate(lesson, 'full', locale)}</span>
                <span className="text-ivory/60 text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatLessonTime(lesson)} • {lesson.duration_minutes}m
                </span>
                {lessonNum && (
                  <span style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 10 }}>
                    #{lessonNum}
                  </span>
                )}
                {isSharedPackageLesson && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(240,192,64,0.14)',
                      border: '1px solid rgba(240,192,64,0.35)',
                      color: '#F0C040',
                    }}
                  >
                    {t('ui.studentLessons.sharedPackageTag')}
                  </span>
                )}
              </div>
              {lesson.skipped ? (
                <Badge className="text-[10px] shrink-0 bg-amber-500/20 text-amber-300 border-amber-400/30">
                  {t('ui.studentLessons.skipped')}
                </Badge>
              ) : (
                <Badge
                  className={`text-[10px] shrink-0 ${
                    isCompleted ? 'bg-green-accent/20 text-green-accent border-green-accent/30' :
                    lesson.status === 'scheduled' ? 'bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30' :
                    'bg-destructive/20 text-destructive border-destructive/30'
                  }`}
                >
                  {statusLabel(lesson.status)}
                </Badge>
              )}
            </div>

            {/* Type pill */}
            <div className="mt-1.5">
              <Badge className="bg-green-accent/20 text-green-accent border-green-accent/30 text-[10px]">
                {translateLessonType(lesson.lesson_type, language)}
              </Badge>
            </div>

            {/* Coach videos for this lesson */}
            {lessonVideos.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-white/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Play className="h-3.5 w-3.5 text-gold-accent" />
                  <span className="text-xs font-medium text-ivory/80">
                    {lessonVideos.length === 1 ? t('ui.studentLessons.coachVideo') : `${t('ui.studentLessons.coachVideos')} (${lessonVideos.length})`}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {lessonVideos.map((v) => (
                    <LessonVideoThumb key={v.id} v={v} onOpen={() => setOpenVideoId(v.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* Coach Notes expandable — only render if there are notes */}
            {(hasCoachNotes || hasStudentNotes) && (
              <div className="mt-2.5 pt-2.5 border-t border-white/10">
                <button
                  onClick={() => setNotesOpen(!notesOpen)}
                  className="flex items-center justify-between w-full text-left group"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-gold-accent" />
                    <span className="text-xs font-medium text-ivory/80">{t('ui.studentLessons.coachNotes')}</span>
                    {hasCoachNotes && (
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-accent" />
                    )}
                  </div>
                  {notesOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 text-ivory/60" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-ivory/60" />
                  )}
                </button>

                {notesOpen && (
                  <div className="mt-2 space-y-2 animate-fade-in">
                    {hasCoachNotes && (
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-xs text-ivory/70">{lesson.coach_notes}</p>
                      </div>
                    )}
                    {hasStudentNotes && (
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-green-accent mb-1">
                          <FileText className="h-3 w-3" />
                          <span>{t('ui.studentLessons.myNotes')}</span>
                        </div>
                        <p className="text-xs text-ivory/70">{lesson.student_notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Cancel / Change lesson — only for upcoming, scheduled, non-skipped lessons */}
            {canCancel && lesson.status === 'scheduled' && !lesson.skipped && (
              <div className="mt-2.5 pt-2.5 border-t border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openGoogleCalendar({
                        lessonDate: lesson.lesson_date,
                        lessonTime: lesson.lesson_time,
                        durationMinutes: lesson.duration_minutes ?? 60,
                        lessonType: lesson.lesson_type,
                        notes: lesson.student_notes,
                        coachLabel: t('common.yourCoach'),
                      })
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-accent hover:text-gold-accent/80 transition-colors"
                  >
                    <CalendarPlus className="h-3 w-3" />
                    {t('ui.studentLessons.addToCalendar')}
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onRescheduleClick}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                        tooSoonToCancel
                          ? 'text-ivory/30 hover:text-ivory/40 cursor-help'
                          : 'text-ivory/70 hover:text-ivory'
                      }`}
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      {t('ui.studentLessons.change')}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelClick}
                      title={tooSoonToCancel ? 'Cancellations must be made at least 24 hours in advance' : undefined}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                        tooSoonToCancel
                          ? 'text-ivory/30 hover:text-ivory/40 cursor-help'
                          : 'text-destructive/90 hover:text-destructive'
                      }`}
                    >
                      <X className="h-3 w-3" />
                      {t('ui.studentLessons.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {canCancel && (
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-ivory">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-ivory">
                  {isSharedPackageLesson
                    ? t('ui.studentLessons.sharedCancelTitle')
                    : t('ui.studentLessons.confirmCancel')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-ivory/70">
                  {isSharedPackageLesson
                    ? t('ui.studentLessons.sharedCancelDesc')
                    : 'Your lesson credit will be returned to your package and the time slot will become available for other students.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cancelling}>{t('ui.studentLessons.keepLesson')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleCancel();
                  }}
                  disabled={cancelling}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canCancel && (
          <AlertDialog open={rescheduleConfirmOpen} onOpenChange={setRescheduleConfirmOpen}>
            <AlertDialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-ivory">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-ivory">
                  {t('ui.studentLessons.changeLessonTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-ivory/70">
                  {t('ui.studentLessons.changeLessonDesc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={rescheduling}>Keep current time</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleReschedule();
                  }}
                  disabled={rescheduling}
                  className="bg-green-accent text-ivory hover:bg-green-accent/90"
                >
                  {rescheduling ? 'Cancelling…' : 'Yes, change lesson'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canCancel && (
          <AlertDialog open={tooSoonOpen} onOpenChange={setTooSoonOpen}>
            <AlertDialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-ivory">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-ivory">
                  {t('ui.studentLessons.tooCloseToCancel')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-ivory/70">
                  Cancellations must be made at least 24 hours in advance. Please contact your Coach directly if you need to make changes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(
                      'https://wa.me/19153143415?text=Hola%20coach!%20Necesito%20cambiar%20mi%20clase%20de%20hoy%2Fma%C3%B1ana.',
                      '_blank',
                      'noopener,noreferrer',
                    );
                    setTooSoonOpen(false);
                  }}
                  className="bg-green-accent text-ivory hover:bg-green-accent/90"
                >
                  Contact Coach
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  };

  const MonthHeader = ({ label }: { label: string }) => (
    <div className="flex items-center gap-3 mb-2 mt-4 first:mt-0 pl-8">
      <span style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }} className="uppercase tracking-widest font-semibold whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
    </div>
  );

  const TimelineLessonList = ({ groups, cancellable = false, onReschedule }: { groups: { label: string; lessons: any[] }[]; cancellable?: boolean; onReschedule?: () => void }) => {
    // Flatten to know total count for isLast
    const allLessons = groups.flatMap(g => g.lessons);
    let runningIndex = 0;

    return (
      <>
        {groups.map((group) => (
          <div key={group.label}>
            <MonthHeader label={group.label} />
            {group.lessons.map((lesson) => {
              const idx = runningIndex++;
              return (
                <LessonCard key={lesson.id} lesson={lesson} isLast={idx === allLessons.length - 1} cancellable={cancellable} onReschedule={onReschedule} />
              );
            })}
          </div>
        ))}
      </>
    );
  };

  const PackageCard = ({ pkg }: { pkg: any }) => {
    const [open, setOpen] = useState(false);
    const pkgLessons = lessonsByPackage.get(pkg.id) || [];
    const used = pkgLessons.length > 0 ? getWeightedLessonCount(pkgLessons, true) : (pkg.classes_used ?? 0);
    const remaining = Math.max(0, (pkg.package_size ?? used + (pkg.classes_remaining ?? 0)) - used);
    const total = pkg.package_size ?? used + remaining;
    const progressPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const isActive = !!pkg.is_active && remaining > 0;

    return (
      <div className="glass-card overflow-hidden mb-3" style={{ borderRadius: 16 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full p-4 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: isActive ? 'rgba(74,124,89,0.2)' : 'rgba(255,255,255,0.06)' }}
              >
                <Package className="h-5 w-5" style={{ color: isActive ? '#4a7c59' : '#E8D5B0' }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-ivory text-sm truncate">
                    {pkg.package_name || t('ui.studentLessons.lessonsPackage').replace('{n}', String(total))}
                  </span>
                  <Badge
                    className={
                      isActive
                        ? 'bg-green-accent/20 text-green-accent border-green-accent/30 text-[10px]'
                        : 'bg-white/10 text-ivory/60 border-white/10 text-[10px]'
                    }
                  >
                    {isActive ? t('ui.studentLessons.active') : t('ui.studentLessons.completed')}
                  </Badge>
                  {pkg.isShared && (
                    <Badge className="bg-gold/15 text-gold border-gold/30 text-[10px]">
                      {t('ui.studentLessons.sharedBy')} {pkg.ownerName}
                    </Badge>
                  )}
                </div>
                <p className="text-ivory/50 text-xs mt-0.5">
                  {t('ui.studentLessons.usedRemaining')
                    .replace('{used}', String(used))
                    .replace('{total}', String(total))
                    .replace('{remaining}', String(remaining))}
                </p>
              </div>
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-ivory/60 shrink-0 mt-1" />
            ) : (
              <ChevronDown className="h-4 w-4 text-ivory/60 shrink-0 mt-1" />
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: isActive ? '#4a7c59' : '#E8D5B0',
              }}
            />
          </div>

          {pkg.amount_paid > 0 && (
            <p className="text-[10px] text-ivory/40 mt-2">
              {t('ui.studentLessons.paid')} {fmtMXN(Number(pkg.amount_paid))}
              {pkg.payment_date ? ` · ${pkg.payment_date}` : ''}
            </p>
          )}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 border-t border-white/10 animate-fade-in">
            {pkgLessons.length === 0 ? (
              <p className="text-ivory/40 text-xs italic mt-3">
                {t('ui.studentLessons.noLessonsAttached')}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pkgLessons.map((l) => {
                  const completed = l.status === 'completed';
                  const lessonNumber = lessonNumberMap.get(l.id);
                  return (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 rounded-lg p-2.5"
                      style={{ background: 'rgba(255,255,255,0.04)' }}
                    >
                      <span
                        className="text-[10px] font-semibold w-5 text-center shrink-0"
                        style={{ color: 'rgba(232,213,176,0.5)' }}
                      >
                        {lessonNumber ?? '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ivory text-sm font-medium truncate">
                          {formatLessonDate(l, 'full', locale)}
                        </p>
                        <p className="text-ivory/50 text-xs">
                          {formatLessonTime(l)} · {translateLessonType(l.lesson_type, language)}
                        </p>
                      </div>
                      {l.skipped ? (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[10px]">
                          {t('ui.studentLessons.skipped')}
                        </Badge>
                      ) : completed ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#4a7c59' }} />
                      ) : (
                        <Badge className="bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30 text-[10px] capitalize">
                          {statusLabel(l.status)}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <div className="app-bg min-h-screen">
      <InternalHeader
        titleKey="admin.myLessonsTitle"
        subtitleKey="admin.myLessonsSub"
        backTo="/dashboard"
        actionSlot={
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={manualRefreshing || pulling}
            aria-label="Refresh lessons"
            className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
          >
            <RefreshCw className={`h-4 w-4 text-ivory ${manualRefreshing || pulling ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Pull-to-refresh indicator */}
      {(pull > 0 || pulling) && (
        <div
          className="fixed left-1/2 z-30 -translate-x-1/2 pointer-events-none"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
            transform: `translateX(-50%) translateY(${Math.min(pull, pullThreshold) - 24}px)`,
            transition: pulling ? 'transform 200ms ease' : 'none',
          }}
        >
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(8,20,10,0.85)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <RefreshCw
              className={`h-4 w-4 text-ivory ${pulling ? 'animate-spin' : ''}`}
              style={{
                transform: pulling ? undefined : `rotate(${pullProgress * 360}deg)`,
                transition: pulling ? undefined : 'transform 80ms linear',
                opacity: 0.5 + pullProgress * 0.5,
              }}
            />
          </div>
        </div>
      )}

      {/* Extra bottom padding so the floating "+" button never covers a card. */}
      <main className="container mx-auto px-4 py-6 pb-32 lg:pb-12">
        <Tabs defaultValue="past" className="space-y-6">
          <TabsList
            className="flex w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-5 mb-4"
          >
            <TabsTrigger value="past" className="glass-pill-tab flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-3">
              {t('ui.studentLessons.tabTaken')} ({pastCompletedLessons.length})
            </TabsTrigger>
            <TabsTrigger value="packages" className="glass-pill-tab flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-3">
              {t('ui.studentLessons.tabPackages')} ({packages.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="glass-pill-tab flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-3">
              {t('ui.studentLessons.tabScheduled')} ({upcomingLessons.length})
            </TabsTrigger>
            <TabsTrigger value="reports" className="glass-pill-tab flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-3">
              {t('ui.studentLessons.tabReports')}
            </TabsTrigger>
            {recurringSlots.length > 0 && (
              <TabsTrigger value="schedule" className="glass-pill-tab flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-3">
                {t('ui.studentLessons.tabSchedule')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="upcoming" className="animate-fade-in space-y-6">
            {!hasLinkedCoach && (
              <LinkCoachCard variant="banner" />
            )}

            {upcomingLessons.length > 0 ? (
              <TimelineLessonList groups={upcomingGroups} cancellable onReschedule={() => setRescheduleBookOpen(true)} />
            ) : (
              <div className="glass-card p-8 text-center">
                <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                  <Calendar className="h-8 w-8 text-ivory/40" />
                </div>
                <p className="text-ivory/70 font-medium text-lg mb-2">{t('ui.studentLessons.noUpcoming')}</p>
                <p className="text-sm text-ivory/40">{t('ui.studentLessons.noUpcomingSub')}</p>
              </div>
            )}

            {/* Booking CTAs live at the END of the Scheduled tab. */}
            <UpcomingBookingSection email={profile?.email} />
          </TabsContent>

          {recurringSlots.length > 0 && (
            <TabsContent value="schedule" className="animate-fade-in">
              <div
                className="glass-card p-5 space-y-4"
                style={{
                  borderColor: 'rgba(240,192,64,0.35)',
                  boxShadow: '0 0 0 1px rgba(240,192,64,0.08) inset, 0 8px 28px -14px rgba(240,192,64,0.20)',
                  background: 'linear-gradient(160deg, rgba(240,192,64,0.06), rgba(255,255,255,0.04))',
                }}
              >
                {/* Golden priority spot header */}
                <div className="flex items-center gap-2 pb-3 border-b border-gold-accent/20">
                  <Repeat className="h-4 w-4 text-gold-accent flex-shrink-0" />
                  <p className="text-gold-accent text-xs uppercase tracking-[0.14em] font-semibold">
                    {t('ui.studentLessons.prioritySpot')}
                  </p>
                </div>

                {(recurringSlots as any[]).map((slot, i) => (
                  <div
                    key={slot.id}
                    className={i > 0 ? 'pt-4 border-t border-white/10' : ''}
                  >
                    <p className="text-ivory font-semibold capitalize">
                      {new Intl.DateTimeFormat(locale, { weekday: 'long' })
                        .format(new Date(2024, 0, 7 + Number(slot.weekday ?? 0), 12))}
                    </p>
                    <p className="text-ivory/60 text-sm mt-0.5">
                      {formatLessonTime({ lesson_time: slot.start_time })}
                      {slot.duration_minutes ? ` · ${slot.duration_minutes} min` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider"
                        style={{ background: 'rgba(74,124,89,0.18)', color: '#7BC894' }}
                      >
                        {t('ui.studentLessons.confirmed')}
                      </span>
                      <span className="text-ivory/45 text-[11px]">{t('ui.studentLessons.weekly')}</span>
                      <StudentStartsOnBadge startsOn={slot.starts_on} />
                      {!slot.is_own && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ background: 'rgba(240,192,64,0.14)', color: '#F0C040' }}
                        >
                          {t('ui.studentLessons.sharedPackageTag')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Membership benefit note for the logged-in student's plan. */}
                <div className="pt-4 border-t border-white/10">
                  {['scratch', 'pro', 'apex'].includes(String(effectivePlan)) ? (
                    <p className="text-[11px] text-ivory/60">
                      {t('ui.studentLessons.benefitMembership').replace(
                        '{plan}',
                        effectivePlan === 'apex' ? 'Apex Level' : effectivePlan === 'pro' ? 'Pro' : 'Scratch',
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-ivory/60">
                      {t('ui.studentLessons.benefitCourtesy')}{' '}
                      <Link to="/plans" className="text-gold-accent underline underline-offset-2">
                        {t('ui.studentLessons.seePlans')}
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="past" className="animate-fade-in">
            {pastCompletedLessons.length > 0 ? (
              (() => {
                // Active package = first is_active with remaining slots
                const activePkg = (packages as any[]).find((p: any) => {
                  const used = p.classes_used ?? 0;
                  const remaining = Math.max(
                    0,
                    (p.package_size ?? used + (p.classes_remaining ?? 0)) - used,
                  );
                  return !!p.is_active && remaining > 0;
                });
                const pkgMap = new Map<string, any>((packages as any[]).map((p) => [p.id, p]));
                let lastKey: string | null = null;
                let lastAccent: string | null = null;
                let lastIsActive = false;
                const out: any[] = [];
                const totalCount = pastCompletedLessons.length;
                pastCompletedLessons.forEach((lesson: any, idx: number) => {
                  const key = lesson.package_id || '__none__';
                  if (key !== lastKey) {
                    const pkg = lesson.package_id ? pkgMap.get(lesson.package_id) : null;
                    const isActive = !!(pkg && activePkg && pkg.id === activePkg.id);
                    const usedOverride = pkg
                      ? getWeightedLessonCount(lessonsByPackage.get(pkg.id) || [], true)
                      : null;
                    out.push(
                      <PackageGroupDivider
                        key={`divider-${key}-${lesson.id}`}
                        pkg={pkg}
                        isActive={isActive}
                        usedOverride={usedOverride}
                      />,
                    );
                    lastKey = key;
                    lastAccent = pkg ? (isActive ? '#F0C040' : 'rgba(245,240,232,0.25)') : 'rgba(245,240,232,0.15)';
                    lastIsActive = isActive;
                  }
                  out.push(
                    <LessonCard key={lesson.id} lesson={lesson} isLast={idx === totalCount - 1} />
                  );
                  const isLast = idx === totalCount - 1;
                  const nextKey = !isLast ? (pastCompletedLessons[idx + 1].package_id || '__none__') : null;
                  if (isLast || nextKey !== key) {
                    const pkg = lesson.package_id ? pkgMap.get(lesson.package_id) : null;
                    out.push(
                      <PackageGroupDivider
                        key={`divider-end-${key}-${lesson.id}`}
                        pkg={pkg}
                        isActive={lastIsActive}
                        variant="close"
                      />,
                    );
                  }
                });
                return <div>{out}</div>;
              })()
            ) : (
              <div className="glass-card p-12 text-center">
                <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                  <FileText className="h-8 w-8 text-ivory/40" />
                </div>
                <p className="text-ivory/70 font-medium text-lg">{t('ui.studentLessons.noPast')}</p>
                <p className="text-sm text-ivory/40 mt-2">{t('ui.studentLessons.noPastSub')}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="packages" className="animate-fade-in">
            {!hasLinkedCoach && (
              <div className="mb-4">
                <LinkCoachCard variant="banner" />
              </div>
            )}
            {packages.length > 0 ? (
              <div>
                {packages.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5">
                  <Package className="h-8 w-8 text-ivory/40" />
                </div>
                <p className="text-ivory/70 font-medium text-lg mb-2">{t('ui.studentLessons.noPackagesTitle')}</p>
                <p className="text-sm text-ivory/40 mb-6">
                  {t('ui.studentLessons.emptyPackages')}
                </p>
                <EmptyPackagesCtas />
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="animate-fade-in">
            <div className="flex justify-center mb-4">
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="h-10 px-4 rounded-full flex items-center gap-2 text-xs font-medium text-ivory transition-transform active:scale-95"
                style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.45)' }}
              >
                <FileText className="h-4 w-4 text-gold-accent" />
                {t('ui.studentLessons.generateReport')}
              </button>
            </div>
            <StudentReportsPanel />
          </TabsContent>
        </Tabs>
      </main>

      {user && (
        <CreateReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          studentId={user.id}
          studentName={profile?.full_name || user.email || 'Student'}
          mode="student"
          onReportGenerated={() => {}}
          onScoringSaved={() => queryClient.invalidateQueries({ queryKey: ['my-visible-reports', user.id] })}
        />
      )}

      <SocialFooter />

      <VideoDetailModal
        videoId={openVideoId}
        isOpen={!!openVideoId}
        onClose={() => setOpenVideoId(null)}
        isCoach={false}
      />
    </div>
    <InternalBookingModal open={rescheduleBookOpen} onOpenChange={setRescheduleBookOpen} />
    </>
   );
}

/** Booking options shown at the top of the Upcoming tab.
 * Paid members (Scratch/Pro/SC): "Book via Calendly" + "Priority Spot".
 * Free members: "Book via Calendly" + marketing banner + "Secure Your Time".
 */
function UpcomingBookingSection({ email }: { email?: string }) {
  const navigate = useNavigate();
  const { effectivePlan, hasLinkedCoach } = useAuth();
  const { t } = useLanguage();
  const hasPaid =
    effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';
  const [bookOpen, setBookOpen] = useState(false);
  const [coachGateOpen, setCoachGateOpen] = useState(false);

  const handleBookClick = () => {
    if (!hasLinkedCoach) {
      setCoachGateOpen(true);
      return;
    }
    setBookOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Option 1: Book a lesson (internal scheduling) */}
      <button
        type="button"
        onClick={handleBookClick}
        className="glass-card w-full text-left p-5 sm:p-6 flex items-center gap-4 group transition-all hover:bg-white/[0.04] hover:-translate-y-0.5"
      >
        <div className="h-12 w-12 shrink-0 rounded-xl bg-green-accent/15 border border-green-accent/30 flex items-center justify-center">
          <Calendar className="h-6 w-6 text-green-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-ivory font-heading font-semibold text-base sm:text-lg leading-tight">
            {t('ui.studentLessons.bookLesson')}
          </p>
          <p className="text-ivory/60 text-xs sm:text-sm mt-0.5">
            {t('ui.studentLessons.pickOpenSpot').replace('{coach}', t('common.yourCoach'))}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-ivory/40 group-hover:text-ivory/70 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>
      <InternalBookingModal open={bookOpen} onOpenChange={setBookOpen} />
      <RequireCoachModal
        open={coachGateOpen}
        onOpenChange={setCoachGateOpen}
        reason="book"
        onLinked={() => setBookOpen(true)}
      />

      {hasPaid ? (
        <FixedScheduleEntryCard />
      ) : (
        <>
          {/* Marketing banner */}
          <div className="text-center px-2">
        <p className="text-ivory/80 font-heading font-medium text-sm sm:text-base">
          {t('ui.studentLessons.wantPermanent')}
        </p>
        <p className="text-ivory/50 text-xs sm:text-sm mt-1">
          {t('ui.studentLessons.wantPermanentDesc').replace('{coach}', t('common.yourCoach'))}
        </p>
          </div>

          {/* Option 2: Secure Your Time (premium gold accent) */}
          <button
        type="button"
        onClick={() => navigate('/plans')}
        className="glass-card w-full text-left p-5 sm:p-6 flex items-center gap-4 group transition-all hover:-translate-y-0.5 relative overflow-hidden"
        style={{
          borderColor: 'rgba(240,192,64,0.35)',
          boxShadow: '0 0 0 1px rgba(240,192,64,0.15) inset, 0 8px 24px -12px rgba(240,192,64,0.25)',
        }}
          >
            {/* Subtle gold glow */}
            <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(240,192,64,0.10), transparent 60%)',
          }}
        />
            <div className="h-12 w-12 shrink-0 rounded-xl bg-gold-accent/15 border border-gold-accent/40 flex items-center justify-center relative">
              <Sparkles className="h-6 w-6 text-gold-accent" />
            </div>
            <div className="flex-1 min-w-0 relative">
              <p className="text-ivory font-heading font-semibold text-base sm:text-lg leading-tight">
                {t('ui.studentLessons.secureYourTime')} <span className="text-gold-accent">→</span>
              </p>
              <p className="text-ivory/60 text-xs sm:text-sm mt-0.5">
                {t('ui.studentLessons.availableWith')}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gold-accent/70 group-hover:text-gold-accent group-hover:translate-x-0.5 transition-all shrink-0 relative" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Priority Spot entry card — shown on /lessons Upcoming tab.
 * Paid plans see a green "Open" card; free/member sees a locked gold card.
 */
function FixedScheduleEntryCard() {
  const navigate = useNavigate();
  const { effectivePlan } = useAuth();
  const { t } = useLanguage();
  const hasPaid =
    effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';

  if (hasPaid) {
    return (
      <button
        type="button"
        onClick={() => navigate('/lessons/fixed-schedule')}
        className="glass-card w-full text-left p-5 sm:p-6 flex items-center gap-4 group transition-all hover:bg-white/[0.04] hover:-translate-y-0.5"
      >
        <div className="h-12 w-12 shrink-0 rounded-xl bg-green-accent/15 border border-green-accent/30 flex items-center justify-center">
          <CalendarCheck className="h-6 w-6 text-green-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-ivory font-heading font-semibold text-base sm:text-lg leading-tight">
            {t('ui.studentLessons.prioritySpot')}
          </p>
          <p className="text-ivory/60 text-xs sm:text-sm mt-0.5">
            {t('ui.studentLessons.pickWeeklySpot').replace('{coach}', t('common.yourCoach'))}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-ivory/40 group-hover:text-ivory/70 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/plans')}
      className="glass-card w-full text-left p-5 sm:p-6 flex items-center gap-4 group transition-all hover:-translate-y-0.5 relative overflow-hidden"
      style={{
        borderColor: 'rgba(240,192,64,0.30)',
        boxShadow: '0 0 0 1px rgba(240,192,64,0.10) inset, 0 8px 24px -12px rgba(240,192,64,0.20)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            'radial-gradient(circle at top right, rgba(240,192,64,0.10), transparent 60%)',
        }}
      />
      <div className="h-12 w-12 shrink-0 rounded-xl bg-gold-accent/15 border border-gold-accent/40 flex items-center justify-center relative">
        <Lock className="h-6 w-6 text-gold-accent" />
      </div>
      <div className="flex-1 min-w-0 relative">
          <p className="text-ivory font-heading font-semibold text-base sm:text-lg leading-tight">
            {t('ui.studentLessons.prioritySpot')}
          </p>
        <p className="text-ivory/60 text-xs sm:text-sm mt-0.5">
          {t('ui.studentLessons.upgradeSpot').replace('{coach}', t('common.yourCoach'))}
        </p>
        <p className="text-gold-accent text-xs sm:text-sm font-medium mt-1.5 inline-flex items-center gap-1">
          {t('ui.studentLessons.viewPlans')} <ArrowRight className="h-3.5 w-3.5" />
        </p>
      </div>
    </button>
  );
}

/**
 * Empty-state CTAs for the Packages tab. Gates both buttons behind the
 * coach-link requirement so a student without an assigned coach is asked
 * to enter a coach code before being sent to /plans?tab=pricing.
 */
function EmptyPackagesCtas() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { hasLinkedCoach } = useAuth();
  const [gateOpen, setGateOpen] = useState(false);
  const [gateReason, setGateReason] = useState<'package' | 'individual_lesson'>('package');

  const goToPricing = () => navigate('/plans?tab=pricing');

  const handleClick = (reason: 'package' | 'individual_lesson') => {
    if (!hasLinkedCoach) {
      setGateReason(reason);
      setGateOpen(true);
      return;
    }
    goToPricing();
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button
          className="btn-green px-6 py-3 w-full sm:w-auto"
          onClick={() => handleClick('package')}
        >
          {t('ui.studentLessons.getPackage')}
        </Button>
        <Button
          variant="outline"
          className="px-6 py-3 w-full sm:w-auto border-white/20 bg-white/5 text-ivory hover:bg-white/10"
          onClick={() => handleClick('individual_lesson')}
        >
          {t('ui.studentLessons.buyLesson')}
        </Button>
      </div>
      <RequireCoachModal
        open={gateOpen}
        onOpenChange={setGateOpen}
        reason={gateReason}
        onLinked={goToPricing}
      />
    </>
  );
}
