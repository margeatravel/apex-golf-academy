import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtMXN } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, DollarSign, TrendingUp, Video, GraduationCap, UserCog, BarChart3, Upload, Search, ChevronRight, MoreVertical, LinkIcon, Copy, ExternalLink, Settings, CalendarCheck, Repeat, Plus, Sparkles, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import {
  demoStudents,
  buildDemoLessons,
  buildDemoBlocks,
  demoSubscriptions,
  demoRecurringSlots,
  DEMO_REVENUE_SUMMARY,
} from '@/data/demoData';
import { supabase } from '@/integrations/supabase/client';
import { formatLessonDate, formatLessonTime, getLessonCalendarParts, getTodayInAppTimezone } from '@/lib/formatLessonDateTime';
import ApexBrand from '@/components/ApexBrand';
import { Link, useNavigate } from 'react-router-dom';
import { SocialFooter } from '@/components/SocialFooter';
import { MobileMenu } from '@/components/MobileMenu';
import { CoachAvatarMenu } from '@/components/CoachAvatarMenu';
import { NotificationBell } from '@/components/NotificationBell';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { AdminRecurringSchedulesView } from '@/components/AdminRecurringSchedulesView';
import { AddToRecurringScheduleModal } from '@/components/AddToRecurringScheduleModal';
import { DashboardCalendarHero } from '@/components/calendar/DashboardCalendarHero';
import { useEffect, useMemo, useState } from 'react';
import { useCalendarWeek } from '@/components/calendar/useCalendarWeek';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';
import { Pencil, Trash2, CalendarOff, RotateCcw } from 'lucide-react';
import { SkipWeekModal } from '@/components/SkipWeekModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { computeMtdRevenue } from '@/lib/revenueCalc';
import { ensureLessonRowId, removeLessonFromCalendar } from '@/lib/materializeRecurringLesson';


const APP_TIMEZONE = 'America/Cancun';
const STUDENT_PORTAL_URL = 'https://margeagolfacademy.com';

function getStatusStyle(status: string) {
  switch (status) {
    case 'completed': return { bg: 'rgba(74,124,89,0.2)', color: '#4a7c59' };
    case 'scheduled': return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' };
    case 'no_show': return { bg: 'rgba(251,146,60,0.15)', color: '#fb923c' };
    case 'cancelled': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    default: return { bg: 'rgba(255,255,255,0.1)', color: '#F5F0E8' };
  }
}

function LessonStatusDropdown({
  lesson,
  onStatusChange,
  onEdit,
  onDelete,
  onSkip,
}: {
  lesson: any;
  onStatusChange: (id: string, status: string) => void;
  onEdit?: (lesson: any) => void;
  onDelete?: (lesson: any) => void;
  onSkip?: (lesson: any) => void;
}) {
  const { t } = useLanguage();
  const statusLabels: Record<string, string> = {
    scheduled: t('admin.statusScheduled'),
    completed: t('admin.statusCompleted'),
    no_show: t('admin.statusNoShow'),
    cancelled: t('admin.statusCancelled'),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
          <MoreVertical className="h-4 w-4" style={{ color: '#F5F0E8', opacity: 0.5 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-44 border shadow-lg z-50"
        style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}
        align="end"
      >
        <DropdownMenuLabel style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>{t('admin.changeStatus')}</DropdownMenuLabel>
        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
        {(['scheduled', 'completed', 'no_show', 'cancelled'] as const).map(s => (
          <DropdownMenuItem
            key={s}
            onClick={() => onStatusChange(lesson.id, s)}
            className="gap-2 cursor-pointer"
            style={{ color: lesson.status === s ? getStatusStyle(s).color : '#F5F0E8' }}
          >
            <div className="h-2 w-2 rounded-full" style={{ background: getStatusStyle(s).color }} />
            {statusLabels[s]}
            {lesson.status === s && <span className="ml-auto text-xs opacity-50">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
        {onEdit && (
          <DropdownMenuItem
            onClick={() => onEdit(lesson)}
            className="gap-2 cursor-pointer"
            style={{ color: '#F5F0E8' }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('common.edit')}
          </DropdownMenuItem>
        )}
        {onSkip && lesson.recurring_slot_id && lesson.status !== 'completed' && (
          <DropdownMenuItem
            onClick={() => onSkip(lesson)}
            className="gap-2 cursor-pointer"
            style={{ color: lesson.skipped ? '#4a7c59' : '#F0C040' }}
          >
            {lesson.skipped ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Restore week
              </>
            ) : (
              <>
                <CalendarOff className="h-3.5 w-3.5" />
                Skip this week
              </>
            )}
          </DropdownMenuItem>
        )}
        {lesson.student_id && (
          <DropdownMenuItem asChild className="gap-2 cursor-pointer" style={{ color: '#F5F0E8' }}>
            <Link to={`/admin/student/${lesson.student_id}`}>{t('admin.viewStudent')}</Link>
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
            <DropdownMenuItem
              onClick={() => onDelete(lesson)}
              className="gap-2 cursor-pointer"
              style={{ color: '#ef4444' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TodaySchedule() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCoachId } = useAuth();
  const todayInCancun = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  // Today's Schedule reads from the SAME merge pipeline as the Master Calendar
  // (useCalendarWeek): recurring_lesson_slots projections + concrete lessons +
  // open spots + blocks. This guarantees the dashboard shows exactly what
  // Live Calendar shows for the day (America/Cancun).
  const todayDateObj = useMemo(() => {
    const [y, m, d] = todayInCancun.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [todayInCancun]);
  const { data: todayByDate = {} } = useCalendarWeek([todayDateObj]);

  // Lesson rows derived from the merged slots (kinds fixed/one_time only —
  // open spots and block tiles are not lessons). Projected recurring slots
  // without a concrete lesson row are synthesized so they render identically
  // to Live Calendar.
  const todayLessons: any[] = useMemo(() => {
    const slots = (todayByDate as Record<string, any[]>)[todayInCancun] || [];
    return slots
      .filter((s: any) => s.kind === 'fixed' || s.kind === 'one_time')
      .map((s: any) => {
        const raw = s.raw?.lesson ?? null;
        if (raw) {
          return {
            ...raw,
            profiles: raw.profiles ?? (s.student_name ? { full_name: s.student_name } : undefined),
            _hasLessonRow: true,
          };
        }
        return {
          id: s.id,
          student_id: s.student_id ?? null,
          lesson_date: s.date,
          lesson_time: s.start_time,
          duration_minutes: s.duration_minutes,
          lesson_type: s.lesson_type,
          status: s.status ?? 'scheduled',
          skipped: false,
          recurring_slot_id: s.recurring_slot_id ?? null,
          invitee_name: s.student_name ?? null,
          profiles: s.student_name ? { full_name: s.student_name } : undefined,
          _hasLessonRow: false,
        };
      });
  }, [todayByDate, todayInCancun]);

  const { data: todayBlocks = [] } = useQuery({
    queryKey: ['today-blocks', todayInCancun, isDemoModeActive() ? 'demo' : 'live', effectiveCoachId ?? 'me'],
    queryFn: async () => {
      if (isDemoModeActive()) {
        return buildDemoBlocks(0, 1).filter((b: any) => b.block_date === todayInCancun);
      }
      let q = supabase
        .from('coach_availability_blocks')
        .select('id, start_time, end_time, reason')
        .eq('block_date', todayInCancun);
      if (effectiveCoachId) q = q.eq('coach_id', effectiveCoachId);
      const { data } = await q;
      return data || [];
    },
  });

  const fullDayBlock = todayBlocks.find((b: any) => !b.start_time && !b.end_time) || null;
  const partialBlocks = todayBlocks.filter((b: any) => b.start_time && b.end_time);

  const toMin = (t: string) => {
    const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const lessonBlockReason = (lesson: any): string | null => {
    if (fullDayBlock) return fullDayBlock.reason || t('admin.dayBlocked');
    if (!lesson.lesson_time) return null;
    const ls = toMin(lesson.lesson_time);
    const le = ls + (lesson.duration_minutes || 60);
    for (const b of partialBlocks as any[]) {
      const bs = toMin(b.start_time);
      const be = toMin(b.end_time);
      if (ls < be && le > bs) return b.reason || t('admin.partialBlock');
    }
    return null;
  };

  const [editLesson, setEditLesson] = useState<any | null>(null);
  const [deleteLesson, setDeleteLesson] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [skipSlot, setSkipSlot] = useState<any | null>(null);
  const [skipDefaultDate, setSkipDefaultDate] = useState<string | null>(null);
  const [skipStudentProfile, setSkipStudentProfile] = useState<{ full_name?: string | null; email?: string | null } | null>(null);

  const handleSkipLesson = async (lesson: any) => {
    if (!lesson.recurring_slot_id) {
      toast.error(t('coachUi.skipOnlyRecurringLessons'));
      return;
    }
    try {
      const { data: r, error } = await supabase
        .from('recurring_lesson_slots')
        .select('id, student_id, weekday, start_time, duration_minutes, lesson_type, package_id')
        .eq('id', lesson.recurring_slot_id)
        .maybeSingle();
      if (error) throw error;
      if (!r) {
        toast.error(t('coachUi.recurringSlotNotFound'));
        return;
      }
      setSkipStudentProfile({
        full_name: lesson.profiles?.full_name ?? lesson.invitee_name ?? null,
        email: lesson.profiles?.email ?? lesson.invitee_email ?? null,
      });
      setSkipDefaultDate(lesson.lesson_date);
      setSkipSlot({
        id: r.id,
        student_id: r.student_id,
        weekday: r.weekday,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes,
        lesson_type: r.lesson_type,
        package_id: r.package_id ?? null,
      });
    } catch (e: any) {
      console.error('[TodaySchedule] failed to load recurring slot:', e);
      toast.error(e?.message || 'Could not open skip dialog');
    }
  };

  /**
   * Projected recurring occurrences have no `lessons` row yet. Any coach action
   * first materializes the row (idempotently, via the same generator the bulk
   * projection uses) and then applies the action to the freshly created row.
   */
  const resolveLessonRow = async (lesson: any) => {
    const id = await ensureLessonRowId(lesson);
    if (id !== lesson.id) {
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      const { data } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle();
      return { ...lesson, ...(data || {}), id, _hasLessonRow: true };
    }
    return lesson;
  };

  const handleStatusChange = async (lesson: any, newStatus: string) => {
    try {
      const row = await resolveLessonRow(lesson);
      const { error } = await supabase.from('lessons').update({ status: newStatus as any }).eq('id', row.id);
      if (error) throw error;
      const label = newStatus === 'no_show' ? t('admin.statusNoShow') : (
        { scheduled: t('admin.statusScheduled'), completed: t('admin.statusCompleted'), cancelled: t('admin.statusCancelled') } as any
      )[newStatus] ?? newStatus;
      toast.success(`${t('admin.lessonMarkedAs')} ${label}`);
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (err: any) {
      toast.error(err.message || t('admin.errorUpdatingStatus'));
    }
  };

  const handleEditLesson = async (lesson: any) => {
    try {
      setEditLesson(await resolveLessonRow(lesson));
    } catch (err: any) {
      toast.error(err.message || t('admin.errorUpdatingStatus'));
    }
  };

  const handleDeleteLesson = async (lesson: any) => {
    try {
      setDeleteLesson(await resolveLessonRow(lesson));
    } catch (err: any) {
      toast.error(err.message || t('admin.errorUpdatingStatus'));
    }
  };


  const confirmDelete = async () => {
    if (!deleteLesson) return;
    setIsDeleting(true);
    try {
      const { error } = await removeLessonFromCalendar(deleteLesson);
      if (error) throw error;
      toast.success(t('admin.lessonDeleted'));
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setDeleteLesson(null);
    } catch (err: any) {
      toast.error(err.message || t('admin.errorDeletingLesson'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <div
        className="flex items-center justify-between mb-4 cursor-pointer group"
        onClick={() => navigate('/admin/lessons?tab=today')}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: '#4a7c59' }}>
            <Calendar className="h-4 w-4" style={{ color: '#F5F0E8' }} />
          </div>
          <div>
            <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>{t('admin.todaysSchedule')}</h3>
            <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cancun', weekday: 'long', month: 'long', day: '2-digit' }).format(new Date())}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: '#F5F0E8' }} />
      </div>
      {fullDayBlock && (
        <div
          className="flex items-center gap-3 mb-3 py-3 px-3 rounded-xl"
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
          }}
        >
          <Calendar className="h-5 w-5" style={{ color: '#ef4444' }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('admin.dayBlocked')}
            </p>
            {fullDayBlock.reason && (
              <p style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 500 }}>{fullDayBlock.reason}</p>
            )}
          </div>
        </div>
      )}
      {fullDayBlock ? null : todayLessons.length === 0 ? (
        <div className="flex items-center gap-3 py-4 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <Calendar className="h-5 w-5" style={{ color: '#E8D5B0', opacity: 0.4 }} />
          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 14 }}>{t('admin.noLessonsToday')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayLessons.map((lesson: any, idx: number) => {
            const st = getStatusStyle(lesson.status);
            const blockReason = lesson.status === 'scheduled' ? lessonBlockReason(lesson) : null;
            const isBlocked = !!blockReason;
            return (
              <div key={lesson.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center" style={{ width: 12 }}>
                  {idx > 0 && <div style={{ width: 2, height: 8, background: 'rgba(255,255,255,0.15)' }} />}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isBlocked ? '#ef4444' : st.color, flexShrink: 0 }} />
                  {idx < todayLessons.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 8, background: 'rgba(255,255,255,0.15)' }} />}
                </div>
                <div
                  className="flex items-center justify-between flex-1 py-2 px-3 rounded-xl"
                  style={{
                    background: isBlocked ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                    border: isBlocked ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                    opacity: lesson.skipped ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: '#E8D5B0', fontWeight: 600, fontSize: 13, minWidth: 42 }}>{formatLessonTime(lesson)}</span>
                    <div>
                      {lesson.student_id ? (
                        <Link to={`/admin/student/${lesson.student_id}`} style={{ color: '#F5F0E8', fontWeight: 500, fontSize: 14 }} className="hover:underline">
                          {lesson.profiles?.full_name || lesson.invitee_name || t('admin.unknownName')}
                        </Link>
                      ) : (
                        <span style={{ color: '#F5F0E8', fontWeight: 500, fontSize: 14 }}>{lesson.invitee_name || t('admin.unknownName')}</span>
                      )}
                      <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{lesson.lesson_type} • {lesson.duration_minutes}min</p>
                      {isBlocked && (
                        <p style={{ color: '#fca5a5', fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                          ⚠ {blockReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lesson.skipped && (
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(240,192,64,0.2)',
                          color: '#F0C040',
                          border: '1px solid rgba(240,192,64,0.3)',
                          fontWeight: 600,
                        }}
                      >
                        Skipped
                      </span>
                    )}
                    {isBlocked ? (
                      <Badge style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', fontSize: 11 }}>
                        {t('admin.statusBlocked')}
                      </Badge>
                    ) : (
                      <Badge style={{ background: st.bg, color: st.color, border: 'none', fontSize: 11 }}>
                        {lesson.status === 'no_show' ? t('admin.statusNoShow') : (
                          ({ scheduled: t('admin.statusScheduled'), completed: t('admin.statusCompleted'), cancelled: t('admin.statusCancelled') } as any)[lesson.status] || lesson.status
                        )}
                      </Badge>
                    )}
                    <LessonStatusDropdown
                      lesson={lesson}
                      onStatusChange={(_id, st2) => handleStatusChange(lesson, st2)}
                      onEdit={handleEditLesson}
                      onDelete={handleDeleteLesson}
                      onSkip={handleSkipLesson}
                    />

                  </div>
                </div>
              </div>
            );
          })}
          {partialBlocks
            .filter((b: any) => {
              const bs = toMin(b.start_time);
              const be = toMin(b.end_time);
              return !todayLessons.some((l: any) => {
                if (!l.lesson_time) return false;
                const ls = toMin(l.lesson_time);
                const le = ls + (l.duration_minutes || 60);
                return ls < be && le > bs;
              });
            })
            .map((b: any) => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center" style={{ width: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
                </div>
                <div
                  className="flex items-center justify-between flex-1 py-2 px-3 rounded-xl"
                  style={{ background: 'rgba(156,163,175,0.08)', border: '1px solid rgba(156,163,175,0.25)' }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: '#E8D5B0', fontWeight: 600, fontSize: 13, minWidth: 42 }}>
                      {b.start_time.slice(0, 5)}
                    </span>
                    <div>
                      <span style={{ color: '#F5F0E8', fontWeight: 500, fontSize: 14 }}>
                        {b.reason || t('admin.partialBlock')}
                      </span>
                      <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>
                        {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <Badge style={{ background: 'rgba(156,163,175,0.2)', color: '#d1d5db', border: 'none', fontSize: 11 }}>
                    {t('admin.statusBlocked')}
                  </Badge>
                </div>
              </div>
            ))}
        </div>
      )}

      <EditLessonQuickModal
        open={!!editLesson}
        onOpenChange={(o) => !o && setEditLesson(null)}
        lesson={editLesson}
      />

      <SkipWeekModal
        open={!!skipSlot}
        onOpenChange={(o) => {
          if (!o) {
            setSkipSlot(null);
            setSkipDefaultDate(null);
            setSkipStudentProfile(null);
          }
        }}
        slot={skipSlot}
        studentProfile={skipStudentProfile}
        defaultDate={skipDefaultDate}
      />

      <AlertDialog open={!!deleteLesson} onOpenChange={(o) => !o && setDeleteLesson(null)}>
        <AlertDialogContent style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#F5F0E8' }}>{t('admin.deleteThisLesson')}</AlertDialogTitle>
            <AlertDialogDescription style={{ color: '#E8D5B0', opacity: 0.7 }}>
              {t('admin.deleteLessonWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} style={{ background: '#ef4444', color: '#fff' }}>
              {isDeleting ? t('admin.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UpcomingLessonsFromDB() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCoachId } = useAuth();
  const now = new Date();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowInCancun = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrowDate);

  const { data: upcomingLessons = [], isLoading } = useQuery({
    queryKey: ['upcoming-lessons', tomorrowInCancun, isDemoModeActive() ? 'demo' : 'live', effectiveCoachId ?? 'me'],
    queryFn: async () => {
      if (isDemoModeActive()) {
        return buildDemoLessons(0, 7).filter(
          (l: any) => l.lesson_date === tomorrowInCancun && l.status === 'scheduled',
        );
      }
      // Dashboard shows ONLY tomorrow's scheduled lessons (single day window)
      let q = supabase
        .from('lessons')
        .select('*, profiles!lessons_student_id_fkey(full_name, email)')
        .eq('lesson_date', tomorrowInCancun)
        .eq('status', 'scheduled')
        .order('lesson_time', { ascending: true });
      if (effectiveCoachId) q = q.eq('coach_id', effectiveCoachId);
      const { data, error } = await q;
      if (error) return [];
      return (data || []).sort((a: any, b: any) => {
        if (a.lesson_start_at && b.lesson_start_at) return new Date(a.lesson_start_at).getTime() - new Date(b.lesson_start_at).getTime();
        return `${a.lesson_date}T${a.lesson_time || '00:00:00'}`.localeCompare(`${b.lesson_date}T${b.lesson_time || '00:00:00'}`);
      });
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const [editLesson, setEditLesson] = useState<any | null>(null);
  const [deleteLesson, setDeleteLesson] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleStatusChange = async (lessonId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('lessons').update({ status: newStatus as any }).eq('id', lessonId);
      if (error) throw error;
      const label = newStatus === 'no_show' ? t('admin.statusNoShow') : (
        { scheduled: t('admin.statusScheduled'), completed: t('admin.statusCompleted'), cancelled: t('admin.statusCancelled') } as any
      )[newStatus] ?? newStatus;
      toast.success(`${t('admin.lessonMarkedAs')} ${label}`);
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (err: any) {
      toast.error(err.message || t('admin.errorUpdatingStatus'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteLesson) return;
    setIsDeleting(true);
    try {
      const { error } = await removeLessonFromCalendar(deleteLesson);
      if (error) throw error;
      toast.success(t('admin.lessonDeleted'));
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['today-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setDeleteLesson(null);
    } catch (err: any) {
      toast.error(err.message || t('admin.errorDeletingLesson'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <div
        className="flex items-center justify-between mb-4 cursor-pointer group"
        onClick={() => navigate('/admin/lessons?tab=upcoming')}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)' }}>
            <Calendar className="h-4 w-4" style={{ color: '#60a5fa' }} />
          </div>
          <div>
            <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>{t('admin.tomorrowsLessons')}</h3>
            <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{t('admin.tapToSeeUpcoming')}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: '#F5F0E8' }} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
        </div>
      ) : upcomingLessons.length === 0 ? (
        <div className="flex items-center gap-3 py-4 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <Calendar className="h-5 w-5" style={{ color: '#E8D5B0', opacity: 0.4 }} />
          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 14 }}>{t('admin.noUpcomingSync')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcomingLessons.map((lesson: any) => {
            const isRegistered = !!lesson.profiles;
            const displayName = lesson.profiles?.full_name || lesson.invitee_name || t('admin.unknownName');
            const st = getStatusStyle(lesson.status);
            return (
              <div key={lesson.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="text-center px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', minWidth: 48 }}>
                    {(() => { const parts = getLessonCalendarParts(lesson); return (<><p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 10, textTransform: 'uppercase' }}>{parts.month}</p><p style={{ color: '#E8D5B0', fontSize: 20, fontWeight: 700 }}>{parts.day}</p></>); })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {lesson.student_id ? (
                        <Link to={`/admin/student/${lesson.student_id}`} style={{ color: '#F5F0E8', fontWeight: 500, fontSize: 14 }} className="hover:underline">
                          {displayName}
                        </Link>
                      ) : (
                        <span style={{ color: '#F5F0E8', fontWeight: 500, fontSize: 14 }}>{displayName}</span>
                      )}
                      {!isRegistered && (
                        <span style={{ color: '#F0C040', fontSize: 10, background: 'rgba(240,192,64,0.1)', padding: '1px 6px', borderRadius: 6 }}>{t('admin.notRegistered')}</span>
                      )}
                    </div>
                    <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{formatLessonTime(lesson)} • {lesson.lesson_type} • {lesson.duration_minutes}min</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge style={{ background: st.bg, color: st.color, border: 'none', fontSize: 11 }}>
                    {lesson.status === 'no_show' ? t('admin.statusNoShow') : (
                      ({ scheduled: t('admin.statusScheduled'), completed: t('admin.statusCompleted'), cancelled: t('admin.statusCancelled') } as any)[lesson.status] || lesson.status
                    )}
                  </Badge>
                  <LessonStatusDropdown
                    lesson={lesson}
                    onStatusChange={handleStatusChange}
                    onEdit={(l) => setEditLesson(l)}
                    onDelete={(l) => setDeleteLesson(l)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditLessonQuickModal
        open={!!editLesson}
        onOpenChange={(o) => { if (!o) setEditLesson(null); }}
        lesson={editLesson}
      />

      <AlertDialog open={!!deleteLesson} onOpenChange={(o) => { if (!o) setDeleteLesson(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.deleteThisLesson')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteLessonWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? t('admin.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminDashboard() {
  const { profile, signOut, user, hasPermission, effectiveIsAdmin, effectiveCoachId, previewCoachLabel } = useAuth();
  const isAdmin = effectiveIsAdmin;
  void user;
  const canProZone = isAdmin || hasPermission('pro_zone');
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [studentSort, setStudentSort] = useState<'alpha' | 'package' | 'recent'>('recent');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsExpanded, setStudentsExpanded] = useState(false);
  // DISEÑO ANTERIOR — conservado por si Santiago quiere regresar (rediseño Home Coach, 27 nov 2026).
  // El botón + de la tarjeta Horario Recurrente (stat grid) era el único que abría este modal.
  // const [addToRecurringOpen, setAddToRecurringOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Refresh ALL cached coach data: today's lessons, calendar, students, stats.
  const handleManualRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    const start = Date.now();
    try {
      await queryClient.invalidateQueries({ refetchType: 'all' });
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      toast.success(t('dashboard.dashboardUpdated') ?? 'Dashboard updated');
    } catch (e: any) {
      toast.error(e?.message || (t('dashboard.couldNotRefresh') ?? 'Could not refresh'));
    } finally {
      setManualRefreshing(false);
    }
  };

  const { data: students = [], refetch: refetchStudents } = useQuery({
    queryKey: ['all-students', isDemoModeActive() ? 'demo' : 'live', isAdmin ? 'all' : `coach:${effectiveCoachId ?? 'none'}`],
    queryFn: async () => {
      if (isDemoModeActive()) return demoStudents as any[];
      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'student');
      if (rolesError) return [];
      let studentIds = (roleRows || []).map((row: any) => row.user_id);
      // Non-admin coaches only see students actually assigned to them.
      if (!isAdmin) {
        if (!effectiveCoachId) return [];
        const { data: assigned, error: assignedErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('assigned_coach_id', effectiveCoachId)
          .in('id', studentIds);
        if (assignedErr) return [];
        studentIds = (assigned || []).map((r: any) => r.id);
      }
      if (studentIds.length === 0) return [];
      const [profilesRes, packagesRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', studentIds).order('created_at', { ascending: false }),
        supabase.from('class_packages').select('user_id, classes_remaining, package_size, is_active, created_at').in('user_id', studentIds),
      ]);
      if (profilesRes.error) return [];
      const activePkgByUser: Record<string, any> = {};
      packagesRes.data?.forEach((p: any) => {
        if ((p.classes_remaining ?? 0) > 0) {
          const existing = activePkgByUser[p.user_id];
          if (!existing || new Date(p.created_at).getTime() < new Date(existing.created_at).getTime()) {
            activePkgByUser[p.user_id] = p;
          }
        }
      });
      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        activePackageRemaining: activePkgByUser[p.id]?.classes_remaining ?? null,
        activePackageSize: activePkgByUser[p.id]?.package_size ?? null,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('student-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refetchStudents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => refetchStudents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_packages' }, () => refetchStudents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchStudents]);

  const { data: stats } = useQuery({
    queryKey: ['admin-stats', isDemoModeActive() ? 'demo' : 'live', isAdmin ? 'all' : `coach:${effectiveCoachId ?? 'none'}`, students.length],
    queryFn: async () => {
      if (isDemoModeActive()) {
        return {
          totalLessons: 487,
          completedThisMonth: 42,
          scheduledThisMonth: 28,
          monthlyRevenue: DEMO_REVENUE_SUMMARY.mtd,
          totalStudents: demoStudents.length,
          activeSubscribers: demoSubscriptions.length,
          recurringSlots: demoRecurringSlots.length,
          // Rediseño Home Coach (27 nov 2026): alumnos con paquete = alumnos
          // demo con clases restantes en su paquete; con horario recurrente =
          // alumnos distintos con al menos un slot recurrente demo activo.
          studentsWithPackage: demoStudents.filter((s: any) => (s.activePackageRemaining ?? 0) > 0).length,
          studentsWithRecurring: new Set(demoRecurringSlots.map((s: any) => s.student_id)).size,
          proZoneMediaCount: 24,
          pendingAnalysisCount: 3,
          upcomingLessonsCount: 28,
        };
      }
      // Non-owner coach: scope recurring slots to their own students and
      // skip owner-wide metrics (subscribers/revenue/etc are hidden from their
      // dashboard anyway).
      if (!isAdmin) {
        const scopedIds = (students || []).map((s: any) => s.id);
        let recurringCount = 0;
        let studentsWithRecurring = 0;
        if (scopedIds.length > 0) {
          const { data: recurringRows } = await supabase
            .from('recurring_lesson_slots')
            .select('student_id')
            .eq('is_active', true)
            .in('student_id', scopedIds);
          recurringCount = (recurringRows || []).length;
          studentsWithRecurring = new Set((recurringRows || []).map((r: any) => r.student_id)).size;
        }
        return {
          totalLessons: 0,
          completedThisMonth: 0,
          scheduledThisMonth: 0,
          monthlyRevenue: 0,
          totalStudents: students.length,
          activeSubscribers: 0,
          recurringSlots: recurringCount,
          // Rediseño Home Coach (27 nov 2026): con paquete = alumnos del
          // coach con paquete activo (clases restantes > 0, misma definición
          // que la lista de alumnos); con horario recurrente = alumnos
          // distintos con al menos un slot recurrente activo.
          studentsWithPackage: (students || []).filter((s: any) => s.activePackageRemaining != null).length,
          studentsWithRecurring,
          proZoneMediaCount: 0,
          pendingAnalysisCount: 0,
          upcomingLessonsCount: 0,
        };
      }
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      const { count: totalLessons } = await supabase.from('lessons').select('*', { count: 'exact', head: true }).in('status', ['completed', 'no_show']);

      // Completed this month
      const { count: completedThisMonth } = await supabase.from('lessons').select('*', { count: 'exact', head: true })
        .in('status', ['completed', 'no_show'])
        .gte('lesson_date', monthStart)
        .lte('lesson_date', monthEnd);

      // Scheduled this month (status=scheduled, today→end of month)
      const { count: scheduledThisMonth } = await supabase.from('lessons').select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('lesson_date', todayStr)
        .lte('lesson_date', monthEnd);

      // Pull the SAME raw datasets the /admin/revenue page uses so the
      // dashboard MTD always matches the Revenue page exactly.
      const [{ data: lessonRevData }, { data: pkgPayData }, { data: manualPayData }, { data: stripePayData }] =
        await Promise.all([
          supabase
            .from('lessons')
            .select('lesson_date, revenue, status, package_id, imported, payment_method, student_id')
            .gt('revenue', 0),
          supabase.from('package_payments').select('amount, payment_date'),
          supabase.from('payments').select('amount, payment_date, student_id'),
          supabase
            .from('stripe_payments')
            .select(
              'amount, paid_at, created_at, reporting_category, status, refund_amount, is_archived, is_golf_revenue, classification, classification_confidence, admin_override, product_name, purchase_type, student_name, student_matched, student_id',
            ),
        ]);
      const monthlyRevenue = computeMtdRevenue({
        lessons: (lessonRevData || []) as any,
        packagePayments: (pkgPayData || []) as any,
        manualPayments: (manualPayData || []) as any,
        stripePayments: stripePayData || [],
      });

      let activeSubscribers: number | null = 0;
      if (isAdmin) {
        ({ count: activeSubscribers } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('is_active', true));
      } else {
        const ids = students.map((s: any) => s.id);
        if (ids.length) ({ count: activeSubscribers } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('is_active', true).in('student_id', ids));
      }

      const { count: recurringSlots } = await supabase.from('recurring_lesson_slots').select('*', { count: 'exact', head: true }).eq('is_active', true);

      // Rediseño Home Coach (27 nov 2026): alumnos distintos con al menos
      // un slot recurrente activo (no el número de slots).
      const { data: recurringStudentRows } = await supabase
        .from('recurring_lesson_slots')
        .select('student_id')
        .eq('is_active', true);
      const studentsWithRecurring = new Set((recurringStudentRows || []).map((r: any) => r.student_id)).size;

      const { count: proZoneMediaCount } = await supabase
        .from('pro_zone_media')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Pending swing analysis requests (not yet delivered)
      const { count: pendingAnalysisCount } = await supabase
        .from('analysis_requests')
        .select('*', { count: 'exact', head: true })
        .neq('delivery_status', 'delivered');

      // Upcoming scheduled lessons (today onward)
      const { count: upcomingLessonsCount } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('lesson_date', todayStr);

      return {
        totalLessons: totalLessons || 0,
        completedThisMonth: completedThisMonth || 0,
        scheduledThisMonth: scheduledThisMonth || 0,
        monthlyRevenue,
        totalStudents: students.length,
        activeSubscribers: activeSubscribers || 0,
        recurringSlots: recurringSlots || 0,
        // Con paquete = alumnos con paquete activo (clases restantes > 0,
        // misma definición que la lista de alumnos de esta página).
        studentsWithPackage: students.filter((s: any) => s.activePackageRemaining != null).length,
        studentsWithRecurring,
        proZoneMediaCount: proZoneMediaCount || 0,
        pendingAnalysisCount: pendingAnalysisCount || 0,
        upcomingLessonsCount: upcomingLessonsCount || 0,
      };
    },
    enabled: isAdmin || students.length >= 0,
  });

  /* DISEÑO ANTERIOR — conservado por si Santiago quiere regresar (rediseño Home Coach, 27 nov 2026).
     Para restaurar: descomentar este array `statCards` y el bloque del stat grid en el JSX de abajo,
     y quitar la tarjeta Suscriptores nueva.
  // Per-card accent tints (cardBg = subtle gradient overlay, iconBg = solid icon chip,
  // iconColor = icon glyph color). Glassmorphism preserved via `glass-card`.
  const statCards = [
    {
      label: t('admin.statTotalStudents'), value: stats?.totalStudents || 0, icon: Users, link: '/admin/students',
      iconBg: 'rgba(74,124,89,0.22)', iconColor: '#7FB88E',
      cardBg: 'linear-gradient(135deg, rgba(74,124,89,0.14) 0%, rgba(74,124,89,0.04) 100%)',
      borderColor: 'rgba(74,124,89,0.28)',
    },
    {
      label: t('admin.statSubscribers'), value: stats?.activeSubscribers || 0, icon: TrendingUp, link: '/admin/subscribers',
      iconBg: 'rgba(139,92,246,0.22)', iconColor: '#B89DF5',
      cardBg: 'linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(139,92,246,0.04) 100%)',
      borderColor: 'rgba(139,92,246,0.28)',
    },
    {
      label: t('admin.statRevenueMtd'), value: fmtMXN(stats?.monthlyRevenue || 0), icon: DollarSign, link: '/admin/revenue',
      iconBg: 'rgba(240,192,64,0.22)', iconColor: '#F0C040',
      cardBg: 'linear-gradient(135deg, rgba(240,192,64,0.14) 0%, rgba(240,192,64,0.04) 100%)',
      borderColor: 'rgba(240,192,64,0.28)',
    },
  ];
  */

  // Suscriptores card cells (rediseño Home Coach, 27 nov 2026): reemplazan el
  // stat grid de Números. Valores en vivo de la consulta admin-stats; los
  // porcentajes son sobre el total de alumnos.
  const totalStudentsCount = stats?.totalStudents || 0;
  const pctOfTotal = (n: number) => (totalStudentsCount > 0 ? Math.round((100 * n) / totalStudentsCount) : 0);
  const subscriberCells = [
    {
      label: t('admin.statTotalStudents'), value: String(totalStudentsCount), sub: t('admin.allSubscribersSub'),
      icon: Users, link: '/admin/students',
      iconBg: 'rgba(74,124,89,0.22)', iconColor: '#7FB88E', large: false,
    },
    {
      label: t('admin.studentsWithPackage'), value: String(stats?.studentsWithPackage || 0),
      sub: `${pctOfTotal(stats?.studentsWithPackage || 0)}% ${t('admin.ofTotal')} · ${t('admin.withClassesAvailable')}`,
      icon: GraduationCap, link: '/admin/students',
      iconBg: 'rgba(139,92,246,0.22)', iconColor: '#B89DF5', large: false,
    },
    {
      label: t('admin.studentsRecurring'), value: String(stats?.studentsWithRecurring || 0),
      sub: `${pctOfTotal(stats?.studentsWithRecurring || 0)}% ${t('admin.ofTotal')} · ${t('admin.comeEveryWeekFixed')}`,
      icon: Repeat, link: '/admin/lessons?section=recurring',
      iconBg: 'rgba(96,165,250,0.22)', iconColor: '#7FB8F5', large: false,
    },
    {
      label: t('admin.monthRevenue'), value: fmtMXN(stats?.monthlyRevenue || 0), sub: t('admin.collectedThisMonth'),
      icon: DollarSign, link: '/admin/revenue',
      iconBg: 'rgba(240,192,64,0.22)', iconColor: '#F0C040', large: true,
    },
  ];

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="app-bg min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <Link to="/admin" aria-label={t('nav.dashboard')} className="flex items-center gap-2 min-w-0">
            <ApexBrand size="md" taglineHiddenOnMobile />
          </Link>
          <div data-tour="coach-nav" className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={manualRefreshing}
              aria-label={t('coachUi.refreshDashboard')}
              className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              <RefreshCw className={`h-4 w-4 text-ivory ${manualRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <GlobalSearch />
            <NotificationBell />
            <LanguageToggle variant="header" />
            <CoachAvatarMenu />
            <MobileMenu isCoach={true} onSignOut={signOut} currentView="coach" />
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-5 max-w-3xl mx-auto pb-mobile-safe">
        {/* Greeting — kept out of the sticky header so it can never overlap the nav */}
        <div>
          <p style={{ color: '#4a7c59', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('admin.coachPortal')}
          </p>
          <h1 className="font-heading" style={{ color: '#F5F0E8', fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginTop: 2 }}>
            {t('admin.welcome')}, {(previewCoachLabel || profile?.full_name)?.split(' ')[0] || t('admin.coachFallback')}!
          </h1>
        </div>

        {/* Today's Schedule — compact */}
        <TodaySchedule />

        {/* DISEÑO ANTERIOR — conservado por si Santiago quiere regresar (rediseño Home Coach, 27 nov 2026).
            Stat grid de Números (tarjetas Alumnos Totales / Suscriptores / Ingresos MTD + tarjeta Horario Recurrente).
            Para restaurar: quitar esta apertura y el cierre de abajo, descomentar el array `statCards`,
            y quitar la tarjeta Suscriptores nueva.
        <div data-tour="stat-grid" className="flex sm:grid sm:grid-cols-2 gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]">
          {statCards.map((s) => {
            const isRevenue = s.label === t('admin.statRevenueMtd');
            return (
            <Link key={s.label} to={(s as any).link} className="block shrink-0 w-[44%] sm:w-auto snap-start">
              <div
                className="glass-card p-4 hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer h-full min-h-[92px]"
                style={{ background: s.cardBg, border: `1px solid ${s.borderColor}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate"
                      style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                      {s.label}
                    </p>
                    <p
                      style={{
                        color: '#F5F0E8',
                        fontSize: isRevenue ? 20 : 26,
                        fontWeight: 700,
                        marginTop: isRevenue ? 12 : 4,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'clip',
                      }}
                    >
                      {s.value}
                    </p>
                  </div>
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: s.iconBg }}
                  >
                    <s.icon className="h-5 w-5" style={{ color: s.iconColor }} />
                  </div>
                </div>
              </div>
            </Link>
            );
          })}

          Recurring Schedule — same-size stat card with embedded Add / Reassign actions (línea dentro del comentario DISEÑO ANTERIOR; al restaurar, volver a envolverla en un comentario JSX)
          <Link to="/admin/lessons?section=recurring" className="block h-full shrink-0 w-[44%] sm:w-auto snap-start">
            <div
              data-tour="recurring-card"
              className="glass-card p-4 h-full min-h-[92px] flex flex-col"
              style={{
                background: 'linear-gradient(135deg, rgba(240,192,64,0.14) 0%, rgba(240,192,64,0.04) 100%)',
                border: '1px solid rgba(240,192,64,0.28)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate"
                    style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {t('admin.statRecurringSchedule')}
                  </p>
                  <p style={{ color: '#F5F0E8', fontSize: 26, fontWeight: 700, marginTop: 4, lineHeight: 1.1 }}>
                    {stats?.recurringSlots || 0}
                  </p>
                </div>
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(240,192,64,0.22)' }}
                >
                  <Repeat className="h-5 w-5" style={{ color: '#F0C040' }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAddToRecurringOpen(true);
                  }}
                  aria-label={t('coachUi.addToRecurringSchedule')}
                  title={t('coachUi.addToRecurringSchedule')}
                  className="h-7 w-7 p-0 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Link>
        </div>
        */}

        {/* Suscriptores — rediseño Home Coach (27 nov 2026): reemplaza el stat grid de Números.
            4 datos en vivo: total de alumnos · con paquete · con horario recurrente · ingresos del mes.
            En teléfono se ve en 2×2, sin deslizar (como en la maqueta aprobada). */}
        <div data-tour="subscribers-card" className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: '#4a7c59' }}>
                <Users className="h-4 w-4" style={{ color: '#F5F0E8' }} />
              </div>
              <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>{t('admin.statSubscribers')}</h3>
            </div>
            <Link to="/admin/students" className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#E8D5B0', opacity: 0.7 }}>
              {t('admin.viewStudents')}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {subscriberCells.map((c) => {
              const CellIcon = c.icon;
              return (
                <Link
                  key={c.label}
                  to={c.link}
                  className="block rounded-xl p-3 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      style={{
                        color: '#F5F0E8',
                        fontSize: c.large ? 18 : 24,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.value}
                    </p>
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: c.iconBg }}>
                      <CellIcon className="h-4 w-4" style={{ color: c.iconColor }} />
                    </div>
                  </div>
                  <p className="mt-1.5" style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                    {c.label}
                  </p>
                  <p className="mt-0.5" style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11, lineHeight: 1.35 }}>
                    {c.sub}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Hero — live week-grid Calendar (single source of truth) */}
        <DashboardCalendarHero />

        {/* Quick access grid */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/admin/lessons" className="glass-card pro-zone-tile p-3 flex flex-col gap-2 min-h-[92px] hover:scale-[1.02] active:scale-[0.98] transition-transform">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.2)' }}>
              <CalendarCheck className="h-4 w-4" style={{ color: '#60a5fa' }} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate" style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{t('admin.manageLessons')}</h3>
              <p className="truncate" style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 11 }}>{stats?.upcomingLessonsCount || 0} {t('admin.upcomingTapToManage')}</p>
            </div>
          </Link>
          <Link to="/admin/analysis-requests" className="glass-card pro-zone-tile p-3 flex flex-col gap-2 min-h-[92px] hover:scale-[1.02] active:scale-[0.98] transition-transform">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.2)' }}>
              <Video className="h-4 w-4" style={{ color: '#a78bfa' }} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate" style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{t('admin.swingAnalysisRequests')}</h3>
              <p className="truncate" style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 11 }}>{stats?.pendingAnalysisCount || 0} {t('admin.pendingTapToReview')}</p>
            </div>
          </Link>
          {canProZone && (
          <Link to="/admin/pro-zone" className="glass-card pro-zone-tile p-3 flex flex-col gap-2 min-h-[92px] hover:scale-[1.02] active:scale-[0.98] transition-transform">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.2)' }}>
              <Sparkles className="h-4 w-4" style={{ color: '#F0C040' }} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate" style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{t('admin.proZoneLibrary')}</h3>
              <p className="truncate" style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 11 }}>{stats?.proZoneMediaCount || 0} {t('admin.itemsTapToManage')}</p>
            </div>
          </Link>
          )}
          <Link to="/admin/family" className="glass-card pro-zone-tile p-3 flex flex-col gap-2 min-h-[92px] hover:scale-[1.02] active:scale-[0.98] transition-transform">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.2)' }}>
              <Users className="h-4 w-4" style={{ color: '#F0C040' }} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate" style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{t('admin.familyView')}</h3>
              <p className="truncate" style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 11 }}>{t('admin.familyViewSubtitle')}</p>
            </div>
          </Link>
        </div>

        {/* Manage Students */}
        <div className="glass-card overflow-hidden">
          <div
            className="p-5 flex items-center justify-between cursor-pointer group"
            style={{ borderBottom: studentsExpanded ? '1px solid rgba(255,255,255,0.1)' : 'none' }}
            onClick={() => setStudentsExpanded(v => !v)}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: '#4a7c59' }}>
                <Users className="h-5 w-5" style={{ color: '#F5F0E8' }} />
              </div>
              <div>
                <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>{t('admin.manageStudents')}</h3>
                <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{students.length} {t('admin.manageStudentsSubTotal')} · {studentsExpanded ? t('admin.tapToCollapse') : t('admin.tapToExpand')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); navigate('/admin/students'); }}
                className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ color: '#E8D5B0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {t('admin.viewAll')}
              </button>
              <ChevronRight
                className="h-5 w-5 transition-transform"
                style={{ color: '#E8D5B0', opacity: 0.6, transform: studentsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              />
            </div>
          </div>

          {/* Always-visible quick search */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: studentsExpanded ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#E8D5B0', opacity: 0.5 }} />
              <input
                type="text"
                placeholder={t('admin.quickSearchStudents')}
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  if (e.target.value.trim() && !studentsExpanded) setStudentsExpanded(true);
                }}
                className="w-full h-10 pl-9 pr-3 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E8', fontSize: 13 }}
              />
            </div>
          </div>

          {studentsExpanded && (
            <>
              {/* Sort */}
              <div className="px-4 pt-3 flex gap-2 justify-end">
                <Select value={studentSort} onValueChange={(v) => setStudentSort(v as any)}>
                  <SelectTrigger className="w-[120px] h-9 glass-input text-xs" style={{ fontSize: 12 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
                    <SelectItem value="alpha" style={{ color: '#F5F0E8' }}>{t('admin.sortAlpha')}</SelectItem>
                    <SelectItem value="package" style={{ color: '#F5F0E8' }}>{t('admin.sortPackage')}</SelectItem>
                    <SelectItem value="recent" style={{ color: '#F5F0E8' }}>{t('admin.sortRecent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-4 space-y-2">
                {[...students]
                  .filter((s: any) => {
                    if (!studentSearch.trim()) return true;
                    const q = studentSearch.toLowerCase();
                    return (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
                  })
                  .sort((a: any, b: any) => {
                    if (studentSort === 'alpha') return (a.full_name || a.email || '').toLowerCase().localeCompare((b.full_name || b.email || '').toLowerCase());
                    if (studentSort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    const pA = a.activePackageRemaining;
                    const pB = b.activePackageRemaining;
                    if (pA === null && pB === null) return 0;
                    if (pA === null) return 1;
                    if (pB === null) return -1;
                    return pA - pB;
                  })
                  .map((student: any) => (
                    <Link
                      key={student.id}
                      to={`/admin/student/${student.id}`}
                      className="flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.01]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                          {student.full_name?.charAt(0) || student.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 14 }}>{student.full_name || t('admin.noNameSet')}</p>
                          <p style={{ color: '#F5F0E8', opacity: 0.6, fontSize: 12 }}>{student.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <span style={{ background: student.activePackageRemaining !== null ? 'rgba(74,124,89,0.2)' : 'rgba(255,255,255,0.06)', color: student.activePackageRemaining !== null ? '#4a7c59' : '#E8D5B0', fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500 }}>
                          {student.activePackageRemaining !== null ? `Pkg: ${student.activePackageSize - student.activePackageRemaining}/${student.activePackageSize}` : t('admin.noPkg')}
                        </span>
                        {(() => {
                          // Effective plan: manual override (if valid) > plan_tier > 'free'
                          const overrideExpiresAt = student.override_expires_at ? new Date(student.override_expires_at) : null;
                          const overrideValid = student.manual_plan_override && (!overrideExpiresAt || overrideExpiresAt > new Date());
                          const tier = overrideValid ? student.manual_plan_override : student.plan_tier;
                          const isApex = tier === 'apex';
                          const isPro = tier === 'pro';
                          const isScratch = tier === 'scratch';
                          const bg = isApex ? '#D9AA42' : isPro ? '#F0C040' : isScratch ? '#4a7c59' : 'rgba(245,240,232,0.12)';
                          const color = isApex || isPro ? '#000000' : isScratch ? '#FFFFFF' : 'rgba(245,240,232,0.85)';
                          const label = isApex ? 'Apex' : isPro ? 'Pro' : isScratch ? 'Scratch' : 'Free';
                          return (
                            <span style={{ background: bg, color, fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                              {label}{overrideValid ? ' *' : ''}
                            </span>
                          );
                        })()}
                      </div>
                    </Link>
                  ))}
                {students.length === 0 && !studentSearch && (
                  <div className="text-center py-10">
                    <Users className="h-12 w-12 mx-auto mb-3" style={{ color: '#E8D5B0', opacity: 0.3 }} />
                    <p style={{ color: '#E8D5B0', opacity: 0.5 }}>{t('admin.noStudentsYet')}</p>
                  </div>
                )}
                {students.length > 0 && studentSearch && (() => {
                  const q = studentSearch.toLowerCase();
                  const hasResults = students.some((s: any) => (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
                  return !hasResults ? (
                    <div className="text-center py-8">
                      <Search className="h-10 w-10 mx-auto mb-2" style={{ color: '#E8D5B0', opacity: 0.3 }} />
                      <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 13 }}>{t('admin.noStudentsFound')}</p>
                    </div>
                  ) : null;
                })()}
              </div>
            </>
          )}
        </div>


      </main>

      {/* DISEÑO ANTERIOR — conservado por si Santiago quiere regresar (rediseño Home Coach, 27 nov 2026).
      <AddToRecurringScheduleModal
        open={addToRecurringOpen}
        onOpenChange={setAddToRecurringOpen}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
        }}
      />
      */}

      <SocialFooter />
    </div>
  );
}
