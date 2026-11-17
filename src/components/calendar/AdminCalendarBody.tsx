import { deleteRecurringOccurrence } from '@/lib/materializeRecurringLesson';
import { removeLessonFromCalendar } from '@/lib/materializeRecurringLesson';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Loader2, RefreshCw, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { BookOneTimeLessonModal } from '@/components/BookOneTimeLessonModal';

import { SkipWeekModal } from '@/components/SkipWeekModal';
import { AddOpenSpotModal } from '@/components/AddOpenSpotModal';
import { EditOpenSpotModal } from '@/components/EditOpenSpotModal';
import { EditRecurringSlotModal } from '@/components/EditRecurringSlotModal';
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';

/**
 * Self-contained calendar body (no page header / back link).
 * Used both by the standalone /admin/calendar page and the
 * "Live Calendar" tab inside /admin/lessons.
 */
export function AdminCalendarBody() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const week = useMemo(() => mondayWeek(anchor), [anchor]);
  const { data: byDate = {}, isLoading, refetch, isFetching } = useCalendarWeek(week);

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
      toast.error('Skip is only available on recurring slots.');
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
  const handleEditLessonFromAction = async (slot: SlotItem) => {
    // If a real lessons row backs this card, open it directly.
    if (slot.raw?.lesson) {
      setEditLesson(slot.raw.lesson);
      return;
    }
    // Otherwise this is a projected recurring-slot card with no lessons
    // row yet (e.g. a future week the regenerator hasn't materialized).
    // Materialize one inline using the slot's defaults, then open the
    // standard lesson modal on the new row. auto_generated=false keeps it
    // safe from future generate-recurring-lessons runs.
    const r = slot.raw?.recurring;
    if (!r) {
      toast.error('Could not open this slot — missing recurring slot data.');
      return;
    }
    try {
      const start_time = String(r.start_time).slice(0, 8).padEnd(8, ':00:00').slice(0, 8);
      const lesson_time = start_time.length === 5 ? `${start_time}:00` : start_time;
      const insertPayload: any = {
        student_id: r.student_id ?? slot.student_id ?? null,
        lesson_date: slot.date,
        lesson_time,
        duration_minutes: r.duration_minutes ?? slot.duration_minutes ?? 60,
        lesson_type: r.lesson_type ?? slot.lesson_type ?? 'Range',
        status: 'scheduled',
        recurring_slot_id: r.id,
        package_id: r.package_id ?? null,
        auto_generated: false,
        skipped: false,
        skip_keep_closed: false,
      };
      const { data: inserted, error } = await supabase
        .from('lessons')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) throw error;
      setEditLesson(inserted);
    } catch (err: any) {
      toast.error(err?.message || 'Could not open this lesson.');
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
    navigate(`/admin/availability?date=${date}`);
  };

  const handleAssignOpenToStudent = (slot: SlotItem) => {
    const open = slot.raw?.open;
    if (!open) {
      if (slot.raw?.recurring) {
        setOneTimePrefill({ date: slot.date, time: slot.start_time });
        return;
      }
      toast.error('This slot is no longer available.');
      return;
    }
    setAssignOpenSpot(open);
  };

  const handleConvertOpenToOneTime = (slot: SlotItem) => {
    setOneTimePrefill({ date: slot.date, time: slot.start_time });
  };

  const handleDeleteRecurring = async (slot: SlotItem) => {
    if (!slot.recurring_slot_id) return;
    if (!confirm('Remove this recurring slot? Future weeks will no longer be auto-generated.')) return;
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
    toast.success('Recurring slot and future lessons removed.');
    refreshAll();
  };

  const handleDeleteOpenSpot = async (slot: SlotItem) => {
    if (!user?.id) {
      toast.error('Sign in required');
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
        return toast.error('This open spot belongs to another coach. Refreshing calendar…');
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
        return toast.error('This open spot belongs to another coach. Refreshing calendar…');
      }
    } else {
      return toast.error('Could not find spot ID');
    }

    toast.success('Open spot removed.');
    refreshAll();
  };

  const handleDeleteLesson = async (slot: SlotItem) => {
    const lessonId = slot.lesson_id;
    const recId = slot.recurring_slot_id ?? (slot.raw as any)?.lesson?.recurring_slot_id ?? null;
    if (!lessonId && !recId) return;
    if (!confirm('Delete this lesson from the calendar?')) return;
    const { error } = recId
      ? await deleteRecurringOccurrence({ ...slot, recurring_slot_id: recId, coach_id: (slot.raw as any)?.recurring?.coach_id ?? null })
      : await supabase.from('lessons').delete().eq('id', lessonId!);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Lesson deleted.');
    refreshAll();
  };

  return (
    <>
      {/* View toggle + refresh */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div
          role="tablist"
          aria-label="Calendar view"
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
          title="Refresh"
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Legend */}
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
                title="Previous week"
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
                title="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm text-[#F5F0E8]/85 font-medium">{weekLabel}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => { setAddOpenSpotDate(null); setAddOpenSpotDay(new Date().getDay()); }}
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
                        title="Add to this day"
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

      {/* Modals */}
      <SlotActionSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) { setActionSlot(null); setActionEmpty(null); }
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

      <SkipWeekModal
        open={!!skipSlot}
        onOpenChange={(v) => { if (!v) { setSkipSlot(null); setSkipStudentProfile(null); } }}
        slot={skipSlot}
        studentProfile={skipStudentProfile}
        defaultDate={actionSlot?.date ?? null}
        onChanged={refreshAll}
      />

      <AddOpenSpotModal
        open={addOpenSpotDay !== null}
        onOpenChange={(v) => { if (!v) { setAddOpenSpotDay(null); setAddOpenSpotDate(null); } }}
        defaultDay={addOpenSpotDay ?? 1}
        defaultDate={addOpenSpotDate}
        allowWeekly={false}
        onSpotAdded={refreshAll}
      />

      <EditOpenSpotModal
        open={!!editOpenSpot}
        onOpenChange={(v) => { if (!v) { setEditOpenSpot(null); refreshAll(); } }}
        spot={editOpenSpot}
        onUpdated={refreshAll}
      />

      <EditOpenSpotModal
        open={!!assignOpenSpot}
        onOpenChange={(v) => { if (!v) { setAssignOpenSpot(null); refreshAll(); } }}
        spot={assignOpenSpot}
        onUpdated={refreshAll}
        initialAssignMode
      />

      <EditRecurringSlotModal
        open={!!editRecurring}
        onOpenChange={(v) => { if (!v) { setEditRecurring(null); refreshAll(); } }}
        slot={editRecurring}
        onSaved={refreshAll}
      />

      <EditLessonQuickModal
        open={!!editLesson}
        onOpenChange={(v) => { if (!v) { setEditLesson(null); refreshAll(); } }}
        lesson={editLesson}
      />

      <BookOneTimeLessonModal
        open={!!oneTimePrefill}
        onOpenChange={(v) => { if (!v) { setOneTimePrefill(null); refreshAll(); } }}
        prefillDate={oneTimePrefill?.date ?? null}
        prefillTime={oneTimePrefill?.time ?? null}
      />
    </>
  );
}