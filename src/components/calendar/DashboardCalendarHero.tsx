import { deleteRecurringOccurrence } from '@/lib/materializeRecurringLesson';
import { materializeRecurringLesson } from '@/lib/materializeRecurringLesson';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronRight, Loader2, CalendarX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { CalendarLegend } from './CalendarLegend';
import { SlotTile } from './SlotTile';
import { useCalendarWeek } from './useCalendarWeek';
import { WEEKDAYS_SHORT, toISODate, SlotItem } from './calendarTypes';

import { SlotActionSheet } from './SlotActionSheet';
import { SkipWeekModal } from '@/components/SkipWeekModal';
import { AddOpenSpotModal } from '@/components/AddOpenSpotModal';
import { EditOpenSpotModal } from '@/components/EditOpenSpotModal';
import { EditRecurringSlotModal } from '@/components/EditRecurringSlotModal';
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';
import { BookOneTimeLessonModal } from '@/components/BookOneTimeLessonModal';
import { SkippedWeeksModal } from './SkippedWeeksModal';

/**
 * Dashboard hero — a compact, live 7-day calendar embedded directly in the
 * coach dashboard. Same data source and slot semantics as /admin/calendar
 * so behavior stays consistent across surfaces.
 */
export function DashboardCalendarHero() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Today + next 3 days (4-day strip)
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);
  const { data: byDate = {}, isLoading } = useCalendarWeek(days);

  const [actionSlot, setActionSlot] = useState<SlotItem | null>(null);
  const [actionEmpty, setActionEmpty] = useState<{ date: string } | null>(null);
  const sheetOpen = !!actionSlot || !!actionEmpty;

  const [skipSlot, setSkipSlot] = useState<any | null>(null);
  const [skipStudentProfile, setSkipStudentProfile] =
    useState<{ full_name?: string | null; email?: string | null } | null>(null);
  const [addOpenSpotDay, setAddOpenSpotDay] = useState<number | null>(null);
  const [editOpenSpot, setEditOpenSpot] = useState<any | null>(null);
  const [assignOpenSpot, setAssignOpenSpot] = useState<any | null>(null);
  const [editRecurring, setEditRecurring] = useState<any | null>(null);
  const [editLesson, setEditLesson] = useState<any | null>(null);
  const [oneTimePrefill, setOneTimePrefill] = useState<{ date: string; time: string } | null>(null);
  const [skippedOpen, setSkippedOpen] = useState(false);

  const { data: skippedCount = 0 } = useQuery({
    queryKey: ['skipped-weeks-count', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('lessons')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user!.id)
        .eq('skipped', true)
        .not('recurring_slot_id', 'is', null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['master-calendar-week'] });
    qc.invalidateQueries({ queryKey: ['admin-all-recurring-slots'] });
    qc.invalidateQueries({ queryKey: ['admin-open-priority-spots'] });
    qc.invalidateQueries({ queryKey: ['admin-all-lessons'] });
    qc.invalidateQueries({ queryKey: ['available-slots'] });
  };

  const todayIso = toISODate(new Date());

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
      weekday: r?.weekday,
      start_time: r?.start_time ?? slot.start_time,
      duration_minutes: r?.duration_minutes ?? slot.duration_minutes,
      lesson_type: r?.lesson_type ?? slot.lesson_type,
      package_id: r?.package_id ?? null,
    });
  };

  const handleAddOpenSpotFromCell = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d, 12, 0, 0).getDay();
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

  const handleDeleteLesson = async (slot: SlotItem) => {
    const lessonId = slot.lesson_id;
    const recId = slot.recurring_slot_id ?? (slot.raw as any)?.lesson?.recurring_slot_id ?? null;
    if (!lessonId && !recId) return;
    if (!confirm('Delete this lesson from the calendar?')) return;
    const { error } = recId
      ? await deleteRecurringOccurrence({ ...slot, recurring_slot_id: recId, coach_id: (slot.raw as any)?.recurring?.coach_id ?? null })
      : await supabase.from('lessons').delete().eq('id', lessonId!);
    if (error) return toast.error(error.message);
    toast.success('Lesson deleted.');
    refreshAll();
  };

  const handleDeleteRecurring = async (slot: SlotItem) => {
    if (!slot.recurring_slot_id) return;
    if (!confirm('Remove this recurring slot? Future weeks will no longer be auto-generated.')) return;
    const { error } = await supabase
      .from('recurring_lesson_slots')
      .update({ is_active: false })
      .eq('id', slot.recurring_slot_id);
    if (error) return toast.error(error.message);
    toast.success('Recurring slot removed.');
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

  return (
    <section
      data-tour="calendar-hero"
      className="glass-card p-4 sm:p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(74,124,89,0.18) 0%, rgba(74,124,89,0.06) 100%)',
        border: '1px solid rgba(74,124,89,0.35)',
        boxShadow: '0 8px 24px -12px rgba(74,124,89,0.35)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col items-stretch gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(74,124,89,0.32)' }}
          >
            <CalendarDays className="h-5 w-5" style={{ color: '#F5F0E8' }} />
          </div>
          <div className="min-w-0">
            <p
              style={{
                color: '#E8D5B0',
                opacity: 0.7,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Next 4 days
            </p>
            <h3
              className="font-heading"
              style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}
            >
              Calendar
            </h3>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSkippedOpen(true)}
          className="relative h-8 min-w-0 text-xs px-2 sm:px-3 border-white/15 bg-white/5 hover:bg-white/10 text-[#F5F0E8]"
        >
          <CalendarX className="h-3.5 w-3.5 mr-1" />
          Skipped
          {skippedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {skippedCount}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          onClick={() => navigate('/admin/calendar')}
          className="h-8 min-w-0 whitespace-nowrap text-xs px-2 sm:px-3 bg-[#4a7c59] hover:bg-[#4a7c59]/85 text-[#F5F0E8]"
        >
          Open Full Calendar
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3">
        <CalendarLegend compact />
      </div>

      {/* 4-day strip */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-[#F5F0E8]/70 text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {days.map((d) => {
            const iso = toISODate(d);
            const slots = byDate[iso] || [];
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                className="rounded-xl p-2 min-h-[140px] flex flex-col"
                style={{
                  background: isToday ? 'rgba(240,192,64,0.10)' : 'rgba(255,255,255,0.04)',
                  border: isToday
                    ? '1px solid rgba(240,192,64,0.45)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: isToday ? '#F0C040' : '#F5F0E8', opacity: isToday ? 1 : 0.6 }}
                  >
                    {isToday ? 'Today' : WEEKDAYS_SHORT[d.getDay()]}
                  </div>
                  <div
                    className="text-[12px] font-bold"
                    style={{ color: isToday ? '#F0C040' : '#F5F0E8' }}
                  >
                    {d.getDate()}
                  </div>
                </div>

                <div className="space-y-1 flex-1 overflow-hidden">
                  {slots.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleEmptyCell(iso)}
                      className="w-full h-full min-h-[80px] text-[10px] text-[#F5F0E8]/40 hover:text-[#F5F0E8]/80 hover:bg-white/5 rounded transition-colors"
                    >
                      +
                    </button>
                  ) : (
                    <>
                      {slots.slice(0, 4).map((s) => (
                        <SlotTile
                          key={s.id}
                          slot={s}
                          compact
                          onClick={(slot) => {
                            setActionEmpty(null);
                            setActionSlot(slot);
                          }}
                        />
                      ))}
                      {slots.length > 4 && (
                        <button
                          type="button"
                          onClick={() => navigate('/admin/calendar')}
                          className="w-full text-[10px] text-[#F5F0E8]/55 hover:text-[#F5F0E8] py-0.5 rounded hover:bg-white/5"
                        >
                          +{slots.length - 4} more
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
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
        onEditLesson={async (slot) => {
          if (slot.raw?.lesson) { setEditLesson(slot.raw.lesson); return; }
          if (!slot.recurring_slot_id) return;
          try {
            const id = await materializeRecurringLesson(slot.recurring_slot_id, slot.date);
            const { data } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle();
            if (data) setEditLesson(data);
          } catch (e: any) {
            toast.error(e?.message || 'Could not open this lesson');
          }
        }}
        onEditRecurring={(slot) => setEditRecurring(slot.raw?.recurring ?? null)}
        onEditOpenSpot={(slot) => setEditOpenSpot(slot.raw?.open ?? null)}
        onAddOpenSpot={handleAddOpenSpotFromCell}
        onAddBlock={handleAddBlockFromCell}
        onAssignToStudent={handleAssignOpenToStudent}
        onConvertOpenToOneTime={handleConvertOpenToOneTime}
        onDeleteRecurring={handleDeleteRecurring}
        onDeleteLesson={handleDeleteLesson}
        onDeleteOpenSpot={handleDeleteOpenSpot}
      />

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
      />

      <AddOpenSpotModal
        open={addOpenSpotDay !== null}
        onOpenChange={(v) => !v && setAddOpenSpotDay(null)}
        defaultDay={addOpenSpotDay ?? 1}
        onSpotAdded={refreshAll}
      />

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

      <BookOneTimeLessonModal
        open={!!oneTimePrefill}
        onOpenChange={(v) => { if (!v) { setOneTimePrefill(null); refreshAll(); } }}
        prefillDate={oneTimePrefill?.date ?? null}
        prefillTime={oneTimePrefill?.time ?? null}
      />

      <SkippedWeeksModal open={skippedOpen} onOpenChange={setSkippedOpen} />
    </section>
  );
}