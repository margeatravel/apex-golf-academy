import { useState, useMemo, useEffect } from 'react';
import { useAuth, hasProZoneAccess, hasVideosAccess, hasApexAiAccess } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { GraceBanner } from '@/components/GraceBanner';
import { TrialBanner } from '@/components/TrialBanner';
import {
  Calendar, Video, LogOut, User, Star, Loader2, Plus, Minus,
  ChevronRight, MessageCircle, Bell, Smartphone, UserCog,
  Home, CalendarCheck, GraduationCap, CircleDot, Sparkles, Repeat,
  TrendingDown, TrendingUp, Trophy, Minus as MinusIcon, RefreshCw, Lock, Play,
} from 'lucide-react';
import { Package as PackageIcon, Crown } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVisibleRecurringSlots } from '@/hooks/useVisibleRecurringSlots';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { StudentStartsOnBadge } from '@/components/student/StudentStartsOnBadge';
import { CadenceBadge } from '@/components/recurring/CadenceBadge';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { format } from 'date-fns';
import { localeFor } from '@/lib/uiLocale';
import { formatLessonDate, formatLessonTime, getTodayInAppTimezone } from '@/lib/formatLessonDateTime';
import { translateLessonType } from '@/lib/lessonTypeLabel';
import { SocialFooter } from '@/components/SocialFooter';
import { StudentSharedReports } from '@/components/StudentSharedReports';
import { MobileMenu } from '@/components/MobileMenu';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { BroadcastBell } from '@/components/BroadcastBell';
import { ViewModeSwitch } from '@/components/ViewModeSwitch';
import { PushOnboardingOverlay } from '@/components/PushOnboardingOverlay';
import { replayTour } from '@/components/GuidedTour';
import { PlanTierBadge } from '@/components/PlanTierBadge';
import { PackageSelectionModal } from '@/components/PackageSelectionModal';
import { RequireCoachModal } from '@/components/RequireCoachModal';
import { InternalBookingModal } from '@/components/InternalBookingModal';
import { RedeemRewardModal } from '@/components/RedeemRewardModal';
import { InstallAppButton } from '@/components/InstallAppButton';
import { MyChildrenCard } from '@/components/MyChildrenCard';
import { PrioritySpotInfoModal } from '@/components/PrioritySpotInfoModal';
import { MyRecurringSchedulePanel } from '@/components/MyRecurringSchedulePanel';
import { toast } from 'sonner';
import { PaymentMethodSelector } from '@/components/PaymentMethodSelector';
import { getStaffLandingRoute } from '@/lib/staffLanding';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { getTierTheme } from '@/lib/tierTheme';
import { computePackageProgress } from '@/lib/lessonPackageUsage';
import {
  useSharedPackageIds,
  useSharedPackageMemberNames,
  formatSharedWith,
} from '@/hooks/useSharedPackages';
import { DesktopScoreTrendCard, DesktopPackageProgressCard } from '@/components/student/DesktopHomeBlocks';
import { fetchHiddenPackageIds } from '@/lib/archivePackage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ApexBrand from '@/components/ApexBrand';
import { useCoachLessonPricing } from '@/hooks/useCoachLessonPricing';

// Courtesy campaign window — must match COURTESY_CAMPAIGN_END in
// supabase/functions/create-checkout/index.ts (backend applies the Stripe
// trial automatically; this card only advertises it in the student UI).
const COURTESY_CAMPAIGN_END = new Date('2026-10-31T06:00:00Z');

// ── Time-based greeting (uses device local time) ──
function useGreeting() {
  const { t, language } = useLanguage();
  return useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.goodMorning');
    if (h < 18) return t('dashboard.goodAfternoon');
    return t('dashboard.goodEvening');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
}

// ── Initials helper ──
const initialsOf = (name?: string | null, email?: string | null) => {
  const src = (name || email || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
};

// ── Day-of-week labels ──
const DAYS_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Mini-strip starts on Monday (Mon–Sun). Map to JS getDay() index (0=Sun).
const MINI_WEEK = [
  { letter: 'M', dow: 1 },
  { letter: 'T', dow: 2 },
  { letter: 'W', dow: 3 },
  { letter: 'T', dow: 4 },
  { letter: 'F', dow: 5 },
  { letter: 'S', dow: 6 },
  { letter: 'S', dow: 0 },
];
const fmtTime12 = (t: string) => {
  if (!t) return '';
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
};

// ── Donut SVG (no extra deps) ──
function PointsDonut({ points, threshold = 200 }: { points: number; threshold?: number }) {
  const radius = 52;
  const stroke = 10;
  const norm = 2 * Math.PI * radius;
  const ratio = Math.min(1, points / threshold);
  const dash = norm * ratio;
  return (
    <svg viewBox="0 0 130 130" className="w-32 h-32 -rotate-90">
      <circle
        cx="65" cy="65" r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={stroke}
      />
      <circle
        cx="65" cy="65" r={radius}
        fill="none"
        stroke="#F0C040"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${norm}`}
        style={{ transition: 'stroke-dasharray 700ms ease' }}
      />
    </svg>
  );
}

export default function StudentDashboard() {
  const {
    user, profile: authProfile, signOut, role, loading,
    effectivePlan: authEffectivePlan, subscription, graceUntil, graceTier,
    trialEndsAt: authTrialEndsAt,
    isStaff, isStaffView, permissions, hasLinkedCoach: authHasLinkedCoach, previewCoachPricingId, canSwitchViews,
  } = useAuth();
  // Read-only "View as student" preview: same component, other student's real data.
  const studentPreview = useStudentPreview();
  const isPreview = studentPreview.isStudentPreview;
  const profile = isPreview ? studentPreview.previewProfile : authProfile;
  const effectivePlan = isPreview ? studentPreview.effectivePlan : authEffectivePlan;
  const trialEndsAt = isPreview ? (profile?.trial_ends_at ?? null) : authTrialEndsAt;
  const hasLinkedCoach = isPreview ? !!profile?.assigned_coach_id : authHasLinkedCoach;
  /** Blocks any write action while previewing. Returns true when blocked. */
  const blocked = () => (isPreview ? studentPreview.blockWrite() : false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();
  const DAYS_FULL = language === 'es' ? DAYS_FULL_ES : DAYS_FULL_EN;
  const greeting = useGreeting();


  // Staff redirect (unchanged behaviour)
  useEffect(() => {
    if (loading) return;
    if (role === 'admin' || role === 'coach') return;
    // Only bounce to the staff menu when staff mode is actually ACTIVE.
    // Dual-role users in student mode stay on their dashboard.
    if (isStaffView) {
      const target = getStaffLandingRoute(permissions);
      if (target) navigate(target, { replace: true });
    }
  }, [loading, role, isStaffView, permissions, navigate]);

  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [individualLessonModalOpen, setIndividualLessonModalOpen] = useState(false);
  // Coach-gate state: which purchase flow to resume after the student links a coach.
  const [coachGateOpen, setCoachGateOpen] = useState(false);
  const [coachGateReason, setCoachGateReason] = useState<'package' | 'individual_lesson' | 'book'>('individual_lesson');
  // Single entry point to the booking flow, shared with the nav CTAs.
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const openBookingFlow = () => {
    if (blocked()) return;
    if (!hasLinkedCoach) {
      setCoachGateReason('book');
      setCoachGateOpen(true);
      return;
    }
    setBookingModalOpen(true);
  };
  const openIndividualLessonModal = () => {
    if (blocked()) return;
    if (!hasLinkedCoach) {
      setCoachGateReason('individual_lesson');
      setCoachGateOpen(true);
      return;
    }
    setIndividualLessonModalOpen(true);
  };
  const openPackageModal = () => {
    if (blocked()) return;
    if (!hasLinkedCoach) {
      setCoachGateReason('package');
      setCoachGateOpen(true);
      return;
    }
    setPackageModalOpen(true);
  };
  const [individualQty, setIndividualQty] = useState(1);
  const [buyingLesson, setBuyingLesson] = useState(false);
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [prioritySpotInfoOpen, setPrioritySpotInfoOpen] = useState(false);
  const [myScheduleOpen, setMyScheduleOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Refresh ALL cached data: dashboard widgets, lesson lists, calendar, etc.
  // Using refetchType: 'all' ensures queries on other pages (My Lessons,
  // Calendar) also re-fetch immediately, not just lazily on next mount.
  const refreshDashboard = async () => {
    const start = Date.now();
    await queryClient.invalidateQueries({ refetchType: 'all' });
    // Guarantee the spinner gets a visible cycle even when the network
    // returns instantly (cached / no-change responses).
    const elapsed = Date.now() - start;
    if (elapsed < 600) {
      await new Promise((r) => setTimeout(r, 600 - elapsed));
    }
  };

  const handleManualRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await refreshDashboard();
      toast.success(t('dashboard.dashboardUpdated'));
    } catch (e: any) {
      toast.error(e?.message || t('dashboard.couldNotRefresh'));
    } finally {
      setManualRefreshing(false);
    }
  };

  const { pull, refreshing: pulling, threshold: pullThreshold } = usePullToRefresh({
    onRefresh: refreshDashboard,
  });
  const pullProgress = Math.min(1, pull / pullThreshold);

  // ── Queries (unchanged) ──
  // Packages this student is a shared member of (they are not the owner).
  // Everything belonging to a shared package — the package, its counts and all
  // its lessons, whoever took them — is visible to every member.
  const sharedPackageIds = useSharedPackageIds(profile?.id);
  const sharedKey = sharedPackageIds.join(',');

  const { data: upcomingLessons = [] } = useQuery({
    queryKey: ['upcoming-lessons', profile?.id, sharedKey],
    queryFn: async () => {
      let query = supabase
        .from('lessons')
        .select('*')
        .gte('lesson_date', getTodayInAppTimezone())
        .eq('status', 'scheduled');
      // Own lessons + every lesson linked to a shared package.
      query = sharedPackageIds.length
        ? query.or(`student_id.eq.${profile?.id},package_id.in.(${sharedPackageIds.join(',')})`)
        : query.eq('student_id', profile?.id);
      const { data } = await query
        .order('lesson_date', { ascending: true })
        .order('lesson_time', { ascending: true })
        .limit(10);
      const rows = data || [];
      // Lessons linked to a paused / archived package stay hidden here.
      const hidden = new Set(await fetchHiddenPackageIds());
      const visible = rows.filter((l: any) => !l.package_id || !hidden.has(l.package_id));
      // Shared-package lessons taken by someone else show that person's name.
      const otherIds = Array.from(
        new Set(visible.filter((l: any) => l.student_id && l.student_id !== profile?.id).map((l: any) => l.student_id)),
      );
      let nameById = new Map<string, string>();
      if (otherIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', otherIds as string[]);
        (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name || p.email || ''));
      }
      return visible
        .map((l: any) => ({
          ...l,
          takenByName: l.student_id && l.student_id !== profile?.id ? nameById.get(l.student_id) || null : null,
        }))
        .slice(0, 1);
    },
    enabled: !!profile?.id,
  });

  const { data: totalCompletedLessons = 0 } = useQuery({
    queryKey: ['total-lessons', profile?.id],
    queryFn: async () => {
      const today = getTodayInAppTimezone();
      // Same criterion as the admin: only completed/no_show dated on or before
      // today count as taken. Past-dated 'scheduled' rows are NOT counted.
      const takenRes = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile?.id)
        .in('status', ['completed', 'no_show'])
        .lte('lesson_date', today);
      return takenRes.count || 0;
    },
    enabled: !!profile?.id,
  });

  // Active packages for credit display — ALL vigent packages, not just one.
  // (Previously this used order(created_at asc).limit(1).maybeSingle(), so a
  // newly purchased package stayed hidden behind an older one that still had
  // credits left.)
  // NOTE: no filter on the stored classes_remaining column here — it can lag
  // behind real usage (an exhausted 10/10 package kept classes_remaining > 0
  // and was summed into the "Mis clases" card). Vigency is decided below per
  // package via computePackageProgress (remaining > 0), same source of truth
  // as the Packages screen.
  // Includes packages the student OWNS *and* shared packages they are a member
  // of (previously owner-only, which made members see "Sin paquete activo").
  const { data: activePackages = [] } = useQuery({
    queryKey: ['student-active-packages', profile?.id, sharedKey],
    queryFn: async () => {
      let query = supabase
        .from('class_packages')
        .select('*')
        .eq('is_active', true)
        // Paused / archived packages are hidden from the student portal.
        .eq('is_paused', false)
        .eq('is_archived', false);
      query = sharedPackageIds.length
        ? query.or(`user_id.eq.${profile?.id},id.in.(${sharedPackageIds.join(',')})`)
        : query.eq('user_id', profile?.id!);
      const { data } = await query.order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Lessons attached to the active packages — used to compute real
  // "X / Y used" from actual completed lessons (same source of truth
  // as the Packages screen), instead of the stored classes_used counter
  // which can lag behind.
  const activePackageIds = activePackages.map((p: any) => p.id);
  const { data: activePackageLessons = [] } = useQuery({
    queryKey: ['student-active-package-lessons', activePackageIds.join(',')],
    enabled: activePackageIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, status, lesson_date, lesson_start_at, lesson_type, package_id')
        .in('package_id', activePackageIds);
      return data || [];
    },
  });
  // The card shows a SINGLE vigent package — the most recent active,
  // non-paused, non-archived package. Multiple packages are never summed.
  const selectedActivePackage = (activePackages as any[])[0] || null;
  const activePackageProgress = selectedActivePackage
    ? computePackageProgress(
        selectedActivePackage,
        (activePackageLessons as any[]).filter((l) => l.package_id === selectedActivePackage.id),
      )
    : null;

  // Loose (individual) lessons taken — not attached to any package.
  // Admin criteria: completed / no_show with lesson_date ≤ today.
  const { data: looseTakenLessons = 0 } = useQuery({
    queryKey: ['student-loose-taken-lessons', profile?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile?.id)
        .is('package_id', null)
        .in('status', ['completed', 'no_show'])
        .lte('lesson_date', today);
      return count || 0;
    },
    enabled: !!profile?.id,
  });

  // Shared-with label reflects the single selected active package.
  const selectedPackageIds = selectedActivePackage ? [selectedActivePackage.id as string] : [];
  const vigentSharedNames = useSharedPackageMemberNames(selectedPackageIds, profile?.id);
  const sharedWithLabel = formatSharedWith(
    Array.from(new Set(selectedPackageIds.flatMap((id) => vigentSharedNames[id] ?? []))),
    language === 'es',
  );

  // Courtesy campaign eligibility: has this student EVER paid?
  // Zero rows in stripe_payments = never paid (same table the webhook writes).
  const { data: stripePaymentsCount = 0 } = useQuery({
    queryKey: ['student-stripe-payments-count', profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('stripe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile?.id);
      return count || 0;
    },
    enabled: !!profile?.id,
  });

  const { data: studentPoints } = useQuery({
    queryKey: ['student-points', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('student_points' as any)
        .select('*')
        .eq('user_id', profile?.id)
        .maybeSingle();
      return data as unknown as { total_points: number; reward_available: boolean } | null;
    },
    enabled: !!profile?.id,
  });

  // Own slots + slots served by a SHARED package this student belongs to.
  const recurringSlots = useVisibleRecurringSlots(profile?.id);
  const hasOwnRecurringSlot = recurringSlots.some((s: any) => s.is_own);

  const { data: bestRound } = useQuery({
    queryKey: ['best-round', profile?.id],
    queryFn: async () => {
      // Only 18-hole rounds count for "Best round"; order by score vs par.
      const { data } = await supabase
        .from('golf_rounds')
        .select('total_score, course_par, holes_played')
        .eq('student_id', profile?.id)
        .eq('holes_played', 18);
      const rounds = (data ?? []) as { total_score: number; course_par: number | null }[];
      if (!rounds.length) return null;
      return rounds.reduce((best, r) =>
        (r.total_score - (r.course_par ?? 0)) < (best.total_score - (best.course_par ?? 0)) ? r : best
      );
    },
    enabled: !!profile?.id,
  });

  // Latest video the student can open (videos + coach-uploaded media) — preview on the Mis Videos card.
  const canAccessVideos = hasVideosAccess(effectivePlan, graceUntil, trialEndsAt);
  const { data: latestVideo } = useQuery({
    queryKey: ['student-latest-video', profile?.id],
    queryFn: async () => {
      const [{ data: vids }, { data: media }] = await Promise.all([
        supabase
          .from('videos')
          .select('id, title, file_type, category, upload_date, thumbnail_url')
          .eq('student_id', profile!.id)
          .order('upload_date', { ascending: false })
          .limit(1),
        supabase
          .from('student_media' as any)
          .select('id, title, file_url, file_type, thumbnail_url, uploaded_at')
          .eq('student_id', profile!.id)
          .order('uploaded_at', { ascending: false })
          .limit(1),
      ]);
      const v = (vids || [])[0] as any;
      const m = (media || [])[0] as any;
      const vDate = v ? new Date(v.upload_date).getTime() : 0;
      const mDate = m ? new Date(m.uploaded_at).getTime() : 0;
      if (m && mDate > vDate) return { title: m.title || 'Media', thumbnail_url: m.thumbnail_url ?? null } as const;
      if (v) return { title: v.title, thumbnail_url: v.thumbnail_url ?? null } as const;
      return null;
    },
    enabled: !!profile?.id && canAccessVideos,
  });
  const latestVideoThumb = useSignedMediaUrl(latestVideo?.thumbnail_url ?? null);

  // ── Lesson pricing (per-coach; the student's assigned coach controls it) ──
  // When an admin launches Student Preview from a specific coach row, override
  // the pricing coach id so this reflects that coach's config.
  const { data: pricingSettings } = useCoachLessonPricing(
    previewCoachPricingId ?? (profile as any)?.assigned_coach_id,
  );
  const INDIVIDUAL_LESSON_PRICE: number = pricingSettings?.individual_price ?? 1650;
  const INDIVIDUAL_LESSON_PRICE_ID: string =
    pricingSettings?.individual_price_id ?? 'price_1TKkH3Rw8gEMe8Y7UDdvRlDv';
  const PRO_INDIVIDUAL_LESSON_PRICE: number =
    pricingSettings?.pro_individual_price ?? INDIVIDUAL_LESSON_PRICE;
  const isPro = effectivePlan === 'pro';

  // Recent rounds for sparkline + trend (last 5 logged rounds, chronological)
  const { data: recentRounds = [] } = useQuery({
    queryKey: ['recent-rounds-sparkline', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('golf_rounds')
        .select('total_score, course_par, holes_played, played_on')
        .eq('student_id', profile!.id)
        .order('played_on', { ascending: false })
        .limit(5);
      // Return chronological (oldest → newest) for sparkline
      return (data ?? []).slice().reverse();
    },
    enabled: !!profile?.id,
  });

  // Earliest recorded handicap (used as the gauge's "start" / left end)
  const { data: startHandicapRow } = useQuery({
    queryKey: ['handicap-start', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('handicap_history')
        .select('handicap, recorded_at')
        .eq('user_id', profile!.id)
        .order('recorded_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id,
  });

  const nextLesson = upcomingLessons[0];
  const upcomingList = upcomingLessons.slice(0, 4);
  const extraCount = Math.max(0, upcomingLessons.length - upcomingList.length);
  const hasMultipleUpcoming = upcomingLessons.length > 1;
  const getChipLabel = (l: any) =>
    l.recurring_slot_id
      ? t('dashboard.chipPriority')
      : l.calendly_event_id
        ? t('dashboard.chipCalendly')
        : translateLessonType(l.lesson_type, language) || t('dashboard.chipLesson');
  const points = studentPoints?.total_points ?? 0;
  const REWARD_THRESHOLD = 200;
  const pointsToNext = Math.max(0, REWARD_THRESHOLD - points);
  const canRedeem = points >= REWARD_THRESHOLD;
  const hasProZone = hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);

  // Compute "score vs par" for each round (lower = better). Normalize 9-hole rounds.
  const roundDeltas: number[] = (recentRounds as any[]).map((r) => {
    const score = Number(r.total_score);
    const par = Number(r.course_par ?? 72);
    const holes = Number(r.holes_played ?? 18);
    const delta = score - par;
    return holes && holes < 18 ? delta * (18 / holes) : delta;
  });

  // Trend: compare last vs first of the window. Lower = improving.
  const handicapTrend: 'down' | 'up' | 'flat' = (() => {
    if (roundDeltas.length < 2) return 'flat';
    const first = roundDeltas[0];
    const last = roundDeltas[roundDeltas.length - 1];
    if (last < first) return 'down';
    if (last > first) return 'up';
    return 'flat';
  })();

  // Lessons milestone tiers: 20 → 50 → 100 → +100 thereafter
  const lessonsMilestone = (() => {
    const n = totalCompletedLessons;
    if (n < 20) return 20;
    if (n < 50) return 50;
    if (n < 100) return 100;
    return Math.ceil((n + 1) / 100) * 100;
  })();
  const lessonsProgressPct = Math.min(100, Math.round((totalCompletedLessons / lessonsMilestone) * 100));

  // Membership meta
  const tierMeta: Record<string, { label: string; color: string }> = {
    free:    { label: t('plans.member'),  color: '#9CA3AF' },
    member:  { label: t('plans.member'),  color: '#9CA3AF' },
    scratch: { label: t('plans.scratch'), color: '#4A7C59' },
    pro:     { label: t('plans.pro'),     color: '#C9A84C' },
    apex:    { label: 'Apex',             color: '#2E86C1' },
  };
  const meta = tierMeta[effectivePlan] || tierMeta.free;
  const isPaid = effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex';
  const renewal = subscription?.subscriptionEnd
    ? new Date(subscription.subscriptionEnd).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Courtesy promo card — shown only when ALL three hold:
  // (1) no active/trialing subscription (same signal the dashboard uses),
  // (2) never paid (no stripe_payments rows),
  // (3) the campaign window is still open.
  const showCourtesyCard =
    !isPaid &&
    !subscription?.subscribed &&
    stripePaymentsCount === 0 &&
    new Date() < COURTESY_CAMPAIGN_END;

  // Lesson type chip
  const isCalendly = !!nextLesson?.calendly_event_id;
  const chipLabel = nextLesson
    ? (nextLesson.recurring_slot_id
        ? t('dashboard.chipPriority')
        : isCalendly
          ? t('dashboard.chipCalendly')
          : translateLessonType(nextLesson.lesson_type, language) || t('dashboard.chipLesson'))
    : '';

  // Best round display
  const bestRoundText = bestRound
    ? `${bestRound.total_score}${bestRound.course_par ? ` (${bestRound.total_score - bestRound.course_par >= 0 ? '+' : ''}${bestRound.total_score - bestRound.course_par})` : ''}`
    : '—';

  const handleBuyIndividualLesson = async () => {
    if (blocked()) return;
    setBuyingLesson(true);
    try {
      const PRO_INDIVIDUAL_LESSON_PRICE_ID: string | undefined =
        (pricingSettings as any)?.pro_individual_price_id;
      if (isPro && !PRO_INDIVIDUAL_LESSON_PRICE_ID) {
        toast(t('dashboard.proDiscountNotConfigured'), {
          description: t('dashboard.proDiscountAdminHint'),
        });
      }
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          mode: 'payment',
          quantity: individualQty,
          item: 'individual',
          coachId: previewCoachPricingId ?? profile?.assigned_coach_id ?? null,
          currency: 'mxn',
        },
      });
      if (error) {
        toast.error(await getFunctionErrorMessage(error, t('dashboard.errorProcessingPayment')));
        return;
      }
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || t('dashboard.errorProcessingPayment'));
    } finally {
      setBuyingLesson(false);
      setIndividualLessonModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="app-bg app-bg-green min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (role !== 'admin' && isStaffView) {
    return <div className="app-bg app-bg-green min-h-screen" />;
  }

  // Glass card style (per spec)
  const glassStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 22,
  };

  return (
    <div className="app-bg app-bg-green min-h-screen pb-32 lg:pb-12">
      {/* ── Pull-to-refresh indicator ── */}
      {(pull > 0 || pulling) && (
        <div
          aria-hidden
          className="fixed left-0 right-0 z-30 flex items-center justify-center pointer-events-none"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + 6px)`,
            transform: `translateY(${Math.min(pull, pullThreshold) - 24}px)`,
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

      {/* ── TOP BAR ── */}
      <header className="sticky top-0 z-20" style={{
        background: getTierTheme(effectivePlan).headerBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${getTierTheme(effectivePlan).border}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <MobileMenu isCoach={role === 'admin'} onSignOut={signOut} currentView="student" />
            <button type="button" onClick={() => navigate('/dashboard')} aria-label={t('misc.navHome')} className="flex-shrink-0">
              <ApexBrand size="sm" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={manualRefreshing || pulling}
              aria-label={t('nav.refreshDashboard')}
              className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              <RefreshCw
                className={`h-4 w-4 text-ivory ${manualRefreshing || pulling ? 'animate-spin' : ''}`}
              />
            </button>

            <GlobalSearch />

            <BroadcastBell />


            <LanguageToggle variant="header" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={t('dashboard.account')}
                  className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden"
                  style={{
                    background: 'rgba(74,124,89,0.85)',
                    border: '1px solid rgba(255,255,255,0.22)',
                  }}
                >
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-ivory text-xs font-semibold">
                      {initialsOf(profile?.full_name, profile?.email)}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60 glass-card border-white/15 z-50" align="end">
                <DropdownMenuLabel className="text-ivory/60 flex items-center justify-between">
                  <span>{t('dashboard.account')}</span>
                  <PlanTierBadge clickable={false} showLabel={false} />
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                  <User className="h-4 w-4" /> {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                  <Bell className="h-4 w-4" /> {t('nav.notifications')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/plans')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                  <Star className="h-4 w-4 text-gold-accent" /> {t('plans.managePlan')}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => user && replayTour(user.id, 'student')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                  <Sparkles className="h-4 w-4 text-gold-accent" /> {t('nav.replayTour')}
                </DropdownMenuItem>
                {hasProZone && (
                  <DropdownMenuItem onClick={() => user && replayTour(user.id, 'proZone')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                    <Star className="h-4 w-4 text-gold-accent" /> {t('dashboard.replayProZoneTour')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setInstallModalOpen(true)} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                  <Smartphone className="h-4 w-4 text-gold-accent" /> {t('dashboard.installApp')}
                </DropdownMenuItem>
                {canSwitchViews && (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                      <ViewModeSwitch />
                    </DropdownMenuItem>
                  </>
                )}
                {role === 'admin' && (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem onClick={() => navigate('/admin')} className="gap-2 cursor-pointer text-ivory/80 hover:text-ivory hover:bg-white/10">
                      <UserCog className="h-4 w-4" /> {t('dashboard.coachDashboard')}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-400/10 focus:text-red-300 focus:bg-red-400/10">
                  <LogOut className="h-4 w-4" /> {t('nav.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </header>

      <PushOnboardingOverlay />



      <main className="px-4 pt-5 pb-6 space-y-4 max-w-2xl mx-auto">
        <TrialBanner />
        {/* Grace banner if applicable */}
        {effectivePlan !== 'scratch' && effectivePlan !== 'pro' && graceUntil && graceTier && (
          <GraceBanner planTier={graceTier} paidThrough={graceUntil} />
        )}

        {/* ── GREETING ── */}
        <div data-tour="greeting-plan">
          <p className="text-ivory/65 text-[13px] tracking-wide">{greeting},</p>
          <h1 className="text-ivory font-heading font-bold leading-tight flex items-center gap-2 flex-wrap" style={{ fontSize: 26 }}>
            <span>{profile?.full_name || t('dashboard.player')}</span>
            {(() => {
              const plan = (effectivePlan || 'free') as string;
              const styles: Record<string, { label: string; bg: string; border: string; color: string }> = {
                free:    { label: t('home.memberBadge'), bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', color: 'rgba(245,240,232,0.75)' },
                member:  { label: t('home.memberBadge'), bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', color: 'rgba(245,240,232,0.75)' },
                scratch: { label: t('plans.scratch'), bg: 'rgba(74,124,89,0.18)',   border: 'rgba(74,124,89,0.45)',   color: '#B6E2C5' },
                pro:     { label: t('plans.pro'),     bg: 'rgba(240,192,64,0.16)',  border: 'rgba(240,192,64,0.45)',  color: '#F0C040' },
                apex:    { label: 'Apex',    bg: 'rgba(56,135,255,0.18)',  border: 'rgba(56,135,255,0.45)',  color: '#7AB0FF' },
              };
              const s = styles[plan] || styles.free;
              return (
                <span
                  className="inline-flex items-center text-[11px] font-medium tracking-wide rounded-full px-2 py-0.5 backdrop-blur-md"
                  style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'inherit' }}
                >
                  {s.label}
                </span>
              );
            })()}
          </h1>
        </div>

        {/* Compact overview; existing promotion eligibility and lesson data stay unchanged. */}
        <div className={`grid gap-3 ${showCourtesyCard ? 'grid-cols-2' : 'grid-cols-1'}`} data-dashboard-overview>
          {showCourtesyCard && (
            <section className="min-w-0 flex flex-col rounded-lg border border-gold/35 bg-gold/10 backdrop-blur-xl p-3">
              <div className="flex items-center gap-1.5 text-gold">
                <Sparkles className="h-4 w-4 shrink-0" />
                <p className="text-xs font-medium">{language === 'es' ? 'Promoción Pro' : 'Pro offer'}</p>
              </div>
              <p className="text-ivory text-xl font-semibold mt-2 leading-tight">
                $1,998 <span className="text-ivory/60 text-[10px] font-normal">MXN</span>
              </p>
              <p className="text-ivory/65 text-xs mt-1">{language === 'es' ? '2 meses de Pro gratis' : '2 months of Pro free'}</p>
              <Button asChild variant="ghost" size="sm" className="mt-2 h-8 w-full justify-between px-0 text-xs text-gold hover:text-gold hover:bg-gold/10">
                <Link to="/plans?tab=plans">{language === 'es' ? 'Ver promoción' : 'View offer'}<ChevronRight /></Link>
              </Button>
            </section>
          )}
          <section className="lesson-glass min-w-0 rounded-lg px-3.5 py-3" data-tour="next-lesson">
            {nextLesson ? (
              <Link to="/lessons" className="flex items-center gap-2.5">
                <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-accent opacity-70 motion-safe:animate-ping" />
                  <span className="lesson-live-dot relative inline-flex h-3 w-3 rounded-full bg-green-accent" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-ivory/55">{t('dashboard.nextLesson')}</span>
                  <span className="block text-ivory text-[15px] font-semibold leading-tight truncate">
                    {formatLessonDate(nextLesson, 'monthDay', localeFor(language))} · {formatLessonTime(nextLesson)} · {nextLesson.duration_minutes ?? 60} min{nextLesson.takenByName ? ` · ${t('ui.studentLessons.sharedPackageTag')}` : ''}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 ml-auto text-ivory/50" />
              </Link>
            ) : (
              <button type="button" onClick={openBookingFlow} className="flex items-center gap-2.5 w-full text-left">
                <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-accent opacity-70 motion-safe:animate-ping" />
                  <span className="lesson-live-dot relative inline-flex h-3 w-3 rounded-full bg-green-accent" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-ivory/55">{t('dashboard.nextLesson')}</span>
                  <span className="block text-ivory/65 text-xs leading-snug">{t('dashboard.noUpcomingLesson')}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs font-medium text-gold">{language === 'es' ? 'Reservar' : 'Book'} ›</span>
              </button>
            )}
          </section>
        </div>

        {/* ── MEMBERSHIP CARD removed — moved to Profile page only. ── */}

        {/* Desktop (lg+) splits the home into 2/3 + 1/3 columns. On mobile the
            wrapper is a plain flex column and `order-*` keeps the original
            visual order, so the mobile layout is unchanged. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">
          {/* ── LEFT COLUMN (lg+) ── */}
          <div className="contents lg:block lg:col-span-2 lg:space-y-4">

        {/* ── PRO ZONE (tarjeta, en el lugar y tamaño de Mis Clases — Inicio v4, 27 Nov 2026) ── */}
        <Link
          to="/pro-zone"
          style={{
            ...glassStyle,
            background:
              'linear-gradient(135deg, rgba(240,192,64,0.14), rgba(240,192,64,0.04))',
            border: '1px solid rgba(240,192,64,0.35)',
            boxShadow:
              '0 8px 28px rgba(240,192,64,0.10), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
          className="order-2 lg:order-none px-4 py-4 block transition-all duration-200 lg:hover:-translate-y-0.5"
          data-tour="pro-zone"
        >
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(240,192,64,0.20)',
                border: '1px solid rgba(240,192,64,0.45)',
              }}
            >
              <Star className="h-5 w-5 text-gold-accent" fill="#F0C040" />
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] uppercase leading-tight"
                style={{ color: 'rgba(240,192,64,0.85)' }}
              >
                {t('dashboard.proZoneStar')}
              </p>
              <p className="text-ivory text-[15px] font-semibold mt-1 leading-snug">
                {t('dashboard.proZoneRowSub')}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-gold-accent/70 flex-shrink-0 ml-auto" />
          </div>
          <div className="flex gap-1.5 mt-3.5 flex-wrap">
            <span className="text-[11px] text-ivory/80 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.30)' }}>{t('dashboard.proZoneChipRounds')}</span>
            <span className="text-[11px] text-ivory/80 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.30)' }}>{t('dashboard.proZoneChipLibrary')}</span>
            <span className="text-[11px] text-ivory/80 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.30)' }}>{t('dashboard.proZoneChipStats')}</span>
          </div>
        </Link>

        {/* ── INICIO v4 (27 Nov 2026): Handicap quitado del inicio por decisión de Santiago. Código conservado con false &&, no borrado. ── */}
        {false && (
          (() => {
            const current = profile?.handicap;
            const goal = (profile as any)?.handicap_goal;
            // Left end (high handicap) is fixed at 36 (max standard handicap)
            const startRaw = 36;
            // Right end (low handicap / goal). Fallback when no goal.
            const endRaw = goal != null
              ? Number(goal)
              : (current != null ? Math.max(0, Number(current) - 8) : 0);
            const start = Math.max(startRaw, endRaw + 1); // ensure left > right
            const end = Math.min(endRaw, start - 1);
            const cur = current != null ? Number(current) : (start + end) / 2;
            const clamped = Math.max(end, Math.min(start, cur));
            // 0 = left (start/high), 1 = right (end/low)
            const ratio = (start - clamped) / (start - end || 1);
            // Semicircle geometry
            const cx = 50, cy = 46, r = 38;
            const angle = Math.PI * (1 - ratio); // 180° → 0°
            const needleX = cx + r * Math.cos(angle);
            const needleY = cy - r * Math.sin(angle);
            return (
              <Link to="/pro-zone/stats" style={glassStyle} className="px-3 py-3 flex flex-col items-center text-center hover:brightness-110 transition">
                <p className="text-ivory/50 text-[10px] uppercase leading-tight">{t('dashboard.handicap')}</p>
                <svg viewBox="0 0 100 56" className="w-full mt-1.5" style={{ maxWidth: 110 }}>
                  <defs>
                    <linearGradient id="hcap-arc" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#E27A7A" />
                      <stop offset="50%" stopColor="#F0C040" />
                      <stop offset="100%" stopColor="#7CC598" />
                    </linearGradient>
                  </defs>
                  {/* Track */}
                  <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                  {/* Colored arc */}
                  <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke="url(#hcap-arc)"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  {/* Needle */}
                  <line
                    x1={cx}
                    y1={cy}
                    x2={needleX}
                    y2={needleY}
                    stroke="#F5F0E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 3px rgba(245,240,232,0.6))' }}
                  />
                  {/* Hub */}
                  <circle cx={cx} cy={cy} r="3" fill="#F5F0E8" />
                  {/* End labels */}
                   <text x={cx - r} y={cy + 8} textAnchor="middle"
                         fontSize="5" fill="rgba(245,240,232,0.45)">
                     {Math.round(start)}
                   </text>
                   <text x={cx + r} y={cy + 8} textAnchor="middle"
                         fontSize="5" fill="rgba(245,240,232,0.45)">
                     {Math.round(end)}
                   </text>
                </svg>
                <p className="text-ivory font-heading font-bold text-xl leading-none mt-1">
                  {current != null ? String(current) : '—'}
                </p>
                {goal != null ? (
                  <p className="text-ivory/45 text-[9px] mt-1.5">{t('dashboard.goal')}: {goal}</p>
                ) : (
                  <span className="text-[9px] mt-1.5 text-ivory/55">
                    {t('dashboard.setYourGoal')}
                  </span>
                )}
              </Link>
            );
          })()
        )}

        {/* ── MIS CLASES (banner, en el lugar y tamaño de Pro Zone — Inicio v4) ── */}
        <Link
          to="/lessons"
          style={glassStyle}
          className="order-4 lg:order-none px-3 py-3 flex items-center gap-3 hover:brightness-110 transition"
        >
          {activePackageProgress ? (
            <>
              <span className="text-ivory font-heading font-bold text-[28px] leading-none shrink-0">
                {activePackageProgress.remaining}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ivory text-[13px] font-semibold leading-tight truncate">
                  {t('dashboard.leftShort')} {t('dashboard.ofTotalShort')} {activePackageProgress.size} · {activePackageProgress.used} {t('dashboard.takenShort')}
                </span>
                <span className="block w-full h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <span
                    className="block h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${activePackageProgress.pct}%`,
                      background: 'linear-gradient(90deg, #4a7c59, #7CC598)',
                    }}
                  />
                </span>
                <span className="block text-ivory/55 text-[11px] mt-1.5 truncate">
                  {t('dashboard.myLessons')}
                  {sharedWithLabel ? ` · ${sharedWithLabel}` : ''}
                  {looseTakenLessons > 0 ? ` · ${looseTakenLessons} ${looseTakenLessons === 1 ? t('dashboard.looseLesson') : t('dashboard.looseLessons')}` : ''}
                </span>
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block text-ivory text-[13px] font-semibold leading-tight">{t('dashboard.noActivePackage')}</span>
              <span className="block text-ivory/55 text-[11px] mt-1">{t('dashboard.myLessons')}</span>
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-ivory/50 shrink-0" />
        </Link>

        {/* ── MIS VIDEOS (tarjeta grande — Inicio v4) ── */}
        <Link
          to="/videos"
          style={glassStyle}
          className="order-5 lg:order-none overflow-hidden block hover:brightness-110 transition"
          data-tour="game-stats"
        >
          <div
            className="relative h-[120px] overflow-hidden"
            style={latestVideoThumb ? undefined : { background: 'linear-gradient(135deg,#1d4a2e 0%,#0f2a1a 55%,#0a1810 100%)' }}
          >
            {latestVideoThumb ? (
              <img src={latestVideoThumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 120%,rgba(240,192,64,0.18),transparent 60%)' }} />
            )}
            <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.55) 100%)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="h-[52px] w-[52px] rounded-full flex items-center justify-center"
                style={{ background: 'rgba(240,192,64,0.9)', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}
              >
                <Play className="h-5 w-5" fill="#12291c" color="#12291c" />
              </div>
            </div>
            <span className="absolute left-3 bottom-2.5 text-[11px] text-ivory/90 px-2 py-0.5 rounded-full max-w-[85%] truncate" style={{ background: 'rgba(0,0,0,0.55)' }}>
              {latestVideo ? latestVideo.title : (language === 'es' ? 'Análisis de swing' : 'Swing analysis')}
            </span>
          </div>
          <div className="px-3 py-3 flex items-center gap-2">
            <div className="min-w-0">
              <p className="text-ivory text-[15px] font-semibold leading-tight">{t('admin.myVideosTitle')}</p>
              <p className="text-ivory/60 text-xs mt-0.5 leading-snug">{t('admin.myVideosSub')}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-ivory/50 shrink-0 ml-auto" />
          </div>
        </Link>
        {/* ── SCORE / METRIC TREND (mobile + desktop, same component) ── */}
        <div className="order-[6] lg:order-none">
          <DesktopScoreTrendCard studentId={profile?.id} />
        </div>
        <div className="hidden lg:block">
          <DesktopPackageProgressCard studentId={profile?.id} />
        </div>


        {/* ── MY CHILDREN (below package progress, full width of the left column) ── */}
        <MyChildrenCard />
          </div>

          {/* ── RIGHT COLUMN (lg+) ── */}
          <div className="contents lg:block lg:space-y-4">

        {/* ── LUGAR PRIORITARIO + MARGEA IA (Inicio v4) ── */}
        <div className="order-3 lg:order-none grid grid-cols-2 lg:grid-cols-1 gap-3">
          {/* Priority Spot — tile compacto (máx. 2 horarios, el resto en Mi horario) */}
          {recurringSlots.length > 0 ? (
            <button
              type="button"
              onClick={() => setMyScheduleOpen(true)}
              style={{
                ...glassStyle,
                borderColor: 'rgba(240,192,64,0.40)',
                boxShadow: '0 0 0 1px rgba(240,192,64,0.08) inset, 0 8px 28px -14px rgba(240,192,64,0.22)',
                background: 'linear-gradient(160deg, rgba(240,192,64,0.08), rgba(255,255,255,0.06))',
              }}
              className="px-3 py-3 flex flex-col text-left hover:brightness-110 transition min-w-0"
              aria-label={t('home.viewPrioritySpotDetails')}
            >
              <span className="flex items-center gap-1 min-w-0">
                <Repeat className="h-3 w-3 text-gold-accent flex-shrink-0" />
                <span className="text-gold text-[10px] uppercase leading-tight whitespace-normal">
                  {t('dashboard.prioritySpot')}
                </span>
              </span>
              {recurringSlots.slice(0, 2).map((s: any, i: number) => (
                <span key={s.id ?? i} className="block mt-1.5 min-w-0">
                  <span className="block text-ivory font-heading font-bold text-[15px] leading-tight truncate">
                    {DAYS_FULL[s.weekday]}
                  </span>
                  <span className="block text-ivory/75 text-[11px] mt-0.5 whitespace-nowrap">{fmtTime12(s.start_time)}</span>
                </span>
              ))}
              {recurringSlots.length > 2 && (
                <span className="block text-ivory/55 text-[10px] mt-1">
                  +{recurringSlots.length - 2} {language === 'es' ? 'más' : 'more'}
                </span>
              )}
              <span
                className="mt-2 self-start text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{
                  background: 'rgba(74,124,89,0.22)',
                  color: '#7CC598',
                  border: '1px solid rgba(74,124,89,0.45)',
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#7CC598' }} />
                {t('dashboard.confirmed')}
              </span>
              {recurringSlots.slice(0, 2).some((s: any) => !s.is_own) && (
                <span className="mt-1.5 text-[10px] text-ivory/55 truncate">{t('ui.studentLessons.sharedPackageTag')}</span>
              )}
            </button>
          ) : isPaid ? (
            <Link
              to="/lessons/fixed-schedule"
              style={glassStyle}
              className="px-2 py-3 flex flex-col items-center justify-center text-center relative overflow-hidden min-w-0"
            >
              <div
                aria-hidden
                className="absolute -top-6 -right-6 h-20 w-20 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(240,192,64,0.25), transparent 70%)' }}
              />
              <div className="relative">
                <div className="flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3" style={{ color: '#F0C040' }} />
                  <p className="text-[10px] uppercase leading-tight" style={{ color: '#F0C040' }}>
                    {t('dashboard.prioritySpot')}
                  </p>
                </div>
                <p className="text-ivory font-heading font-bold text-[14px] mt-1.5 leading-tight">
                  {language === 'es' ? 'Tu horario fijo' : 'Your weekly spot'}
                </p>
                <p className="text-ivory/65 text-[11px] mt-1 leading-snug">
                  {language === 'es' ? 'Reserva cada semana' : 'Book every week'}
                </p>
              </div>
              <span
                className="relative mt-2.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-full self-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(240,192,64,0.22), rgba(240,192,64,0.10))',
                  border: '1px solid rgba(240,192,64,0.45)',
                  color: '#F0C040',
                  boxShadow: '0 0 12px rgba(240,192,64,0.25)',
                }}
              >
                {language === 'es' ? 'Ver opciones' : 'View options'} →
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setPrioritySpotInfoOpen(true)}
              style={glassStyle}
              className="px-2 py-3 flex flex-col items-center justify-center text-center relative overflow-hidden min-w-0"
            >
              <div
                aria-hidden
                className="absolute -top-6 -right-6 h-20 w-20 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(240,192,64,0.25), transparent 70%)' }}
              />
              <div className="relative">
                <div className="flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3" style={{ color: '#F0C040' }} />
                  <p className="text-[10px] uppercase leading-tight" style={{ color: '#F0C040' }}>
                    {t('dashboard.prioritySpot')}
                  </p>
                </div>
                <p className="text-ivory font-heading font-bold text-[14px] mt-1.5 leading-tight">
                  {language === 'es' ? 'Tu horario fijo' : 'Your weekly spot'}
                </p>
                <p className="text-ivory/65 text-[11px] mt-1 leading-snug">
                  {language === 'es' ? 'Reserva cada semana' : 'Book every week'}
                </p>
              </div>
              <span
                className="relative mt-2.5 text-[11px] font-semibold inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-full self-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(240,192,64,0.22), rgba(240,192,64,0.10))',
                  border: '1px solid rgba(240,192,64,0.45)',
                  color: '#F0C040',
                  boxShadow: '0 0 12px rgba(240,192,64,0.25)',
                }}
              >
                {language === 'es' ? 'Ver opciones' : 'View options'} →
              </span>
            </button>
          )}

          {/* Margea IA (ES) / Margea AI (EN) */}
          <Link
            to="/ai-coach"
            style={glassStyle}
            className="px-3 py-4 flex flex-col items-start gap-2 min-w-0"
            data-tour="apex-ai"
          >
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(240,192,64,0.14)',
                border: '1px solid rgba(240,192,64,0.35)',
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: '#F0C040' }} />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-ivory text-sm font-semibold truncate">{t('dashboard.apexAi')}</p>
              <p className="text-ivory/60 text-xs mt-0.5 truncate">{t('dashboard.apexAiSub')}</p>
            </div>
          </Link>
        </div>
        {/* ── PURCHASES (Individual Lesson · Lesson Package · Swing Analysis) ── */}
        {/* INICIO v4 (27 Nov 2026): Compras quitado del inicio — la compra ya vive en Reservar y en el botón +. Código conservado con false &&, no borrado. */}
        {false && (
        <section
          style={glassStyle}
          className="order-5 lg:order-none px-4 py-4"
          data-tour="swing-analysis"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
                style={{ background: '#F0C040' }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full"
                style={{
                  background: '#F0C040',
                  boxShadow: '0 0 12px rgba(240,192,64,0.65)',
                }}
              />
            </span>
            <div className="min-w-0">
              <p className="text-ivory/55 text-[10px] uppercase leading-tight">
                {t('dashboard.purchases')}
              </p>
              <p className="text-ivory/80 text-sm mt-1.5">
                {t('dashboard.purchasesSub')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Individual Lesson */}
            <button
              type="button"
              onClick={openIndividualLessonModal}
              className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-full text-center transition-all hover:bg-white/[0.04] active:scale-[0.97]"
              style={{
                background: 'rgba(74,124,89,0.10)',
                border: '1px solid rgba(74,124,89,0.30)',
              }}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(74,124,89,0.28)',
                  border: '1px solid rgba(123,200,148,0.45)',
                }}
              >
                <GraduationCap className="h-[18px] w-[18px]" style={{ color: '#7BC894' }} />
              </div>
              <span className="text-ivory text-[11px] font-semibold leading-tight whitespace-pre-line">
                {t('dashboard.individualLessonShort')}
              </span>
            </button>

            {/* Lesson Package */}
            <button
              type="button"
              onClick={openPackageModal}
              className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-full text-center transition-all hover:bg-white/[0.04] active:scale-[0.97]"
              style={{
                background: 'rgba(74,124,89,0.10)',
                border: '1px solid rgba(74,124,89,0.30)',
              }}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(74,124,89,0.28)',
                  border: '1px solid rgba(123,200,148,0.45)',
                }}
              >
                <PackageIcon className="h-[18px] w-[18px]" style={{ color: '#7BC894' }} />
              </div>
              <span className="text-ivory text-[11px] font-semibold leading-tight whitespace-pre-line">
                {t('dashboard.lessonPackageShort')}
              </span>
            </button>

            {/* Swing Analysis */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('open-video-analysis'))}
              className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-full text-center transition-all hover:bg-white/[0.04] active:scale-[0.97]"
              style={{
                background: 'rgba(240,192,64,0.10)',
                border: '1px solid rgba(240,192,64,0.30)',
              }}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(240,192,64,0.28)',
                  border: '1px solid rgba(240,192,64,0.55)',
                }}
              >
                <Video className="h-[18px] w-[18px]" style={{ color: '#F0C040' }} />
              </div>
              <span className="text-ivory text-[11px] font-semibold leading-tight whitespace-pre-line">
                {t('dashboard.swingAnalysisShort')}
              </span>
            </button>
          </div>
        </section>
        )}
          </div>
        </div>


        {/* ── TWO-COLUMN: SC Points donut + Priority Spot ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* SC Points */}
          <button
            onClick={() => { if (blocked()) return; setRedeemModalOpen(true); }}
            style={glassStyle}
            className="px-3 py-4 flex flex-col items-center text-center transition-transform active:scale-[0.98]"
            data-tour="sc-points"
          >
            <p className="text-ivory/55 text-[10px] uppercase leading-tight mb-1 self-start">
              {t('dashboard.scPoints')}
            </p>
            <div className="relative flex items-center justify-center my-1">
              <PointsDonut points={points} threshold={REWARD_THRESHOLD} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-ivory font-heading font-bold text-2xl leading-none">{points}</span>
                <span className="text-ivory/45 text-[9px] uppercase tracking-wider mt-0.5">{t('dashboard.pts')}</span>
              </div>
            </div>
            <p className="text-ivory/65 text-[11px] mt-1.5">
              {canRedeem
                ? t('dashboard.rewardReadyEmoji')
                : `${pointsToNext} ${t('dashboard.ptsToFirstReward')}`}
            </p>
          </button>

          {/* Best Round */}
          <Link to="/pro-zone/stats" style={glassStyle} className="px-3 py-3 flex flex-col items-center text-center hover:brightness-110 transition">
            <p className="text-ivory/50 text-[9px] uppercase tracking-[0.16em]">{t('dashboard.bestRound')}</p>
            {bestRound ? (
              <>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Trophy className="h-4 w-4 text-gold-accent" fill="#F0C040" />
                  <p className="text-ivory font-heading font-bold text-xl leading-none">
                    {bestRoundText}
                  </p>
                </div>
                <p className="text-ivory/45 text-[9px] mt-2">
                  {t('dashboard.personalBest')}
                </p>
              </>
            ) : (
              <>
                <p className="text-ivory font-heading font-bold text-xl leading-none mt-1.5">—</p>
                <Trophy
                  className="h-4 w-4 mt-2"
                  style={{ color: 'rgba(240,192,64,0.4)' }}
                />
                <p className="text-ivory/45 text-[9px] mt-1.5 leading-tight whitespace-pre-line">
                  {t('dashboard.register18HoleRound')}
                </p>
              </>
            )}
          </Link>
        </div>

        {/* Quick actions strip removed — now lives in the bottom-nav "+" FAB. */}

        {/* Shared Performance Reports */}
        <StudentSharedReports />
      </main>

      {/* Old full-width bottom nav removed — replaced by global <StudentBottomNav />. */}

      <SocialFooter />
      <PackageSelectionModal open={packageModalOpen} onOpenChange={setPackageModalOpen} />
      <InternalBookingModal open={bookingModalOpen} onOpenChange={setBookingModalOpen} />
      <RequireCoachModal
        open={coachGateOpen}
        onOpenChange={setCoachGateOpen}
        reason={coachGateReason}
        onLinked={() => {
          if (coachGateReason === 'package') setPackageModalOpen(true);
          else if (coachGateReason === 'book') setBookingModalOpen(true);
          else setIndividualLessonModalOpen(true);
        }}
      />
      <RedeemRewardModal
        open={redeemModalOpen}
        onOpenChange={setRedeemModalOpen}
        currentBalance={points}
        onRedeemed={() => {
          queryClient.invalidateQueries({ queryKey: ['student-points', profile?.id] });
          // After redemption, open the upload sheet so the comped credit is used right away.
          setTimeout(() => window.dispatchEvent(new Event('open-video-analysis')), 1900);
        }}
      />
      <InstallAppButton hidden controlledOpen={installModalOpen} onControlledOpenChange={setInstallModalOpen} />
      <PrioritySpotInfoModal
        open={prioritySpotInfoOpen}
        onOpenChange={setPrioritySpotInfoOpen}
      />
      <MyRecurringSchedulePanel
        open={myScheduleOpen}
        onOpenChange={setMyScheduleOpen}
        profile={profile}
        effectivePlan={effectivePlan}
        recurringSlots={recurringSlots.filter((s: any) => s.is_own)}
        upcomingLessons={upcomingLessons}
      />


      {/* Individual Lesson Confirmation Modal (kept for back-compat) */}
      {individualLessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !buyingLesson && setIndividualLessonModalOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
            style={{ background: 'linear-gradient(145deg, #1a2e23, #0f1f17)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => !buyingLesson && setIndividualLessonModalOpen(false)}
              className="absolute top-3 right-3 text-ivory/40 hover:text-ivory transition-colors text-lg"
            >✕</button>

            <div className="text-center mb-5">
              <div className="h-12 w-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
                <GraduationCap className="h-6 w-6 text-green-accent" />
              </div>
              <h3 className="text-ivory font-heading font-semibold text-lg">
                {individualQty === 1
                  ? t('dashboard.individualLesson')
                  : t('dashboard.individualLessonsCount').replace('{count}', String(individualQty))}
              </h3>
              <p className="text-ivory/50 text-xs mt-1">{t('dashboard.privateLessonDescription')}</p>
              {isPro && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.4)', color: '#F0C040' }}>
                  <Crown className="h-3 w-3" /> {t('dashboard.proMemberPrice')}
                </div>
              )}
            </div>

            <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-gold-accent text-3xl font-heading font-bold">
                  ${((isPro ? PRO_INDIVIDUAL_LESSON_PRICE : INDIVIDUAL_LESSON_PRICE) * individualQty).toLocaleString('en-US')}
                </span>
                <span className="text-ivory/40 text-sm">{t('dashboard.mxn')}</span>
              </div>
              <p className="text-ivory/40 text-[11px] text-center mt-1">
                {individualQty > 1
                  ? `$${(isPro ? PRO_INDIVIDUAL_LESSON_PRICE : INDIVIDUAL_LESSON_PRICE).toLocaleString('en-US')} ${t('dashboard.mxn')} · ${t('dashboard.oneTimePayment')}`
                  : t('dashboard.oneTimePayment')}
              </p>
            </div>

            {/* Pro upsell — hidden when student is already Pro */}
            {!isPro && PRO_INDIVIDUAL_LESSON_PRICE < INDIVIDUAL_LESSON_PRICE && (
              <button
                type="button"
                onClick={() => {
                  setIndividualLessonModalOpen(false);
                  navigate('/plans');
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl mb-4 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                style={{
                  background: 'rgba(240,192,64,0.08)',
                  border: '1px solid rgba(240,192,64,0.32)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0 text-left">
                  <Crown className="h-4 w-4 shrink-0" style={{ color: '#F0C040' }} />
                  <p className="text-[11px] font-semibold" style={{ color: '#F0C040' }}>
                    {t('dashboard.getProPlan')}: ${PRO_INDIVIDUAL_LESSON_PRICE.toLocaleString('en-US')} {t('dashboard.mxn')} {t('dashboard.perLessonShort')}
                  </p>
                </div>
                <span className="text-[11px] font-bold shrink-0" style={{ color: '#F0C040' }}>{t('dashboard.subscribeArrow')}</span>
              </button>
            )}

            <div className="flex items-center justify-between mb-5 px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ivory/60">{t('dashboard.quantity')}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIndividualQty((q) => Math.max(1, q - 1))}
                  disabled={individualQty <= 1 || buyingLesson}
                  className="h-9 w-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Minus className="h-4 w-4 text-ivory" />
                </button>
                <span className="font-heading font-bold text-lg w-8 text-center text-ivory">{individualQty}</span>
                <button
                  type="button"
                  onClick={() => setIndividualQty((q) => Math.min(9, q + 1))}
                  disabled={individualQty >= 9 || buyingLesson}
                  className="h-9 w-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(74,124,89,0.2)', border: '1px solid rgba(74,124,89,0.4)' }}
                >
                  <Plus className="h-4 w-4 text-green-accent" />
                </button>
              </div>
            </div>

            <ul className="space-y-2 mb-5 text-xs text-ivory/60">
              <li className="flex items-center gap-2"><CircleDot className="h-3 w-3 text-green-accent shrink-0" /> {individualQty > 1 ? t('dashboard.sixtyMinSessions') : t('dashboard.sixtyMinSession')}</li>
              <li className="flex items-center gap-2"><CircleDot className="h-3 w-3 text-green-accent shrink-0" /> {t('dashboard.personalizedCoaching')}</li>
              <li className="flex items-center gap-2"><CircleDot className="h-3 w-3 text-green-accent shrink-0" /> {t('dashboard.scheduleViaCalendly')}</li>
            </ul>

            <PaymentMethodSelector
              totalAmount={(isPro ? PRO_INDIVIDUAL_LESSON_PRICE : INDIVIDUAL_LESSON_PRICE) * individualQty}
              concept={t('home.conceptIndividualLesson')}
              onStripeCheckout={handleBuyIndividualLesson}
              onOfflinePaymentCreated={() => setIndividualLessonModalOpen(false)}
              stripeLoading={buyingLesson}
              lessonsCredited={individualQty}
              packageName={individualQty > 1 ? t('home.individualLessonsCountPurchase').replace('{count}', String(individualQty)) : t('home.individualLessonPurchase')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
