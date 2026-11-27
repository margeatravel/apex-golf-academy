import { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Calendar as CalIcon, ChevronLeft, ChevronRight, Clock, Check, AlertCircle,
  CalendarPlus, Banknote, CreditCard, Repeat, Ticket, Lock, Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { openGoogleCalendar } from '@/lib/addToGoogleCalendar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { fmtMXNStr } from '@/lib/formatCurrency';
import { useCoachLessonPricing } from '@/hooks/useCoachLessonPricing';
import { localeFor } from '@/lib/uiLocale';
import { formatLessonDate } from '@/lib/formatLessonDateTime';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const TZ = 'America/Cancun';
const LESSON_TYPES = ['Range', 'Playing Lesson'];

function todayCancunISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfMonthISO(iso: string): string {
  return iso.slice(0, 8) + '01';
}
function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, '0')}`;
}
function fmtMonthLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00-05:00`);
  const s = new Intl.DateTimeFormat(locale, { timeZone: TZ, month: 'long', year: 'numeric' }).format(d);
  return locale.startsWith('es') ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function fmtTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface InternalBookingModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-select a date (YYYY-MM-DD) and jump past the calendar picker */
  prefillDate?: string | null;
  /** Pre-select a time slot (HH:MM) and jump past the time picker */
  prefillTime?: string | null;
}

type DayData = { date: string; slots: string[] };
type BookingMode = null | 'fixed' | 'single';
type FixedSlotRow = {
  id: string; day_of_week: number; start_time: string; duration_minutes: number; lesson_type: string | null;
};
type PkgRow = { id: string; classes_remaining: number; package_size: number | null };

export function InternalBookingModal({ open, onOpenChange, prefillDate, prefillTime }: InternalBookingModalProps) {
  const { profile, effectivePlan, previewCoachPricingId } = useAuth();
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const isES = locale.startsWith('es');
  const dayNames = t('misc.notifDayNames').split(',');
  const qc = useQueryClient();
  const navigate = useNavigate();

  const today = todayCancunISO();
  const [monthCursor, setMonthCursor] = useState<string>(startOfMonthISO(today));
  const [days, setDays] = useState<DayData[]>([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Step 0 — what kind of booking
  const [mode, setMode] = useState<BookingMode>(null);
  const [showPlanGate, setShowPlanGate] = useState(false);
  const [fixedSlotId, setFixedSlotId] = useState<string | null>(null);
  const [fixedDone, setFixedDone] = useState<FixedSlotRow | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [lessonType, setLessonType] = useState<string>('Range');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'package' | 'cash_transfer' | 'card'>('package');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const lessonTypeLabel = (v: string) =>
    v === 'Range' ? t('misc.bookingLessonTypeRange')
      : v === 'Playing Lesson' ? t('misc.bookingLessonTypePlaying')
      : v;

  const fmtFullDate = (iso: string) => formatLessonDate({ lesson_date: iso }, 'fullLong', locale);

  // Fixed weekly spots are a paid-membership benefit. Uses the same effective
  // plan source as the server (`get_effective_plan` / `getEffectivePlan`).
  const canBookFixed = effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';

  // Only Apex members get free lesson coverage by their membership.
  const isApexMember = effectivePlan === 'apex';

  // Dynamic Stripe price (per-coach, controlled by each coach in Settings)
  const { data: pricingSettings } = useCoachLessonPricing(
    previewCoachPricingId ?? profile?.assigned_coach_id,
  );
  const resolvedPriceId: string = (() => {
    const fallback = 'price_1TKkH3Rw8gEMe8Y7UDdvRlDv';
    const proPrice = pricingSettings?.pro_individual_price_id;
    if (effectivePlan === 'pro' && proPrice) return proPrice;
    return pricingSettings?.individual_price_id || fallback;
  })();
  const resolvedDisplayPrice: number = (() => {
    if (effectivePlan === 'pro' && pricingSettings?.pro_individual_price) {
      return Number(pricingSettings.pro_individual_price);
    }
    return Number(pricingSettings?.individual_price ?? 1650);
  })();

  // Packages the student owns OR shares, with credits left.
  const { data: packages = [], isLoading: pkgLoading, isError: pkgError } = useQuery({
    queryKey: ['booking-available-packages', profile?.id],
    enabled: !!open && !!profile?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('package_members')
        .select('package_id')
        .eq('student_id', profile!.id);
      const memberIds = (memberships ?? []).map((m: any) => m.package_id as string);
      let q = supabase
        .from('class_packages')
        .select('id, classes_remaining, package_size')
        .eq('is_active', true)
        .gt('classes_remaining', 0);
      q = memberIds.length
        ? q.or(`user_id.eq.${profile!.id},id.in.(${memberIds.join(',')})`)
        : q.eq('user_id', profile!.id);
      const { data, error } = await q.order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PkgRow[];
    },
  });

  // Open weekly spots (unclaimed recurring slots) for the fixed-schedule flow.
  const { data: fixedSlots = [], isLoading: fixedLoading } = useQuery({
    queryKey: ['booking-open-fixed-slots'],
    enabled: !!open && mode === 'fixed' && canBookFixed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, specific_date')
        .is('student_id', null)
        .eq('is_available', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s: any) => !s.specific_date) as FixedSlotRow[];
    },
  });

  // Safety timeout: if profile is slow to load, don't block the user forever.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (!open) { setAuthTimedOut(false); return; }
    if (profile?.id) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [open, profile?.id]);

  const hasActivePackage: boolean | null = (() => {
    if (pkgError) return false;
    if (!profile?.id) return authTimedOut ? false : null;
    if (pkgLoading) return null;
    return packages.length > 0;
  })();

  // Default: package when available (student still confirms it explicitly), card otherwise.
  useEffect(() => {
    if (hasActivePackage === false) setPaymentMethod((p) => (p === 'package' ? 'card' : p));
    if (hasActivePackage === true && packages.length && !selectedPackageId) {
      setSelectedPackageId(packages[0].id);
    }
  }, [hasActivePackage, packages, selectedPackageId]);

  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    lessonsRemaining: number | null;
    isSubscriber: boolean;
    paidWith: 'package' | 'membership' | 'card' | 'cash_transfer';
  } | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedDate(null);
      setSelectedTime(null);
      setNotes('');
      setStep(1);
      setMode(null);
      setShowPlanGate(false);
      setFixedSlotId(null);
      setFixedDone(null);
      setMonthCursor(startOfMonthISO(today));
      setConfirmation(null);
      setPaymentMethod('package');
      setSelectedPackageId(null);
      setAuthTimedOut(false);
    }
  }, [open, today]);

  // Handle prefill: skip the type step and jump into the single-lesson flow.
  useEffect(() => {
    if (open && prefillDate) {
      setMode('single');
      setSelectedDate(prefillDate);
      setMonthCursor(startOfMonthISO(prefillDate));
      if (prefillTime) {
        setSelectedTime(prefillTime);
        setStep(3);
      } else {
        setStep(2);
      }
    }
  }, [open, prefillDate, prefillTime]);

  // Load month availability + subscribe to live changes from coach calendar.
  useEffect(() => {
    if (!open || mode !== 'single') return;
    let cancelled = false;
    const start = monthCursor < today ? today : monthCursor;
    const end = endOfMonthISO(monthCursor);

    const fetchAvailability = (showSpinner = true) => {
      if (showSpinner) setLoadingDays(true);
      setLoadError(null);
      return supabase.auth.getSession().then(({ data: sess }) => fetch(
        `${SUPABASE_URL}/functions/v1/get-available-slots?startDate=${start}&endDate=${end}`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${sess.session?.access_token ?? SUPABASE_KEY}` } },
      ))
        .then(async (r) => {
          const text = await r.text();
          let body: any;
          try { body = JSON.parse(text); } catch { body = { error: text }; }
          if (!r.ok) throw new Error(body?.error || t('misc.bookingLoadFailed'));
          return body;
        })
        .then((data) => {
          if (cancelled) return;
          setDays(data.days ?? []);
        })
        .catch((e) => {
          if (cancelled) return;
          setLoadError(e.message);
          setDays([]);
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoadingDays(false);
        });
    };

    fetchAvailability(true);

    const channel = supabase
      .channel(`booking-availability-${start}-${end}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_schedule_slots' }, () => fetchAvailability(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, () => fetchAvailability(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_availability_blocks' }, () => fetchAvailability(false))
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [open, mode, monthCursor, today]);

  // Build calendar grid for current month
  const grid = useMemo(() => {
    const monthStart = monthCursor;
    const [y, m] = monthStart.split('-').map(Number);
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: Array<{ iso: string | null; available: boolean; isToday: boolean; isPast: boolean }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ iso: null, available: false, isToday: false, isPast: false });
    const slotsMap = new Map(days.map((d) => [d.date, d.slots.length] as const));
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const iso = `${monthStart.slice(0, 8)}${String(dayNum).padStart(2, '0')}`;
      const isPast = iso < today;
      const slotsCount = slotsMap.get(iso) ?? 0;
      cells.push({ iso, available: !isPast && slotsCount > 0, isToday: iso === today, isPast });
    }
    return cells;
  }, [days, monthCursor, today]);

  const weekdayInitials = useMemo(
    () => dayNames.map((d) => (d || '').charAt(0).toUpperCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return days.find((d) => d.date === selectedDate)?.slots ?? [];
  }, [days, selectedDate]);

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;

  function handlePickDate(iso: string) {
    setSelectedDate(iso);
    setSelectedTime(null);
    setStep(2);
  }

  function handlePickType(next: 'fixed' | 'single') {
    if (next === 'fixed' && !canBookFixed) {
      setShowPlanGate(true);
      return;
    }
    setShowPlanGate(false);
    setMode(next);
    setStep(1);
  }

  async function handleClaimFixed() {
    if (!fixedSlotId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('claim-recurring-slot', {
        body: { slotId: fixedSlotId },
      });
      const err = (data as any)?.error;
      if (error || err) {
        const code = err ?? '';
        toast.error(
          code === 'taken' ? t('misc.bookingFixedTaken')
            : code === 'plan_required' ? t('misc.bookingFixedLockedDesc')
            : (data as any)?.message || t('misc.bookingCouldNotBook'),
        );
        qc.invalidateQueries({ queryKey: ['booking-open-fixed-slots'] });
        return;
      }
      setFixedDone((data as any)?.slot ?? fixedSlots.find((s) => s.id === fixedSlotId) ?? null);
      qc.invalidateQueries({ queryKey: ['booking-open-fixed-slots'] });
      qc.invalidateQueries({ queryKey: ['fixed-schedule-slots'] });
      qc.invalidateQueries({ queryKey: ['visible-recurring-slots'] });
      qc.invalidateQueries({ queryKey: ['all-lessons'] });
    } catch (e: any) {
      toast.error(e?.message ?? t('misc.bookingFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        toast.error(t('misc.bookingSignInAgain'));
        return;
      }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/book-lesson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonDate: selectedDate,
          lessonTime: selectedTime,
          lessonType,
          notes: notes || undefined,
          paymentMethod: paymentMethod === 'cash_transfer' ? 'cash_transfer'
            : paymentMethod === 'card' ? 'card'
            : undefined,
          packageId: paymentMethod === 'package' ? (selectedPackageId ?? undefined) : undefined,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(body?.message || body?.error || t('misc.bookingCouldNotBook'));
        setMonthCursor((c) => c);
        return;
      }
      qc.invalidateQueries({ queryKey: ['all-lessons'] });
      qc.invalidateQueries({ queryKey: ['student-upcoming-lessons'] });
      qc.invalidateQueries({ queryKey: ['next-lesson'] });
      qc.invalidateQueries({ queryKey: ['student-active-package'] });
      qc.invalidateQueries({ queryKey: ['class-packages'] });
      const paidWith: 'package' | 'membership' | 'card' | 'cash_transfer' =
        body?.paidWith ??
        (paymentMethod === 'card' ? 'card'
          : paymentMethod === 'cash_transfer' ? 'cash_transfer'
          : (typeof body?.lessonsRemaining === 'number' ? 'package' : 'membership'));
      const remaining = typeof body?.lessonsRemaining === 'number' ? body.lessonsRemaining : null;
      setConfirmation({ lessonsRemaining: remaining, isSubscriber: !!body?.isSubscriber, paidWith });

      // If student chose card payment, redirect to Stripe checkout after booking
      if (body?.needsStripeCheckout) {
        try {
          const checkoutRes = await supabase.functions.invoke('create-checkout', {
            body: { priceId: resolvedPriceId, mode: 'payment', metadata: { lesson_id: body.lessonId } },
          });
          const checkoutUrl = checkoutRes.data?.url;
          if (checkoutRes.error || !checkoutUrl) {
            console.error('create-checkout failed', checkoutRes.error, checkoutRes.data);
            toast.error(t('misc.bookingCheckoutError'));
          } else {
            window.location.assign(checkoutUrl);
            return;
          }
        } catch (e: any) {
          console.error('create-checkout threw', e);
          toast.error(t('misc.bookingCheckoutError'));
        }
      }

      setStep(4);
    } catch (e: any) {
      toast.error(e?.message ?? t('misc.bookingFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const canPrevMonth = monthCursor > startOfMonthISO(today);
  const slotsByDay = useMemo(() => {
    const grouped: Record<number, FixedSlotRow[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    fixedSlots.forEach((s) => grouped[s.day_of_week]?.push(s));
    return grouped;
  }, [fixedSlots]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-2xl sm:h-auto sm:max-h-[90vh] sm:w-auto flex flex-col p-0 gap-0 overflow-hidden glass-card rounded-3xl sm:rounded-3xl"
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        <DialogHeader
          className="shrink-0 px-5 sm:px-6 pb-3 border-b border-white/10"
          style={{ paddingTop: '1.25rem' }}
        >
          <DialogTitle className="text-ivory font-heading flex items-center gap-2">
            <CalIcon className="h-5 w-5 text-gold-accent" />
            {t('misc.bookingTitle')}
          </DialogTitle>
          <DialogDescription className="text-ivory/60 text-xs">
            {t('misc.bookingSubtitle').replace('{coach}', t('common.yourCoach'))}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="shrink-0 px-5 sm:px-6 py-2 flex items-center gap-2 text-xs text-ivory/50 border-b border-white/5">
          <span className={mode === null ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepType')}</span>
          <ChevronRight className="h-3 w-3" />
          {mode === 'fixed' ? (
            <>
              <span className={!fixedDone ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepSpot')}</span>
              <ChevronRight className="h-3 w-3" />
              <span className={fixedDone ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepDone')}</span>
            </>
          ) : (
            <>
              <span className={mode === 'single' && step === 1 ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepDate')}</span>
              <ChevronRight className="h-3 w-3" />
              <span className={mode === 'single' && step === 2 ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepTime')}</span>
              <ChevronRight className="h-3 w-3" />
              <span className={mode === 'single' && step === 3 ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepConfirm')}</span>
              <ChevronRight className="h-3 w-3" />
              <span className={mode === 'single' && step === 4 ? 'text-gold-accent font-semibold' : ''}>{t('misc.bookingStepDone')}</span>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
          {/* STEP 0 — Booking type */}
          {mode === null && (
            <div className="space-y-4">
              <p className="text-ivory font-heading text-base">{t('misc.bookingTypeTitle')}</p>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handlePickType('fixed')}
                  className="flex items-center gap-3 px-4 py-4 rounded-xl border text-left transition-all bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
                >
                  <Repeat className="h-5 w-5 text-gold-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-ivory text-sm font-medium">{t('misc.bookingTypeFixed')}</p>
                    <p className="text-ivory/40 text-xs">{t('misc.bookingTypeFixedDesc')}</p>
                  </div>
                  {!canBookFixed && <Lock className="h-4 w-4 text-ivory/40 ml-auto shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handlePickType('single')}
                  className="flex items-center gap-3 px-4 py-4 rounded-xl border text-left transition-all bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
                >
                  <CalIcon className="h-5 w-5 text-green-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-ivory text-sm font-medium">{t('misc.bookingTypeSingle')}</p>
                    <p className="text-ivory/40 text-xs">{t('misc.bookingTypeSingleDesc')}</p>
                  </div>
                </button>
              </div>

              {showPlanGate && (
                <div className="rounded-xl px-4 py-3 space-y-3" style={{
                  background: 'rgba(240,192,64,0.10)',
                  border: '1px solid rgba(240,192,64,0.35)',
                }}>
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#F0C040' }} />
                    <div>
                      <p className="text-ivory text-sm font-medium">{t('misc.bookingFixedLockedTitle')}</p>
                      <p className="text-ivory/60 text-xs mt-0.5">{t('misc.bookingFixedLockedDesc')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-gold-accent text-black hover:bg-gold-accent/90"
                      onClick={() => { onOpenChange(false); navigate('/plans'); }}
                    >
                      {t('misc.bookingViewPlans')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handlePickType('single')}>
                      {t('misc.bookingChooseSingleInstead')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FIXED SCHEDULE — pick a weekly spot */}
          {mode === 'fixed' && !fixedDone && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setMode(null); setFixedSlotId(null); }}
                className="flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory"
              >
                <ChevronLeft className="h-4 w-4" /> {t('misc.bookingBack')}
              </button>
              <div>
                <p className="text-ivory font-heading text-lg">{t('misc.bookingFixedPickTitle')}</p>
                <p className="text-ivory/50 text-xs">{t('misc.bookingFixedPickDesc')}</p>
              </div>

              {fixedLoading ? (
                <div className="flex items-center justify-center py-12 text-ivory/60">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('misc.bookingLoadingAvailability')}
                </div>
              ) : fixedSlots.length === 0 ? (
                <p className="text-ivory/50 text-sm py-4">{t('misc.bookingFixedNone')}</p>
              ) : (
                <div className="space-y-4">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const daySlots = slotsByDay[d];
                    if (!daySlots.length) return null;
                    return (
                      <div key={d} className="space-y-2">
                        <p className="text-[10px] text-ivory/50 uppercase tracking-wider">{dayNames[d]}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {daySlots.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setFixedSlotId(s.id)}
                              className={[
                                'px-3 py-3 rounded-lg border text-sm font-medium transition-all',
                                fixedSlotId === s.id
                                  ? 'bg-gold-accent/20 border-gold-accent/60 text-ivory ring-1 ring-gold-accent'
                                  : 'bg-green-accent/10 border-green-accent/30 text-ivory hover:bg-green-accent/25 active:scale-95',
                              ].join(' ')}
                            >
                              {fmtTime12(s.start_time)}
                              <span className="block text-[10px] text-ivory/50 font-normal">
                                {s.duration_minutes} {t('misc.bookingMinShort')}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* FIXED SCHEDULE — success */}
          {mode === 'fixed' && fixedDone && (
            <div className="space-y-5 text-center pt-4">
              <div
                className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(124,197,152,0.18)',
                  border: '1px solid rgba(124,197,152,0.45)',
                  boxShadow: '0 0 24px rgba(124,197,152,0.35)',
                }}
              >
                <Check className="h-8 w-8" style={{ color: '#7CC598' }} />
              </div>
              <div>
                <h3 className="text-ivory font-heading text-xl">{t('misc.bookingFixedDoneTitle')}</h3>
                <p className="text-ivory/60 text-sm mt-1">
                  {t('misc.bookingFixedDoneDesc')
                    .replace('{day}', dayNames[fixedDone.day_of_week] ?? '')
                    .replace('{time}', fmtTime12(fixedDone.start_time))}
                </p>
              </div>
            </div>
          )}

          {/* STEP 1 — Date */}
          {mode === 'single' && step === 1 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory"
              >
                <ChevronLeft className="h-4 w-4" /> {t('misc.bookingBack')}
              </button>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setMonthCursor((c) => addDaysISO(startOfMonthISO(c), -1).slice(0, 8) + '01')}
                  disabled={!canPrevMonth || loadingDays}
                  className="text-ivory/70 hover:text-ivory"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-ivory font-heading text-base">{fmtMonthLabel(monthCursor, locale)}</div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setMonthCursor((c) => {
                    const [y, m] = c.split('-').map(Number);
                    const next = new Date(Date.UTC(y, m, 1));
                    return next.toISOString().slice(0, 10).slice(0, 8) + '01';
                  })}
                  disabled={loadingDays}
                  className="text-ivory/70 hover:text-ivory"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ivory/50 uppercase tracking-wide">
                {weekdayInitials.map((d, i) => <div key={i}>{d}</div>)}
              </div>

              {loadingDays ? (
                <div className="flex items-center justify-center py-12 text-ivory/60">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('misc.bookingLoadingAvailability')}
                </div>
              ) : loadError ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {loadError}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1.5">
                  {grid.map((cell, i) => {
                    if (!cell.iso) return <div key={i} />;
                    const isSelected = selectedDate === cell.iso;
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        disabled={!cell.available}
                        onClick={() => handlePickDate(cell.iso!)}
                        className={[
                          'aspect-square rounded-lg text-sm font-medium transition-all',
                          'border',
                          cell.available
                            ? 'bg-green-accent/10 border-green-accent/30 text-ivory hover:bg-green-accent/25 hover:scale-[1.04] active:scale-95'
                            : 'bg-white/[0.02] border-white/5 text-ivory/25 cursor-not-allowed',
                          isSelected ? 'ring-2 ring-gold-accent bg-gold-accent/15 border-gold-accent/50' : '',
                          cell.isToday ? 'underline decoration-gold-accent underline-offset-2' : '',
                        ].join(' ')}
                      >
                        {Number(cell.iso.slice(8))}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-ivory/40 text-xs text-center">{t('misc.bookingGreenHint')}</p>
            </div>
          )}

          {/* STEP 2 — Time */}
          {mode === 'single' && step === 2 && selectedDate && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory"
              >
                <ChevronLeft className="h-4 w-4" /> {t('misc.bookingBackToCalendar')}
              </button>
              <div>
                <p className="text-ivory font-heading text-lg">{fmtFullDate(selectedDate)}</p>
                <p className="text-ivory/50 text-xs">{t('misc.bookingPickTime')}</p>
              </div>
              {slotsForSelectedDate.length === 0 ? (
                <p className="text-ivory/50 text-sm py-4">{t('misc.bookingNoAvailability')}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {slotsForSelectedDate.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSelectedTime(s); setStep(3); }}
                      className={[
                        'px-3 py-3 rounded-lg border text-sm font-medium transition-all',
                        selectedTime === s
                          ? 'bg-gold-accent/20 border-gold-accent/60 text-ivory ring-1 ring-gold-accent'
                          : 'bg-green-accent/10 border-green-accent/30 text-ivory hover:bg-green-accent/25 active:scale-95',
                      ].join(' ')}
                    >
                      {fmtTime12(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Confirm */}
          {mode === 'single' && step === 3 && selectedDate && selectedTime && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory"
              >
                <ChevronLeft className="h-4 w-4" /> {t('misc.bookingPickDifferentTime')}
              </button>
              <div className="rounded-xl bg-green-accent/10 border border-green-accent/30 px-4 py-3 flex items-center gap-3">
                <Clock className="h-5 w-5 text-green-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-ivory font-medium text-sm">{fmtFullDate(selectedDate)}</p>
                  <p className="text-ivory/70 text-sm">
                    {fmtTime12(selectedTime)} · {t('misc.bookingWithCoach').replace('{coach}', t('common.yourCoach'))}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-ivory/80">{t('misc.bookingLessonType')}</Label>
                <Select value={lessonType} onValueChange={setLessonType}>
                  <SelectTrigger className="mt-1"><SelectValue>{lessonTypeLabel(lessonType)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {LESSON_TYPES.map((v) => (<SelectItem key={v} value={v}>{lessonTypeLabel(v)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment method */}
              <div className="space-y-2">
                <Label className="text-ivory/80">{t('misc.bookingPaymentMethod')}</Label>
                {hasActivePackage === null ? (
                  <div className="flex items-center gap-2 py-3 text-ivory/50 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t('misc.bookingCheckingAccount')}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      {packages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('package')}
                          className={[
                            'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                            paymentMethod === 'package'
                              ? 'bg-green-accent/10 border-green-accent/40 ring-1 ring-green-accent/30'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]',
                          ].join(' ')}
                        >
                          <Ticket className="h-4 w-4 text-green-accent shrink-0" />
                          <div>
                            <p className="text-ivory text-sm font-medium">{t('misc.bookingUsePackage')}</p>
                            <p className="text-ivory/40 text-xs">
                              {t('misc.bookingUsePackageDesc').replace(
                                '{n}',
                                String(selectedPackage?.classes_remaining ?? packages[0].classes_remaining),
                              )}
                            </p>
                          </div>
                        </button>
                      )}

                      {paymentMethod === 'package' && packages.length > 1 && (
                        <div className="pl-1">
                          <Label className="text-ivory/60 text-xs">{t('misc.bookingChoosePackage')}</Label>
                          <Select
                            value={selectedPackageId ?? packages[0].id}
                            onValueChange={setSelectedPackageId}
                          >
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {packages.map((p, i) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {t('misc.bookingPackageOption')
                                    .replace('{i}', String(i + 1))
                                    .replace('{n}', String(p.classes_remaining))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={[
                          'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                          paymentMethod === 'card'
                            ? 'bg-green-accent/10 border-green-accent/40 ring-1 ring-green-accent/30'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <CreditCard className="h-4 w-4 text-green-accent shrink-0" />
                        <div>
                          <p className="text-ivory text-sm font-medium">{t('misc.bookingPayCard')}</p>
                          <p className="text-ivory/40 text-xs">
                            {t('misc.bookingPayCardDesc').replace('{price}', fmtMXNStr(resolvedDisplayPrice))}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash_transfer')}
                        className={[
                          'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                          paymentMethod === 'cash_transfer'
                            ? 'bg-gold-accent/10 border-gold-accent/40 ring-1 ring-gold-accent/30'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <Banknote className="h-4 w-4 text-gold-accent shrink-0" />
                        <div>
                          <p className="text-ivory text-sm font-medium">{t('misc.bookingPayCash')}</p>
                          <p className="text-ivory/40 text-xs">
                            {t('misc.bookingPayCashDesc').replace('{coach}', t('common.yourCoach'))}
                          </p>
                        </div>
                      </button>
                    </div>
                    {paymentMethod === 'package' && (
                      <p className="text-green-accent/70 text-xs px-1">{t('misc.bookingPackageHint')}</p>
                    )}
                    {paymentMethod === 'card' && (
                      <p className="text-green-accent/70 text-xs px-1">{t('misc.bookingCardHint')}</p>
                    )}
                    {paymentMethod === 'cash_transfer' && (
                      <p className="text-gold-accent/70 text-xs px-1">{t('misc.bookingCashHint')}</p>
                    )}
                  </>
                )}
              </div>

              <div>
                <Label className="text-ivory/80">{t('misc.bookingNotes')}</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('misc.bookingNotesPlaceholder')}
                  className="mt-1"
                />
              </div>
              <p className="text-ivory/50 text-xs">
                {t('misc.bookingBookingAs')}{' '}
                <span className="text-ivory/70">{profile?.full_name || profile?.email}</span>
              </p>
            </div>
          )}

          {/* STEP 4 — Success */}
          {mode === 'single' && step === 4 && selectedDate && selectedTime && (
            <div className="space-y-5 text-center pt-4">
              <div
                className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(124,197,152,0.18)',
                  border: '1px solid rgba(124,197,152,0.45)',
                  boxShadow: '0 0 24px rgba(124,197,152,0.35)',
                }}
              >
                <Check className="h-8 w-8" style={{ color: '#7CC598' }} />
              </div>
              <div>
                <h3 className="text-ivory font-heading text-xl">{t('misc.bookingConfirmedTitle')}</h3>
                <p className="text-ivory/60 text-sm mt-1">
                  {t('misc.bookingConfirmedDesc').replace('{coach}', t('common.yourCoach'))}
                </p>
              </div>

              <div
                className="text-left rounded-xl px-4 py-3 space-y-2"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-ivory/55 text-[11px] uppercase tracking-wider">{t('misc.bookingDate')}</span>
                  <span className="text-ivory text-sm font-medium">{fmtFullDate(selectedDate)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ivory/55 text-[11px] uppercase tracking-wider">{t('misc.bookingTime')}</span>
                  <span className="text-ivory text-sm font-medium">{fmtTime12(selectedTime)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ivory/55 text-[11px] uppercase tracking-wider">{t('misc.bookingTypeLabel')}</span>
                  <span className="text-ivory text-sm font-medium">{lessonTypeLabel(lessonType)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ivory/55 text-[11px] uppercase tracking-wider">{t('misc.bookingCoach')}</span>
                  <span className="text-ivory text-sm font-medium">{t('common.yourCoach')}</span>
                </div>
              </div>

              {confirmation?.paidWith === 'package' &&
                confirmation?.lessonsRemaining !== null &&
                confirmation?.lessonsRemaining !== undefined && (
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: 'rgba(240,192,64,0.10)',
                      border: '1px solid rgba(240,192,64,0.35)',
                    }}
                  >
                    <p className="text-ivory text-sm">
                      {t('misc.bookingDeducted').replace('{n}', String(confirmation.lessonsRemaining))}
                    </p>
                  </div>
                )}

              {confirmation?.paidWith === 'membership' && isApexMember && (
                <p className="text-ivory/60 text-xs">{t('misc.bookingMembershipCovers')}</p>
              )}

              {confirmation?.paidWith === 'cash_transfer' && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'rgba(240,192,64,0.10)',
                    border: '1px solid rgba(240,192,64,0.35)',
                  }}
                >
                  <p className="text-ivory text-sm">
                    <Banknote className="inline h-4 w-4 mr-1" style={{ color: '#F0C040' }} />
                    {t('misc.bookingCashPending')}
                  </p>
                </div>
              )}

              <p className="text-ivory/45 text-[11px]">{t('misc.bookingEmailSent')}</p>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  openGoogleCalendar({
                    lessonDate: selectedDate!,
                    lessonTime: selectedTime!,
                    lessonType,
                    notes,
                    coachLabel: t('common.yourCoach'),
                  })
                }
                className="w-full border-gold-accent/40 text-gold-accent hover:bg-gold-accent/10 hover:text-gold-accent"
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                {t('misc.bookingAddGoogle')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 px-5 sm:px-6 py-3 border-t border-white/10 flex-row gap-2 justify-end">
          {(mode === 'single' && step === 4) || (mode === 'fixed' && fixedDone) ? (
            <Button
              onClick={() => { onOpenChange(false); navigate('/dashboard'); }}
              className="btn-green w-full sm:w-auto"
            >
              {t('misc.bookingBackDashboard')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t('misc.bookingCancel')}
              </Button>
              {mode === 'single' && step === 3 && (
                <Button onClick={handleConfirm} disabled={submitting} className="btn-green">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-1" />}
                  {t('misc.bookingConfirm')}
                </Button>
              )}
              {mode === 'fixed' && (
                <Button onClick={handleClaimFixed} disabled={submitting || !fixedSlotId} className="btn-green">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-1" />}
                  {t('misc.bookingFixedConfirm')}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
