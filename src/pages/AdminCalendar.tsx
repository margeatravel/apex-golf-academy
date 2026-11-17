import { deleteRecurringOccurrence } from '@/lib/materializeRecurringLesson';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, ArrowLeft, CalendarDays, Loader2, RefreshCw, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

import { CalendarLegend } from '@/components/calendar/CalendarLegend';
import { SlotTile } from '@/components/calendar/SlotTile';
import { SlotActionSheet } from '@/components/calendar/SlotActionSheet';
import { MonthCalendarView } from '@/components/calendar/MonthCalendarView';
import {
  WEEKDAYS_SHORT,
  mondayWeek,
  toISODate,
  SlotItem,
} from '@/components/calendar/calendarTypes';
import { useCalendarWeek } from '@/components/calendar/useCalendarWeek';

import { SkipWeekModal } from '@/components/SkipWeekModal';
import { AddOpenSpotModal } from '@/components/AddOpenSpotModal';
import { EditOpenSpotModal } from '@/components/EditOpenSpotModal';
import { EditRecurringSlotModal } from '@/components/EditRecurringSlotModal';
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';
import { BookOneTimeLessonModal } from '@/components/BookOneTimeLessonModal';

/**
 * /admin/calendar — the master hub for everything that touches Coach Santi's
 * weekly availability. The Calendar is now the single source of truth for:
 *
 *  • Fixed-schedule (recurring) lessons
 *  • One-time bookings
 *  • Open spots students can claim/book
 *  • Skipped occurrences
 *  • Coach blocks
 *
 * Everything the student booking flow shows is sourced from the same data,
 * so changes here propagate immediately to /book.
 */
export default function AdminCalendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();

  // View mode toggle (Week / Month)
  const [view, setView] = useState<'week' | 'month'>('week');

  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const week = useMemo(() => mondayWeek(anchor), [anchor]);
  const { data: byDate = {}, isLoading, refetch, isFetching } = useCalendarWeek(week);

  // ── action sheet + modals
  const [actionSlot, setActionSlot] = useState<SlotItem | null>(null);
  const [actionEmpty, setActionEmpty] = useState<{ date: string } | null>(null);
  const sheetOpen = !!actionSlot || !!actionEmpty;

  const [skipSlot, setSkipSlot] = useState<any | null>(null);
  const [skipStudentProfile, setSkipStudentProfile] =
    useState<{ full_name?: string | null; email?: string | null } | null>(null);
  const [addOpenSpotDay, setAddOpenSpotDay] = useState<number | null>(null);
  const [addOpenSpotDate, setAddOpenSpotDate] = useState<string | null>(null);
  const [editOpenSpot, setEditOpenSpot] = useState<any | null>(null);
  const [assignOpenSpot, setAssignOpenSpot] = useState<any | null>(null);
  const [editRecurring, setEditRecurring] = useState<any | null>(null);
  const [editLesson, setEditLesson] = useState<any | null>(null);
  const [oneTimePrefill, setOneTimePrefill] = useState<{ date: string; time: string } | null>(null);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['master-calendar-week'] });
    qc.invalidateQueries({ queryKey: ['admin-all-recurring-slots'] });
    qc.invalidateQueries({ queryKey: ['admin-open-priority-spots'] });
    qc.invalidateQueries({ queryKey: ['admin-all-lessons'] });
    qc.invalidateQueries({ queryKey: ['available-slots'] });
    refetch();
  };

  const weekLabel = useMemo(() => {
    const start = week[0];
    const end = week[6];
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.toLocaleDateString('en-US', opts)} – ${end.getDate()}, ${end.getFullYear()}`
      : `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`;
  }, [week]);

  const todayIso = toISODate(new Date());

  // ── action handlers
  const handleOpenSlot = (slot: SlotItem) => {
    setActionEmpty(null);
    setActionSlot(slot);
  };
  const handleEmptyCell = (date: string) => {
    setActionSlot(null);
    setActionEmpty({ date });
  };

  const handleSkipFromAction = (slot: SlotItem) => {
    if (!slot.recurring_slot_id) {
      toast.error(t('coachUi.skipOnlyRecurringSlots'));
      return;
    }
    const r = slot.raw?.recurring;
    setSkipStudentProfile({
      full_name: slot.student_name ?? null,
      email: slot.raw?.lesson?.invitee_email ?? null,
    });
    setSkipSlot({
      id: slot.recurring_slot_id,
      student_id: slot.student_id ?? r?.student_id,
      weekday: r?.weekday ?? new Date(slot.date + 'T12:00:00').getDay(),
      start_time: r?.start_time ?? slot.start_time,
      duration_minutes: r?.duration_minutes ?? slot.duration_minutes,
      lesson_type: r?.lesson_type ?? slot.lesson_type,
      package_id: r?.package_id ?? null,
    });
  };

  const handleEditOpenFromAction = (slot: SlotItem) => {
    setEditOpenSpot(slot.raw?.open ?? null);
  };
  const handleEditRecurringFromAction = (slot: SlotItem) => {
    setEditRecurring(slot.raw?.recurring ?? null);
  };
  const handleEditLessonFromAction = (slot: SlotItem) => {
    if (slot.raw?.lesson) {
      setEditLesson(slot.raw.lesson);
    }
  };

  const handleAddOpenSpotFromCell = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d, 12, 0, 0).getDay();
    // Opened from a specific calendar cell → default to the one-time modality.
    setAddOpenSpotDate(date);
    setAddOpenSpotDay(dow);
  };

  const handleAddBlockFromCell = (date: string) => {
    // Defer to the dedicated availability page (already manages blocks).
    navigate(`/admin/availability?date=${date}`);
  };

  const handleAssignOpenToStudent = (slot: SlotItem) => {
    const open = slot.raw?.open;
    if (!open) {
      // Projected recurring tile with no backing open-spot row — fall back
      // to a one-time booking prefill so the time stays usable.
      if (slot.raw?.recurring) {
        setOneTimePrefill({ date: slot.date, time: slot.start_time });
        return;
      }
      toast.error(t('coachUi.slotNoLongerAvailable'));
      return;
    }
    setAssignOpenSpot(open);
  };

  const handleConvertOpenToOneTime = (slot: SlotItem) => {
    setOneTimePrefill({ date: slot.date, time: slot.start_time });
  };

  const handleDeleteRecurring = async (slot: SlotItem) => {
    if (!slot.recurring_slot_id) return;
    if (!confirm(t('coachUi.removeRecurringConfirm'))) return;
    const { error } = await supabase
      .from('recurring_lesson_slots')
      .update({ is_active: false })
      .eq('id', slot.recurring_slot_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Also delete future scheduled lessons tied to this recurring slot
    const todayIsoStr = toISODate(new Date());
    await supabase
      .from('lessons')
      .delete()
      .eq('recurring_slot_id', slot.recurring_slot_id)
      .eq('status', 'scheduled')
      .gte('lesson_date', todayIsoStr);
    toast.success(t('coachUi.recurringRemoved'));
    refreshAll();
  };

  const handleDeleteOpenSpot = async (slot: SlotItem) => {
    if (!user?.id) {
      toast.error(t('coachUi.signInRequired'));
      return;
    }
    const openId = slot.raw?.open?.id;
    const recurringId = slot.raw?.recurring?.id;

    if (openId) {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .delete()
        .eq('id', openId)
        .eq('coach_id', user.id)
        .select('id');
      if (error) return toast.error(error.message);
      if (!data?.length) {
        refreshAll();
        return toast.error(t('coachUi.openSpotOtherCoach'));
      }
    } else if (recurringId) {
      const { data, error } = await supabase
        .from('recurring_lesson_slots')
        .delete()
        .eq('id', recurringId)
        .eq('coach_id', user.id)
        .select('id');
      if (error) return toast.error(error.message);
      if (!data?.length) {
        refreshAll();
        return toast.error(t('coachUi.openSpotOtherCoach'));
      }
    } else {
      return toast.error(t('coachUi.couldNotFindSpotId'));
    }

    toast.success(t('coachUi.openSpotRemoved'));
    refreshAll();
  };

  const handleDeleteLesson = async (slot: SlotItem) => {
    const lessonId = slot.lesson_id;
    const recId = slot.recurring_slot_id ?? (slot.raw as any)?.lesson?.recurring_slot_id ?? null;
    if (!lessonId && !recId) return;
    if (!confirm(t('coachUi.deleteLessonConfirm'))) return;
    const { error } = recId
      ? await deleteRecurringOccurrence({ ...slot, recurring_slot_id: recId, coach_id: (slot.raw as any)?.recurring?.coach_id ?? null })
      : await supabase.from('lessons').delete().eq('id', lessonId!);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('coachUi.lessonDeleted'));
    refreshAll();
  };

  return (
    <div className="app-bg min-h-screen">
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 max-w-6xl mx-auto">
          <Link to="/admin" className="inline-flex items-center gap-2 text-[#F5F0E8]/80 hover:text-[#F5F0E8]">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">{t('coachUi.dashboard')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#F0C040]" />
            <h1 className="font-heading text-lg sm:text-xl text-[#F5F0E8] font-semibold">{t('coachUi.calendar')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Week / Month toggle */}
            <div
              role="tablist"
              aria-label={t('coachUi.calendarView')}
              className="inline-flex rounded-lg p-0.5"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {(['week', 'month'] as const).map((v) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(v)}
                    className="px-3 h-7 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all"
                    style={{
                      background: active ? '#4a7c59' : 'transparent',
                      color: active ? '#F5F0E8' : 'rgba(245,240,232,0.7)',
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshAll()}
              className="h-8"
              title={t('coachUi.refresh')}
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <GlobalSearch />
            <LanguageToggle variant="header" />
          </div>
        </div>
      </header>

      <main className="px-4 py-5 space-y-5 max-w-6xl mx-auto">
        {/* Legend (shared) */}
        <div className="glass-card p-3" style={{ background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.12)' }}>
          <CalendarLegend />
        </div>

        {view === 'month' ? (
          <MonthCalendarView
            anchor={anchor}
            onAnchorChange={setAnchor}
            onSelectDay={(d) => {
              setAnchor(d);
              setView('week');
            }}
          />
        ) : (
          <>
        {/* Week nav */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() - 7);
                setAnchor(d);
              }}
              className="h-9 w-9 p-0"
              title={t('coachUi.previousWeek')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                setAnchor(d);
              }}
              className="h-9 px-3 text-xs"
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() + 7);
                setAnchor(d);
              }}
              className="h-9 w-9 p-0"
              title={t('coachUi.nextWeek')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-sm text-[#F5F0E8]/85 font-medium">{weekLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => {
                // Default to today's weekday
                { setAddOpenSpotDate(null); setAddOpenSpotDay(new Date().getDay()); };
              }}
              className="h-9 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add open spot
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/admin/availability')}
              className="h-9 border-red-500/30 text-red-300 hover:bg-red-500/10"
            >
              <Ban className="h-3.5 w-3.5 mr-1" /> Block time
            </Button>
          </div>
        </div>

        {/* Week grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#F5F0E8]/70 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading calendar…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
            {week.map((d) => {
              const iso = toISODate(d);
              const slots = byDate[iso] || [];
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  className="rounded-lg p-2 min-h-[180px] flex flex-col"
                  style={{
                    background: isToday ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.04)',
                    border: isToday ? '1px solid rgba(240,192,64,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div
                        className="text-[10px] uppercase tracking-wider font-semibold"
                        style={{ color: isToday ? '#F0C040' : '#F5F0E8', opacity: isToday ? 1 : 0.65 }}
                      >
                        {WEEKDAYS_SHORT[d.getDay()]}
                      </div>
                      <div className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>
                        {d.getDate()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEmptyCell(iso)}
                      className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                      title={t('coachUi.addToThisDay')}
                      style={{ color: '#F5F0E8', opacity: 0.6 }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5 flex-1">
                    {slots.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleEmptyCell(iso)}
                        className="w-full text-[11px] text-[#F5F0E8]/45 hover:text-[#F5F0E8]/80 hover:bg-white/5 rounded py-3 transition-colors"
                      >
                        + Tap to add
                      </button>
                    ) : (
                      slots.map((s) => (
                        <SlotTile key={s.id} slot={s} onClick={handleOpenSlot} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </main>

      {/* Universal slot/empty action sheet */}
      <SlotActionSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) {
            setActionSlot(null);
            setActionEmpty(null);
          }
        }}
        slot={actionSlot}
        emptyCell={actionEmpty}
        onSkipWeek={handleSkipFromAction}
        onEditLesson={handleEditLessonFromAction}
        onEditRecurring={handleEditRecurringFromAction}
        onEditOpenSpot={handleEditOpenFromAction}
        onAddOpenSpot={handleAddOpenSpotFromCell}
        onAddBlock={handleAddBlockFromCell}
        onAssignToStudent={handleAssignOpenToStudent}
        onConvertOpenToOneTime={handleConvertOpenToOneTime}
        onDeleteRecurring={handleDeleteRecurring}
        onDeleteOpenSpot={handleDeleteOpenSpot}
        onDeleteLesson={handleDeleteLesson}
      />

      {/* Skip Week */}
      <SkipWeekModal
        open={!!skipSlot}
        onOpenChange={(v) => {
          if (!v) {
            setSkipSlot(null);
            setSkipStudentProfile(null);
          }
        }}
        slot={skipSlot}
        studentProfile={skipStudentProfile}
        onChanged={refreshAll}
        defaultDate={actionSlot?.date ?? null}
      />

      {/* Add Open Spot */}
      <AddOpenSpotModal
        open={addOpenSpotDay !== null}
        onOpenChange={(v) => { if (!v) { setAddOpenSpotDay(null); setAddOpenSpotDate(null); } }}
        defaultDay={addOpenSpotDay ?? 1}
        defaultDate={addOpenSpotDate}
        allowWeekly={false}
        onSpotAdded={refreshAll}
      />

      {/* Edit Open Spot */}
      <EditOpenSpotModal
        open={!!editOpenSpot}
        onOpenChange={(v) => {
          if (!v) {
            setEditOpenSpot(null);
            refreshAll();
          }
        }}
        spot={editOpenSpot}
        onUpdated={refreshAll}
      />

      {/* Assign Open Spot to a student (fixed schedule) */}
      <EditOpenSpotModal
        open={!!assignOpenSpot}
        onOpenChange={(v) => {
          if (!v) {
            setAssignOpenSpot(null);
            refreshAll();
          }
        }}
        spot={assignOpenSpot}
        onUpdated={refreshAll}
        initialAssignMode
      />

      {/* Edit Recurring */}
      <EditRecurringSlotModal
        open={!!editRecurring}
        onOpenChange={(v) => {
          if (!v) {
            setEditRecurring(null);
            refreshAll();
          }
        }}
        slot={editRecurring}
        onSaved={refreshAll}
      />

      {/* Edit Lesson (one-time / recurring occurrence) */}
      <EditLessonQuickModal
        open={!!editLesson}
        onOpenChange={(v) => {
          if (!v) {
            setEditLesson(null);
            refreshAll();
          }
        }}
        lesson={editLesson}
      />

      {/* Book a one-time lesson on an open spot */}
      <BookOneTimeLessonModal
        open={!!oneTimePrefill}
        onOpenChange={(v) => {
          if (!v) {
            setOneTimePrefill(null);
            refreshAll();
          }
        }}
        prefillDate={oneTimePrefill?.date ?? null}
        prefillTime={oneTimePrefill?.time ?? null}
      />
    </div>
  );
}