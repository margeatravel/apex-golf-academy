import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { FixedScheduleCalendar, FixedSlot, fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { Lock, Sparkles, ArrowRight, CalendarCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Default coach used by the set_coach_id_default trigger and the booking edge functions. */
const DEFAULT_COACH_ID = '13480fb4-e4d2-423c-b035-c65846b061fc';

export default function StudentFixedSchedule() {
  const { profile, effectivePlan } = useAuth();
  const { t } = useLanguage();
  const weekdays = t('misc.notifDayNames').split(',');
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingClaim, setPendingClaim] = useState<FixedSlot | null>(null);
  const [claiming, setClaiming] = useState(false);

  const hasPaidPlan =
    effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['fixed-schedule-slots', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, student_id, is_available, notes, specific_date, coach_id')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      // Hide one-time open spots whose date has already passed.
      const today = new Date().toISOString().slice(0, 10);
      // Only the student's own coach's spots (assigned_coach_id, else the
      // default coach — same scoping as get-available-slots / book-lesson),
      // and an unclaimed spot only while the coach has it marked available.
      const myCoachId = (profile as any)?.assigned_coach_id ?? DEFAULT_COACH_ID;
      return (data ?? []).filter(
        (s: any) =>
          (!s.specific_date || String(s.specific_date).slice(0, 10) >= today) &&
          (s.coach_id ?? DEFAULT_COACH_ID) === myCoachId &&
          (s.student_id != null || s.is_available === true),
      ) as FixedSlot[];
    },
    enabled: !!profile?.id,
  });

  // Locked view for free/member
  if (!hasPaidPlan) {
    return (
      <div className="app-bg min-h-screen">
        <InternalHeader titleKey="admin.prioritySpotTitle" subtitleKey="admin.prioritySpotStudentSubLock" backTo="/lessons" />
        <main className="container mx-auto px-4 py-10 max-w-2xl">
          <div className="glass-card p-8 sm:p-12 text-center" style={{
            borderColor: 'rgba(240,192,64,0.30)',
            boxShadow: '0 0 0 1px rgba(240,192,64,0.10) inset, 0 8px 32px -16px rgba(240,192,64,0.20)',
          }}>
            <div className="h-16 w-16 rounded-2xl bg-gold-accent/15 border border-gold-accent/30 flex items-center justify-center mx-auto mb-5">
              <Lock className="h-8 w-8 text-gold-accent" />
            </div>
            <h2 className="font-heading text-xl sm:text-2xl text-ivory font-semibold mb-3">
              {t('misc.fixedSchedulePaidTitle')}
            </h2>
            <p className="text-ivory/70 text-sm sm:text-base mb-6 max-w-md mx-auto">
              {t('misc.fixedSchedulePaidDesc')
                .replace('{scratch}', 'Scratch')
                .replace('{pro}', 'Pro')
                .replace('{coach}', t('common.yourCoach'))}
            </p>
            <Button
              onClick={() => navigate('/plans')}
              className="bg-gold-accent text-black hover:bg-gold-accent/90 gap-2 px-6 h-11"
            >
              <Sparkles className="h-4 w-4" />
              {t('misc.fixedScheduleViewPlans')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </main>
        <SocialFooter />
      </div>
    );
  }

  const myClaimedSlot = slots.find((s) => s.student_id === profile?.id);

  const handleClaim = async () => {
    if (!pendingClaim || !profile?.id) return;
    setClaiming(true);
    try {
      // Server-side: validates the paid plan with get_effective_plan and claims
      // the slot atomically so two students can't take the same spot.
      const { data, error } = await supabase.functions.invoke('claim-recurring-slot', {
        body: { slotId: pendingClaim.id },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.message || error?.message || 'claim failed');
      }
      toast({
        title: t('misc.fixedScheduleSpotSecuredTitle'),
        description: t('misc.fixedScheduleSpotSecuredDesc')
          .replace('{day}', weekdays[pendingClaim.day_of_week])
          .replace('{time}', fmtSlotTime(pendingClaim.start_time)),
      });

      // Send confirmation email — non-blocking
      if (profile?.email) {
        supabase.functions
          .invoke('send-notification-email', {
            body: {
              to: profile.email,
              studentName: profile.full_name || 'there',
              notificationType: 'priority_spot_claimed',
              spotDay: weekdays[pendingClaim.day_of_week],
              spotTime: fmtSlotTime(pendingClaim.start_time),
            },
          })
          .catch((err) => console.warn('Priority spot email failed:', err));
      }

      // Notify admin — non-blocking
      supabase.functions
        .invoke('notify-admin', {
          body: {
            eventType: 'priority_spot_claimed',
            studentName: profile?.full_name || profile?.email || 'A student',
            studentEmail: profile?.email,
            spotDay: weekdays[pendingClaim.day_of_week],
            spotTime: fmtSlotTime(pendingClaim.start_time),
          },
        })
        .catch((err) => console.warn('Admin notify (priority spot) failed:', err));

      setPendingClaim(null);
      queryClient.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
      queryClient.invalidateQueries({ queryKey: ['all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
    } catch (e: any) {
      toast({
        title: t('misc.fixedScheduleCouldNotClaimTitle'),
        description: e?.message ?? t('misc.fixedScheduleCouldNotClaimDesc'),
        variant: 'destructive',
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.prioritySpotTitle" subtitleKey="admin.prioritySpotStudentSubPick" backTo="/lessons" />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {myClaimedSlot && (
          <div className="glass-card p-4 sm:p-5 flex items-start gap-4" style={{
            borderColor: 'rgba(240,192,64,0.35)',
          }}>
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gold-accent/15 border border-gold-accent/30 flex items-center justify-center">
              <CalendarCheck className="h-5 w-5 text-gold-accent" />
            </div>
            <div>
              <p className="text-ivory font-heading font-semibold text-sm sm:text-base">
                {t('misc.fixedScheduleConfirmedTitle')}
              </p>
              <p className="text-ivory/70 text-sm mt-0.5">
                {weekdays[myClaimedSlot.day_of_week]} at {fmtSlotTime(myClaimedSlot.start_time)} · {myClaimedSlot.duration_minutes} {t('misc.fixedScheduleMinShort')}
              </p>
              <p className="text-ivory/40 text-xs mt-1">
                {t('misc.fixedScheduleContactToChange').replace('{coach}', t('common.yourCoach'))}
              </p>
            </div>
          </div>
        )}

        {!myClaimedSlot && (
          <div className="glass-card p-4 sm:p-5">
            <p className="text-ivory font-heading font-semibold text-sm sm:text-base">
              {t('misc.fixedScheduleChooseWeeklySpot')}
            </p>
            <p className="text-ivory/60 text-xs sm:text-sm mt-1">
              {t('misc.fixedScheduleTapGreen')
                .split('{green}')
                .map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-green-accent">{t('misc.fixedScheduleGreen')}</span>}
                    {part.replace('{coach}', t('common.yourCoach'))}
                  </span>
                ))}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-ivory/60" />
          </div>
        ) : slots.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-ivory/70 font-medium">{t('misc.fixedScheduleNoneYetTitle')}</p>
            <p className="text-sm text-ivory/40 mt-2">
              {t('misc.fixedScheduleNoneYetDesc')}
            </p>
          </div>
        ) : (
          <FixedScheduleCalendar
            slots={slots}
            variant="student"
            currentUserId={profile?.id}
            onSlotClick={myClaimedSlot ? undefined : (s) => setPendingClaim(s)}
          />
        )}
      </main>

      <SocialFooter />

      <AlertDialog open={!!pendingClaim} onOpenChange={(o) => !o && setPendingClaim(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('misc.fixedScheduleClaimTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingClaim && (
                <>
                  {t('misc.fixedScheduleClaimDescPrefix')} <strong>{weekdays[pendingClaim.day_of_week]} at {fmtSlotTime(pendingClaim.start_time)}</strong> ({pendingClaim.duration_minutes} {t('misc.fixedScheduleMinShort')}) {t('misc.fixedScheduleClaimDescMid').replace('{coach}', t('common.yourCoach'))}
                  <br /><br />
                  {t('misc.fixedScheduleClaimDescOnlyRelease').replace('{coach}', t('common.yourCoach'))}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={claiming}>{t('misc.fixedScheduleCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClaim}
              disabled={claiming}
              className="bg-gold-accent text-black hover:bg-gold-accent/90"
            >
              {claiming && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('misc.fixedScheduleYesClaim')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}