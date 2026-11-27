import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Clock, Plus, Loader2, ArrowLeft, RefreshCw, X, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { toast } from 'sonner';
import { fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { translateLessonType } from '@/lib/lessonTypeLabel';
import {
  distinctScheduleCount,
  isPriorityPlan,
  maxRecurringSlotsForPlan,
  timeRangesOverlap,
  weekdayName,
  type ChangeRequestRow,
} from '@/lib/recurringChangeRequests';

/**
 * "Mi horario recurrente" — opened by tapping the Priority Spot card on the
 * student dashboard. Shows the student's booked recurring schedule(s) with
 * upcoming classes, and lets them ask the coach to move one (or, Pro/Apex,
 * add a second weekly slot). A request stays "En revisión": the current
 * schedule is untouched until the coach approves it.
 */

interface OwnSchedule {
  id: string;
  kind: 'fixed' | 'recurring';
  weekday: number;
  startTime: string;
  durationMinutes: number;
  lessonType?: string | null;
  hasPendingMove: boolean;
}

interface AvailableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  effectivePlan?: string | null;
  /** Own recurring slots (is_own) from useVisibleRecurringSlots. */
  recurringSlots: any[];
  upcomingLessons: any[];
}

type PickFor =
  | { type: 'change'; current: OwnSchedule }
  | { type: 'add_second' };

export function MyRecurringSchedulePanel({
  open,
  onOpenChange,
  profile,
  effectivePlan,
  recurringSlots,
  upcomingLessons,
}: Props) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const studentPreview = useStudentPreview();
  const isPreview = studentPreview.isStudentPreview;

  const [view, setView] = useState<'overview' | 'pick'>('overview');
  const [pickFor, setPickFor] = useState<PickFor | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const studentId = profile?.id as string | undefined;

  // Claimed fixed spots (the student's Priority Spot).
  const { data: claimedFixed = [] } = useQuery({
    queryKey: ['my-fixed-slots', studentId],
    enabled: open && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type')
        .eq('student_id', studentId!)
        .eq('is_available', false)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Open fixed slots to pick from (pick view only).
  const { data: availableSlots = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ['available-fixed-slots'],
    enabled: open && view === 'pick',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, notes')
        .eq('is_available', true)
        .is('student_id', null)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AvailableSlot[];
    },
  });

  // The student's own pending change requests.
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['my-change-requests', studentId],
    enabled: open && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_slot_change_requests')
        .select('*')
        .eq('student_id', studentId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChangeRequestRow[];
    },
  });

  const ownSchedules: OwnSchedule[] = useMemo(() => {
    const fromRecurring: OwnSchedule[] = (recurringSlots ?? [])
      .filter((s: any) => s?.is_own && s?.is_active !== false)
      .map((s: any) => ({
        id: s.id,
        kind: 'recurring' as const,
        weekday: Number(s.weekday),
        startTime: String(s.start_time).slice(0, 5),
        durationMinutes: Number(s.duration_minutes ?? 60),
        lessonType: s.lesson_type ?? null,
        hasPendingMove: !!s.pending_weekday,
      }));
    const fromFixed: OwnSchedule[] = (claimedFixed ?? []).map((s: any) => ({
      id: s.id,
      kind: 'fixed' as const,
      weekday: Number(s.day_of_week),
      startTime: String(s.start_time).slice(0, 5),
      durationMinutes: Number(s.duration_minutes ?? 60),
      lessonType: s.lesson_type ?? null,
      hasPendingMove: false,
    }));
    // A claimed fixed spot and its coach-assigned recurring slot at the same
    // weekday+time are the same schedule — show it once.
    const seen = new Set<string>();
    return [...fromRecurring, ...fromFixed].filter((s) => {
      const key = `${s.weekday}|${s.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recurringSlots, claimedFixed]);

  const scheduleCount = distinctScheduleCount(
    ownSchedules.map((s) => ({ weekday: s.weekday, startTime: s.startTime })),
  );
  const canAddSecond =
    (effectivePlan === 'pro' || effectivePlan === 'apex') &&
    scheduleCount < maxRecurringSlotsForPlan(effectivePlan) &&
    !pendingRequests.some((r) => r.request_type === 'add_second');

  const pendingTargetIds = new Set(pendingRequests.map((r) => r.target_slot_id));

  // Candidates for the pick view: exclude the current time (change), anything
  // overlapping the student's other schedules, and slots already requested.
  const candidates = useMemo(() => {
    if (view !== 'pick' || !pickFor) return [];
    const others = ownSchedules.filter((s) =>
      pickFor.type === 'change' ? s.id !== pickFor.current.id : true,
    );
    return availableSlots.filter((slot) => {
      if (pickFor.type === 'change') {
        const cur = pickFor.current;
        if (
          slot.day_of_week === cur.weekday &&
          String(slot.start_time).slice(0, 5) === cur.startTime
        ) {
          return false; // same time as the current schedule
        }
      }
      return !others.some(
        (s) =>
          s.weekday === slot.day_of_week &&
          timeRangesOverlap(
            String(slot.start_time).slice(0, 5),
            slot.duration_minutes ?? 60,
            s.startTime,
            s.durationMinutes,
          ),
      );
    });
  }, [view, pickFor, availableSlots, ownSchedules]);

  const dayLabel = (weekday: number) => {
    const name = weekdayName(weekday, language === 'es' ? 'es' : 'en');
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const upcomingFor = (slot: OwnSchedule) =>
    (upcomingLessons ?? [])
      .filter((l: any) => {
        if (l.recurring_slot_id && l.recurring_slot_id === slot.id) return true;
        // Lessons generated from a fixed spot carry no recurring_slot_id:
        // match by weekday + time instead.
        if (l.recurring_slot_id) return false;
        const d = new Date(`${String(l.lesson_date).substring(0, 10)}T12:00:00-05:00`);
        return (
          d.getDay() === slot.weekday &&
          String(l.lesson_time).slice(0, 5) === slot.startTime
        );
      })
      .slice(0, 3);

  const formatLessonDay = (lesson: any) => {
    const d = new Date(
      `${String(lesson.lesson_date).substring(0, 10)}T${String(lesson.lesson_time).slice(0, 5)}:00-05:00`,
    );
    return new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', {
      timeZone: 'America/Cancun',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(d);
  };

  const openPick = (next: PickFor) => {
    setPickFor(next);
    setSelectedTargetId(null);
    setView('pick');
  };

  const backToOverview = () => {
    setView('overview');
    setPickFor(null);
    setSelectedTargetId(null);
  };

  const submitRequest = async () => {
    if (!pickFor || !selectedTargetId || !studentId) return;
    if (isDemoModeActive()) {
      toast.error(t('rcDemoBlockedTitle'), {
        description: t('rcDemoBlockedDesc'),
      });
      return;
    }
    if (isPreview && studentPreview.blockWrite()) return;
    const target = availableSlots.find((s) => s.id === selectedTargetId);
    if (!target) return;
    if (pendingTargetIds.has(target.id)) {
      toast.error(t('rcAlreadyRequested'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('recurring_slot_change_requests').insert({
        student_id: studentId,
        coach_id: (profile as any)?.assigned_coach_id ?? null,
        request_type: pickFor.type,
        current_slot_kind: pickFor.type === 'change' ? pickFor.current.kind : null,
        current_slot_id: pickFor.type === 'change' ? pickFor.current.id : null,
        target_slot_id: target.id,
        target_weekday: target.day_of_week,
        target_start_time: String(target.start_time).slice(0, 8),
        target_duration_minutes: target.duration_minutes ?? 60,
        target_lesson_type: target.lesson_type ?? null,
        plan_at_request: effectivePlan ?? null,
        status: 'pending',
      });
      if (error) throw error;

      // Email to the coach (best effort — the in-app notification is created
      // by a DB trigger on insert, so the coach is notified either way).
      try {
        await supabase.functions.invoke('notify-admin', {
          body: {
            eventType: 'recurring_change_requested',
            studentName: (profile as any)?.full_name ?? (profile as any)?.email ?? '',
            studentEmail: (profile as any)?.email ?? '',
            spotDay: dayLabel(target.day_of_week),
            spotTime: fmtSlotTime(String(target.start_time)),
            planLabel: effectivePlan ?? '',
            lessonType: target.lesson_type ?? '',
            notes:
              pickFor.type === 'add_second'
                ? 'Second weekly slot'
                : 'Change of recurring schedule',
          },
        });
      } catch {
        // Non-blocking: the DB trigger already notified the coach in-app.
      }

      toast.success(t('rcRequestSentTitle'), { description: t('rcRequestSentDesc') });
      queryClient.invalidateQueries({ queryKey: ['my-change-requests', studentId] });
      backToOverview();
    } catch (e: any) {
      toast.error(t('rcRequestErrorTitle'), {
        description: e?.message || t('rcRequestErrorDesc'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (isDemoModeActive()) {
      toast.error(t('rcDemoBlockedTitle'), { description: t('rcDemoBlockedDesc') });
      return;
    }
    if (isPreview && studentPreview.blockWrite()) return;
    setCancellingId(requestId);
    try {
      const { error } = await supabase
        .from('recurring_slot_change_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (error) throw error;
      toast.success(t('rcCancelledTitle'));
      queryClient.invalidateQueries({ queryKey: ['my-change-requests', studentId] });
    } catch (e: any) {
      toast.error(t('rcRequestErrorTitle'), { description: e?.message || t('rcRequestErrorDesc') });
    } finally {
      setCancellingId(null);
    }
  };

  const selectedTarget = availableSlots.find((s) => s.id === selectedTargetId) ?? null;
  const readOnly = isDemoModeActive() || isPreview;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) backToOverview();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto rounded-3xl p-0"
        style={{
          background: 'linear-gradient(180deg, rgba(20,24,28,0.98), rgba(15,18,22,0.98))',
          borderColor: 'rgba(240,192,64,0.25)',
        }}
      >
        <div className="relative p-6 sm:p-7">
          {view === 'pick' ? (
            <>
              <button
                onClick={backToOverview}
                className="mb-4 flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory"
              >
                <ArrowLeft className="h-4 w-4" /> {t('rcBack')}
              </button>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="font-heading text-2xl text-ivory font-semibold leading-tight">
                  {pickFor?.type === 'add_second' ? t('rcAddSecondTitle') : t('rcPickTitle')}
                </DialogTitle>
                <DialogDescription className="text-ivory/70 text-sm leading-relaxed">
                  {pickFor?.type === 'change' && pickFor.current
                    ? t('rcPickDescChange')
                        .replace('{day}', dayLabel(pickFor.current.weekday))
                        .replace('{time}', fmtSlotTime(`${pickFor.current.startTime}:00`))
                    : t('rcPickDescAdd')}
                </DialogDescription>
              </DialogHeader>

              {loadingAvailable ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-ivory/60" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="py-10 text-center text-sm text-ivory/60">{t('rcNoSlots')}</p>
              ) : (
                <ul className="mt-5 space-y-2">
                  {candidates.map((slot) => {
                    const alreadyRequested = pendingTargetIds.has(slot.id);
                    const selected = selectedTargetId === slot.id;
                    return (
                      <li key={slot.id}>
                        <button
                          type="button"
                          disabled={alreadyRequested}
                          onClick={() => setSelectedTargetId(slot.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors disabled:opacity-50"
                          style={{
                            background: selected ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                            border: selected
                              ? '1px solid rgba(240,192,64,0.55)'
                              : '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          <span>
                            <span className="block text-ivory font-semibold">
                              {dayLabel(slot.day_of_week)} · {fmtSlotTime(String(slot.start_time))}
                            </span>
                            <span className="mt-0.5 block text-xs text-ivory/55">
                              {slot.duration_minutes ?? 60} {t('rcMinutes')}
                              {slot.lesson_type
                                ? ` · ${translateLessonType(slot.lesson_type, language === 'es' ? 'es' : 'en')}`
                                : ''}
                            </span>
                          </span>
                          {alreadyRequested ? (
                            <Badge className="bg-amber-500/15 text-amber-300 border border-amber-400/30">
                              {t('rcUnderReview')}
                            </Badge>
                          ) : selected ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-accent text-black">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-5 text-xs leading-relaxed text-ivory/50">{t('rcFreeNote')}</p>
              <Button
                onClick={submitRequest}
                disabled={!selectedTarget || submitting || readOnly}
                className="mt-4 h-12 w-full bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <RefreshCw className="h-5 w-5" />
                )}
                {t('rcSubmitRequest')}
              </Button>
            </>
          ) : (
            <>
              <DialogHeader className="space-y-2 text-left">
                <div className="h-12 w-12 rounded-2xl bg-gold-accent/15 border border-gold-accent/35 flex items-center justify-center">
                  <CalendarCheck className="h-6 w-6 text-gold-accent" />
                </div>
                <DialogTitle className="font-heading text-2xl text-ivory font-semibold leading-tight">
                  {t('rcTitle')}
                </DialogTitle>
                <DialogDescription className="text-ivory/70 text-sm leading-relaxed">
                  {t('rcDescription')}
                </DialogDescription>
              </DialogHeader>

              {pendingRequests.length > 0 && (
                <div className="mt-5 space-y-2">
                  {pendingRequests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                      style={{
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.30)',
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ivory font-medium">
                          {r.request_type === 'add_second' ? t('rcAddSecondTitle') : t('rcChangeTitle')}
                          {': '}
                          {dayLabel(r.target_weekday)} · {fmtSlotTime(String(r.target_start_time))}
                        </p>
                        <p className="mt-0.5 text-xs text-amber-200/80">{t('rcUnderReviewDesc')}</p>
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => cancelRequest(r.id)}
                          disabled={cancellingId === r.id}
                          className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-ivory/70 hover:text-ivory disabled:opacity-50"
                        >
                          {cancellingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('rcCancelRequest')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {ownSchedules.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                  <p className="text-sm text-ivory/70">{t('rcNoSchedule')}</p>
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      navigate('/lessons/fixed-schedule');
                    }}
                    className="mt-4 h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold"
                  >
                    {t('rcChooseSchedule')}
                  </Button>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {ownSchedules.map((slot) => {
                    const lessons = upcomingFor(slot);
                    return (
                      <div
                        key={`${slot.kind}-${slot.id}`}
                        className="rounded-2xl px-4 py-4"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-ivory font-semibold">
                              {dayLabel(slot.weekday)} · {fmtSlotTime(`${slot.startTime}:00`)}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ivory/55">
                              <Clock className="h-3.5 w-3.5" />
                              {slot.durationMinutes} {t('rcMinutes')}
                              {slot.lessonType
                                ? ` · ${translateLessonType(slot.lessonType, language === 'es' ? 'es' : 'en')}`
                                : ''}
                            </p>
                          </div>
                          {slot.hasPendingMove ? (
                            <Badge className="shrink-0 bg-amber-500/15 text-amber-300 border border-amber-400/30">
                              {t('rcMoveScheduled')}
                            </Badge>
                          ) : (
                            <Badge className="shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                              {t('rcConfirmed')}
                            </Badge>
                          )}
                        </div>

                        {lessons.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
                            {lessons.map((l: any) => (
                              <li key={l.id} className="flex items-center justify-between text-xs">
                                <span className="text-ivory/70">{formatLessonDay(l)}</span>
                                <span className="text-ivory/50">{fmtSlotTime(String(l.lesson_time))}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {!readOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPick({ type: 'change', current: slot })}
                            className="mt-3 w-full border-white/15 bg-transparent text-ivory hover:bg-white/5"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {t('rcChangeSchedule')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canAddSecond && !readOnly && (
                <Button
                  variant="outline"
                  onClick={() => openPick({ type: 'add_second' })}
                  className="mt-4 h-12 w-full border-gold-accent/40 bg-transparent text-gold-accent hover:bg-gold-accent/10 font-semibold gap-2"
                >
                  <Plus className="h-5 w-5" />
                  {t('rcAddSecondCta')}
                </Button>
              )}

              {isPriorityPlan(effectivePlan) && (
                <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ivory/45">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('rcPriorityNote')}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
