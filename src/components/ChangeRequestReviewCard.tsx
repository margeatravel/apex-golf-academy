import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { findRecurringMoveConflicts } from '@/lib/pendingRecurringMove';
import {
  distinctScheduleCount,
  isPriorityPlan,
  maxRecurringSlotsForPlan,
  nextOccurrenceOfWeekday,
  planPriorityRank,
  timeRangesOverlap,
  toMinutes,
  weekdayName,
  type ChangeRequestRow,
} from '@/lib/recurringChangeRequests';

/**
 * Coach review queue for recurring schedule change requests.
 * Mounted on /admin/fixed-schedule, above the calendar. Only renders when
 * there are pending requests (the coach is also notified in-app by a DB
 * trigger on insert, and by email via notify-admin).
 *
 * Approval (Santiago's rules):
 *  - the target slot must still be open; it is claimed FIRST (conditional
 *    update) so a failed claim leaves everything untouched;
 *  - a Scratch/Pro/Apex request for the same slot beats a lower-plan request
 *    (the approve button is blocked while one is pending);
 *  - 'change' frees the old fixed spot (or schedules a pending move on the
 *    coach-assigned recurring slot, effective next week) and regenerates
 *    lessons; 'add_second' only claims the new slot, within the plan limit;
 *  - the other pending requests for the same target are auto-denied and
 *    their students are notified, as is the approved student.
 */

interface EnrichedRequest extends ChangeRequestRow {
  studentName: string;
  studentEmail: string | null;
  currentLabel: string | null;
  currentWeekday: number | null;
  currentStartTime: string | null;
  targetLabel: string;
}

interface Props {
  coachId: string | null;
}

async function notifyStudent(
  studentId: string,
  approved: boolean,
  targetLabel: string,
  note?: string | null,
  effectiveDate?: string | null,
) {
  // In-app notification — works today, no deploy needed.
  try {
    await supabase.from('notifications').insert({
      user_id: studentId,
      type: approved ? 'recurring_change_approved' : 'recurring_change_denied',
      title: approved
        ? 'Tu cambio de horario fue aprobado'
        : 'Tu cambio de horario no fue aprobado',
      message: approved
        ? `Tu nuevo horario recurrente es ${targetLabel}${effectiveDate ? `, a partir del ${effectiveDate}` : ''}.`
        : `Tu solicitud de cambio a ${targetLabel} no fue aprobada.${note ? ` ${note}` : ''}`,
      link: '/lessons',
      metadata: { target_label: targetLabel, effective_date: effectiveDate ?? null },
    });
  } catch {
    // Non-blocking.
  }
  // Email — needs the new send-notification-email types deployed; until then
  // this call fails silently and the student still has the in-app notice.
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', studentId)
      .single();
    if (prof?.email) {
      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: prof.email,
          studentName: prof.full_name ?? '',
          notificationType: approved
            ? 'recurring_change_approved'
            : 'recurring_change_denied',
          spotDay: targetLabel,
          spotTime: '',
        },
      });
    }
  } catch {
    // Non-blocking.
  }
}

export function ChangeRequestReviewCard({ coachId }: Props) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState('');

  const lang = language === 'es' ? 'es' : 'en';

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['change-requests', coachId, isDemoModeActive() ? 'demo' : 'live'],
    enabled: !!user?.id,
    queryFn: async (): Promise<EnrichedRequest[]> => {
      // Demo mode has no real requests — the queue stays hidden.
      if (isDemoModeActive()) return [];
      const { data, error } = await supabase
        .from('recurring_slot_change_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ChangeRequestRow[];
      // Only this coach's students (plus unassigned ones, which Santiago
      // reviews as the fallback coach).
      const mine = rows.filter((r) => !r.coach_id || r.coach_id === coachId);
      if (mine.length === 0) return [];

      const studentIds = Array.from(new Set(mine.map((r) => r.student_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

      const fixedIds = mine
        .filter((r) => r.current_slot_kind === 'fixed' && r.current_slot_id)
        .map((r) => r.current_slot_id!);
      const recurringIds = mine
        .filter((r) => r.current_slot_kind === 'recurring' && r.current_slot_id)
        .map((r) => r.current_slot_id!);
      const targetIds = mine.map((r) => r.target_slot_id);
      const [fixedRows, recurringRows, targetRows] = await Promise.all([
        fixedIds.length
          ? supabase.from('fixed_schedule_slots').select('id, day_of_week, start_time').in('id', fixedIds)
          : Promise.resolve({ data: [] as any[] }),
        recurringIds.length
          ? supabase.from('recurring_lesson_slots').select('id, weekday, start_time').in('id', recurringIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('fixed_schedule_slots').select('id, day_of_week, start_time').in('id', targetIds),
      ]);
      const fixedMap: Map<string, any> = new Map(((fixedRows as any)?.data ?? []).map((s: any) => [s.id, s]));
      const recurringMap: Map<string, any> = new Map(((recurringRows as any)?.data ?? []).map((s: any) => [s.id, s]));
      const targetMap: Map<string, any> = new Map(((targetRows as any)?.data ?? []).map((s: any) => [s.id, s]));

      const label = (weekday: number, startTime: string) => {
        const name = weekdayName(weekday, lang);
        return `${name.charAt(0).toUpperCase() + name.slice(1)} · ${fmtSlotTime(String(startTime))}`;
      };

      return mine.map((r) => {
        const prof = profMap.get(r.student_id);
        let currentLabel: string | null = null;
        let currentWeekday: number | null = null;
        let currentStartTime: string | null = null;
        if (r.current_slot_kind === 'fixed' && r.current_slot_id) {
          const s = fixedMap.get(r.current_slot_id);
          if (s) {
            currentWeekday = Number(s.day_of_week);
            currentStartTime = String(s.start_time).slice(0, 5);
            currentLabel = label(currentWeekday, currentStartTime);
          }
        } else if (r.current_slot_kind === 'recurring' && r.current_slot_id) {
          const s = recurringMap.get(r.current_slot_id);
          if (s) {
            currentWeekday = Number(s.weekday);
            currentStartTime = String(s.start_time).slice(0, 5);
            currentLabel = label(currentWeekday, currentStartTime);
          }
        }
        const target = targetMap.get(r.target_slot_id);
        const targetLabel = target
          ? label(Number(target.day_of_week), String(target.start_time).slice(0, 5))
          : label(r.target_weekday, String(r.target_start_time).slice(0, 5));
        return {
          ...r,
          studentName: prof?.full_name ?? prof?.email ?? t('rcUnknownStudent'),
          studentEmail: prof?.email ?? null,
          currentLabel,
          currentWeekday,
          currentStartTime,
          targetLabel,
        };
      });
    },
  });

  const sorted = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          planPriorityRank(a.plan_at_request) - planPriorityRank(b.plan_at_request) ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [requests],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['change-requests'] });
    queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
    queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
  };

  const countDistinctSchedules = async (studentId: string): Promise<number> => {
    const [fixed, recurring] = await Promise.all([
      supabase
        .from('fixed_schedule_slots')
        .select('day_of_week, start_time')
        .eq('student_id', studentId)
        .eq('is_available', false),
      supabase
        .from('recurring_lesson_slots')
        .select('weekday, start_time')
        .eq('student_id', studentId)
        .eq('is_active', true),
    ]);
    return distinctScheduleCount([
      ...((fixed.data ?? []) as any[]).map((s) => ({
        weekday: Number(s.day_of_week),
        startTime: String(s.start_time).slice(0, 5),
      })),
      ...((recurring.data ?? []) as any[]).map((s) => ({
        weekday: Number(s.weekday),
        startTime: String(s.start_time).slice(0, 5),
      })),
    ]);
  };

  const approveRequest = async (req: EnrichedRequest) => {
    if (!user?.id || busyId) return;
    setBusyId(req.id);
    try {
      // 1. Fresh read: still pending, target still open.
      const { data: fresh } = await supabase
        .from('recurring_slot_change_requests')
        .select('*')
        .eq('id', req.id)
        .single();
      if (!fresh || (fresh as any).status !== 'pending') {
        throw new Error(t('rcAlreadyReviewed'));
      }
      const targetSlotId = (fresh as any).target_slot_id as string;
      const { data: target } = await supabase
        .from('fixed_schedule_slots')
        .select('id, is_available, student_id')
        .eq('id', targetSlotId)
        .single();
      if (!target || !(target as any).is_available || (target as any).student_id) {
        throw new Error(t('rcSlotTaken'));
      }

      // 2. Conflict priority: a pending Scratch/Pro/Apex request for the same
      //    slot beats this one when this student is not a priority plan.
      const { data: others } = await supabase
        .from('recurring_slot_change_requests')
        .select('id, student_id, plan_at_request, created_at')
        .eq('target_slot_id', targetSlotId)
        .eq('status', 'pending')
        .neq('id', req.id);
      const otherRows = (others ?? []) as any[];
      if (
        otherRows.some(
          (o) => isPriorityPlan(o.plan_at_request) && !isPriorityPlan((fresh as any).plan_at_request),
        )
      ) {
        throw new Error(t('rcPriorityBlocked'));
      }

      // 3. Plan limit (only 'add_second' grows the count; a 'change' swaps).
      if ((fresh as any).request_type === 'add_second') {
        const count = await countDistinctSchedules((fresh as any).student_id);
        if (count >= maxRecurringSlotsForPlan((fresh as any).plan_at_request)) {
          throw new Error(t('rcLimitReached'));
        }
      }

      // 4. Hard conflicts with other students' recurring slots, and with
      //    other students' claimed fixed spots at the same weekday/time.
      const clashes = await findRecurringMoveConflicts({
        slotId:
          (fresh as any).current_slot_kind === 'recurring'
            ? ((fresh as any).current_slot_id as string)
            : 'new-change-request',
        weekday: Number((fresh as any).target_weekday),
        startTime: String((fresh as any).target_start_time).slice(0, 5),
        durationMinutes: Number((fresh as any).target_duration_minutes ?? 60),
        lessonType: (fresh as any).target_lesson_type ?? null,
        coachId: coachId ?? user.id,
        effectiveDate: nextOccurrenceOfWeekday(Number((fresh as any).target_weekday)),
      });
      if (clashes.length > 0) {
        throw new Error(`${t('rcConflictWith')} ${clashes.join(', ')}`);
      }
      const { data: claimedSameDay } = await supabase
        .from('fixed_schedule_slots')
        .select('id, start_time, duration_minutes, student_id')
        .eq('day_of_week', Number((fresh as any).target_weekday))
        .eq('is_available', false)
        .not('student_id', 'is', null);
      const fixedClash = ((claimedSameDay ?? []) as any[]).some(
        (s) =>
          s.student_id !== (fresh as any).student_id &&
          timeRangesOverlap(
            String((fresh as any).target_start_time).slice(0, 5),
            Number((fresh as any).target_duration_minutes ?? 60),
            String(s.start_time).slice(0, 5),
            Number(s.duration_minutes ?? 60),
          ),
      );
      if (fixedClash) throw new Error(t('rcConflictWith'));

      // 5. Claim the new slot FIRST (conditional — fails if someone took it
      //    in the meantime, leaving everything else untouched).
      const { data: claimed, error: claimErr } = await supabase
        .from('fixed_schedule_slots')
        .update({
          student_id: (fresh as any).student_id,
          is_available: false,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetSlotId)
        .eq('is_available', true)
        .is('student_id', null)
        .select('id');
      if (claimErr || !claimed?.length) throw new Error(t('rcClaimFailed'));

      const effectiveDate = nextOccurrenceOfWeekday(Number((fresh as any).target_weekday));

      // 6. Apply the change.
      if ((fresh as any).request_type === 'change') {
        if ((fresh as any).current_slot_kind === 'fixed' && (fresh as any).current_slot_id) {
          // Free the old fixed spot…
          await supabase
            .from('fixed_schedule_slots')
            .update({
              student_id: null,
              is_available: true,
              claimed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (fresh as any).current_slot_id);
          // …and move the coach-assigned recurring slot that mirrors the old
          // time, if the student has one (pending move, effective next week).
          if (req.currentWeekday != null && req.currentStartTime) {
            const { data: mirror } = await supabase
              .from('recurring_lesson_slots')
              .select('id')
              .eq('student_id', (fresh as any).student_id)
              .eq('is_active', true)
              .eq('weekday', req.currentWeekday)
              .eq('start_time', `${req.currentStartTime}:00`);
            for (const m of (mirror ?? []) as any[]) {
              await supabase
                .from('recurring_lesson_slots')
                .update({
                  pending_weekday: Number((fresh as any).target_weekday),
                  pending_start_time: String((fresh as any).target_start_time).slice(0, 8),
                  pending_effective_date: effectiveDate,
                  pending_duration_minutes: Number((fresh as any).target_duration_minutes ?? 60),
                  pending_lesson_type: (fresh as any).target_lesson_type ?? null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', m.id);
            }
          }
        } else if ((fresh as any).current_slot_kind === 'recurring' && (fresh as any).current_slot_id) {
          // Schedule the move on the coach-assigned slot (pending move,
          // effective next week) — the coach's own mechanism.
          await supabase
            .from('recurring_lesson_slots')
            .update({
              pending_weekday: Number((fresh as any).target_weekday),
              pending_start_time: String((fresh as any).target_start_time).slice(0, 8),
              pending_effective_date: effectiveDate,
              pending_duration_minutes: Number((fresh as any).target_duration_minutes ?? 60),
              pending_lesson_type: (fresh as any).target_lesson_type ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (fresh as any).current_slot_id);
        }
      }

      // 7. Regenerate lessons so the pending move takes effect (best effort).
      try {
        await supabase.functions.invoke('generate-recurring-lessons', {
          body: { student_id: (fresh as any).student_id },
        });
      } catch {
        // Non-blocking: lessons regenerate on the next run too.
      }

      // 8. Mark approved.
      await supabase
        .from('recurring_slot_change_requests')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          effective_date: effectiveDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.id);

      // 9. The slot is taken now: auto-deny the other pending requests for
      //    it and notify those students.
      for (const o of otherRows) {
        await supabase
          .from('recurring_slot_change_requests')
          .update({
            status: 'denied',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            review_note: t('rcAutoDeniedNote'),
            updated_at: new Date().toISOString(),
          })
          .eq('id', o.id);
        await notifyStudent(o.student_id, false, req.targetLabel, t('rcAutoDeniedNote'));
      }

      // 10. Notify the approved student.
      await notifyStudent(
        (fresh as any).student_id,
        true,
        req.targetLabel,
        null,
        effectiveDate,
      );

      toast({
        title: t('rcApprovedTitle'),
        description: t('rcApprovedDesc')
          .replace('{name}', req.studentName)
          .replace('{slot}', req.targetLabel),
      });
      invalidate();
    } catch (e: any) {
      toast({
        title: t('rcApproveErrorTitle'),
        description: e?.message || t('rcRequestErrorDesc'),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const denyRequest = async (req: EnrichedRequest) => {
    if (!user?.id || busyId) return;
    setBusyId(req.id);
    try {
      const note = denyNote.trim() || null;
      const { error } = await supabase
        .from('recurring_slot_change_requests')
        .update({
          status: 'denied',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.id)
        .eq('status', 'pending');
      if (error) throw error;
      await notifyStudent(req.student_id, false, req.targetLabel, note);
      toast({ title: t('rcDeniedTitle'), description: t('rcDeniedDesc').replace('{name}', req.studentName) });
      setDenyingId(null);
      setDenyNote('');
      invalidate();
    } catch (e: any) {
      toast({
        title: t('rcApproveErrorTitle'),
        description: e?.message || t('rcRequestErrorDesc'),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (isDemoModeActive()) return null;
  if (!isLoading && sorted.length === 0) return null;

  const planBadge = (plan?: string | null) => {
    const p = (plan ?? '').toLowerCase();
    const label = p ? p.charAt(0).toUpperCase() + p.slice(1) : '—';
    const cls = isPriorityPlan(p)
      ? 'bg-gold-accent/15 text-gold-accent border-gold-accent/40'
      : 'bg-white/5 text-ivory/70 border-white/15';
    return <Badge className={`border ${cls}`}>{label}</Badge>;
  };

  return (
    <div className="glass-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-gold-accent" />
        <h2 className="text-ivory font-heading font-semibold text-lg">{t('rcReviewTitle')}</h2>
        <Badge className="bg-gold-accent/15 text-gold-accent border border-gold-accent/40">
          {sorted.length}
        </Badge>
      </div>
      <p className="text-xs text-ivory/55 leading-relaxed">{t('rcReviewDesc')}</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ivory/60" />
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((req) => (
            <li
              key={req.id}
              className="rounded-2xl px-4 py-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ivory font-semibold">
                    <span className="truncate">{req.studentName}</span>
                    {planBadge(req.plan_at_request)}
                    <Badge variant="outline" className="border-white/15 text-ivory/70">
                      {req.request_type === 'add_second' ? t('rcReviewAddSecond') : t('rcReviewChange')}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs text-ivory/60">
                    {req.currentLabel
                      ? `${t('rcReviewCurrent')}: ${req.currentLabel} → `
                      : ''}
                    {t('rcReviewRequested')}: <span className="text-ivory font-medium">{req.targetLabel}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ivory/40">
                    {new Date(req.created_at).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {denyingId === req.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={denyNote}
                    onChange={(e) => setDenyNote(e.target.value)}
                    placeholder={t('rcReviewDenyNote')}
                    className="bg-white/5 border-white/15 text-ivory text-sm min-h-[64px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === req.id}
                      onClick={() => denyRequest(req)}
                    >
                      {busyId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      {t('rcReviewDenyConfirm')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-ivory"
                      onClick={() => {
                        setDenyingId(null);
                        setDenyNote('');
                      }}
                    >
                      {t('rcReviewCancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === req.id}
                    onClick={() => approveRequest(req)}
                    className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 gap-1.5"
                  >
                    {busyId === req.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {t('rcReviewApprove')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === req.id}
                    onClick={() => setDenyingId(req.id)}
                    className="border-white/15 text-ivory gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    {t('rcReviewDeny')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
