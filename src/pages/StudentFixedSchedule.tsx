import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { Lock, Sparkles, ArrowRight, CalendarCheck, Loader2, Repeat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

/** Offers from the priority-spots edge function (coach-scoped, cadence-aware). */
type Offer = { interval: number; phases: string[] };
type SpotWindow = {
  key: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string | null;
  source: 'open' | 'alternating';
  offers: Offer[];
};
type MySlot = { weekday: number; start_time: string; interval: number; anchor: string | null };

function fmtDate(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function StudentFixedSchedule() {
  const { profile, effectivePlan } = useAuth();
  const { t, language } = useLanguage();
  const es = language === 'es';
  const weekdays = t('misc.notifDayNames').split(',');
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<SpotWindow | null>(null);
  const [interval, setIntervalWeeks] = useState<number>(1);
  const [phases, setPhases] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);

  const hasPaidPlan =
    effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';

  const cadenceLabel = (n: number) =>
    n === 1 ? (es ? 'Semanal' : 'Weekly') : es ? `Cada ${n} semanas` : `Every ${n} weeks`;

  const { data, isLoading } = useQuery({
    queryKey: ['priority-spots', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('priority-spots', {
        body: { action: 'list', studentId: profile?.id },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      return data as { windows: SpotWindow[]; mine: MySlot[] };
    },
    enabled: !!profile?.id && hasPaidPlan,
  });
  const windows = data?.windows ?? [];
  const mine = data?.mine ?? [];

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

  const openDialog = (w: SpotWindow) => {
    const first = w.offers[0];
    setPending(w);
    setIntervalWeeks(first.interval);
    setPhases([first.phases[0]]);
  };
  const currentOffer = pending?.offers.find((o) => o.interval === interval) ?? null;
  const pickInterval = (n: number) => {
    const o = pending?.offers.find((x) => x.interval === n);
    setIntervalWeeks(n);
    setPhases(o ? [o.phases[0]] : []);
  };
  const togglePhase = (p: string) => {
    if (interval === 1) return setPhases([p]);
    setPhases((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };

  const handleClaim = async () => {
    if (!pending || !profile?.id || phases.length === 0) return;
    setClaiming(true);
    try {
      // Student previews run on the coach's session — never claim for the coach.
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.user.id !== profile.id) {
        throw new Error(es ? 'Vista previa: no se puede apartar un horario.' : 'Preview mode: spots cannot be claimed.');
      }
      // Server re-validates plan, coach and cadence conflicts, then creates the
      // recurring slot(s) and generates the lessons.
      const { data: res, error } = await supabase.functions.invoke('priority-spots', {
        body: { action: 'claim', weekday: pending.weekday, start_time: pending.start_time, interval, phases },
      });
      if (error || (res as any)?.error) {
        throw new Error((res as any)?.message || error?.message || 'claim failed');
      }
      const day = weekdays[pending.weekday];
      const time = fmtSlotTime(pending.start_time);
      toast({
        title: t('misc.fixedScheduleSpotSecuredTitle'),
        description: `${day} ${time} · ${cadenceLabel(interval)}`,
      });

      if (profile?.email) {
        supabase.functions
          .invoke('send-notification-email', {
            body: {
              to: profile.email,
              studentName: profile.full_name || 'there',
              notificationType: 'priority_spot_claimed',
              spotDay: day,
              spotTime: time,
            },
          })
          .catch((err) => console.warn('Priority spot email failed:', err));
      }
      supabase.functions
        .invoke('notify-admin', {
          body: {
            eventType: 'priority_spot_claimed',
            studentName: profile?.full_name || profile?.email || 'A student',
            studentEmail: profile?.email,
            spotDay: day,
            spotTime: `${time} (${cadenceLabel(interval)})`,
          },
        })
        .catch((err) => console.warn('Admin notify (priority spot) failed:', err));

      setPending(null);
      queryClient.invalidateQueries({ queryKey: ['priority-spots'] });
      queryClient.invalidateQueries({ queryKey: ['visible-recurring-slots'] });
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

  const byDay = [0, 1, 2, 3, 4, 5, 6]
    .map((d) => ({ d, items: windows.filter((w) => w.weekday === d) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.prioritySpotTitle" subtitleKey="admin.prioritySpotStudentSubPick" backTo="/lessons" />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {mine.length > 0 && (
          <div className="glass-card p-4 sm:p-5 flex items-start gap-4" style={{ borderColor: 'rgba(240,192,64,0.35)' }}>
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gold-accent/15 border border-gold-accent/30 flex items-center justify-center">
              <CalendarCheck className="h-5 w-5 text-gold-accent" />
            </div>
            <div>
              <p className="text-ivory font-heading font-semibold text-sm sm:text-base">
                {t('misc.fixedScheduleConfirmedTitle')}
              </p>
              {mine.map((m, i) => (
                <p key={i} className="text-ivory/70 text-sm mt-0.5">
                  {weekdays[m.weekday]} · {fmtSlotTime(m.start_time)} · {cadenceLabel(m.interval)}
                </p>
              ))}
              <p className="text-ivory/40 text-xs mt-1">
                {t('misc.fixedScheduleContactToChange').replace('{coach}', t('common.yourCoach'))}
              </p>
            </div>
          </div>
        )}

        <div className="glass-card p-4 sm:p-5">
          <p className="text-ivory font-heading font-semibold text-sm sm:text-base">
            {t('misc.fixedScheduleChooseWeeklySpot')}
          </p>
          <p className="text-ivory/60 text-xs sm:text-sm mt-1">
            {es
              ? 'Toca un horario y elige si vienes cada semana, cada 2 o cada 3 semanas. Los horarios "cada N semanas" se alternan con otros alumnos.'
              : 'Tap a spot and choose weekly, every 2 or every 3 weeks. "Every N weeks" spots alternate with other students.'}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-ivory/60" />
          </div>
        ) : byDay.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-ivory/70 font-medium">{t('misc.fixedScheduleNoneYetTitle')}</p>
            <p className="text-sm text-ivory/40 mt-2">{t('misc.fixedScheduleNoneYetDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {byDay.map((g) => (
              <div key={g.d} className="glass-card p-4 sm:p-5">
                <p className="text-ivory font-heading font-semibold">{weekdays[g.d]}</p>
                <div className="mt-3 space-y-3">
                  {g.items.map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => openDialog(w)}
                      className="w-full text-left rounded-2xl border px-4 py-3 transition-colors hover:bg-white/5"
                      style={{ background: 'rgba(74,124,89,0.10)', borderColor: 'rgba(74,124,89,0.35)' }}
                    >
                      <p className="text-ivory font-heading text-lg">{fmtSlotTime(w.start_time)}</p>
                      <p className="text-ivory/50 text-xs mt-0.5">
                        {w.duration_minutes} {t('misc.fixedScheduleMinShort')}{w.lesson_type ? ` · ${w.lesson_type}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {w.offers.map((o) => (
                          <span
                            key={o.interval}
                            className="text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                            style={o.interval === 1
                              ? { background: 'rgba(74,124,89,0.25)', color: '#7CC598' }
                              : { background: 'rgba(240,192,64,0.15)', color: '#F0C040' }}
                          >
                            {o.interval > 1 && <Repeat className="h-3 w-3" />}
                            {cadenceLabel(o.interval)}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <SocialFooter />

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('misc.fixedScheduleClaimTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left">
                {pending && (
                  <p>
                    <strong>{weekdays[pending.weekday]} · {fmtSlotTime(pending.start_time)}</strong> ({pending.duration_minutes} {t('misc.fixedScheduleMinShort')})
                  </p>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide mb-2">{es ? 'Frecuencia' : 'Frequency'}</p>
                  <div className="flex flex-wrap gap-2">
                    {pending?.offers.map((o) => (
                      <button
                        key={o.interval}
                        type="button"
                        onClick={() => pickInterval(o.interval)}
                        className="px-3 py-1.5 rounded-full border text-sm"
                        style={interval === o.interval
                          ? { background: '#F0C040', color: '#000', borderColor: '#F0C040' }
                          : { borderColor: 'rgba(255,255,255,0.2)' }}
                      >
                        {cadenceLabel(o.interval)}
                      </button>
                    ))}
                  </div>
                </div>
                {currentOffer && (
                  <div>
                    <p className="text-xs uppercase tracking-wide mb-2">
                      {interval === 1
                        ? (es ? 'Empiezas' : 'Starts')
                        : (es ? 'Semanas que tomas (puedes elegir más de una)' : 'Weeks you take (pick one or more)')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentOffer.phases.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePhase(p)}
                          className="px-3 py-1.5 rounded-xl border text-sm"
                          style={phases.includes(p)
                            ? { background: 'rgba(74,124,89,0.35)', borderColor: '#7CC598' }
                            : { borderColor: 'rgba(255,255,255,0.2)' }}
                        >
                          {fmtDate(p, language)}
                        </button>
                      ))}
                    </div>
                    {interval > 1 && (
                      <p className="text-xs mt-2 opacity-70">
                        {es
                          ? `Cada fecha que elijas se repite cada ${interval} semanas.`
                          : `Each date you pick repeats every ${interval} weeks.`}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs opacity-70">
                  {t('misc.fixedScheduleClaimDescOnlyRelease').replace('{coach}', t('common.yourCoach'))}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={claiming}>{t('misc.fixedScheduleCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleClaim(); }}
              disabled={claiming || phases.length === 0}
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
