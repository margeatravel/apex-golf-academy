import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, Sparkles, Gift, Loader2, Mail, Phone, Info, Package, ChevronRight, CheckCircle, Star, Calendar, Video, Upload, Clock, Zap, Minus, Plus, CreditCard } from 'lucide-react';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { fireSignupConfetti } from '@/lib/confetti';
import { useCoachLessonPricing } from '@/hooks/useCoachLessonPricing';
import { proPriceSteps, proStepLabel } from '@/lib/proPriceSteps';
import { ProMembershipCard } from '@/components/ProMembershipCard';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';

/** #RRGGBB → rgba() so card tints follow the plan accent stored in the DB. */
function hexToRgba(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}


type PlanTier = 'member' | 'family' | 'scratch' | 'pro' | 'apex';

/** A membership card, fully derived from a `billing_plans` row. */
type MembershipPlan = {
  id: PlanTier;
  name: string;
  description: string;
  price: string;
  period: string;
  accent: string;
  badgeLabel: string | null;
  badgeIcon: string | null;
  benefits: string[];
  excluded: string[];
  priceId: string | null;
};

// Fallback defaults (used if settings not loaded yet)
const FALLBACK_INDIVIDUAL_PRICE = 1650;
const FALLBACK_PRO_INDIVIDUAL_PRICE = 1300;
const FALLBACK_INDIVIDUAL_PRICE_ID = 'price_1TKkH3Rw8gEMe8Y7UDdvRlDv';
const FALLBACK_PACKAGES = [
  { lessons: 10, price: 14850, priceId: 'price_1TKkYkRw8gEMe8Y7CxohteUh', perLesson: 1485, popular: false, proPrice: 12000, proPerLesson: 1200 },
  { lessons: 20, price: 26500, priceId: 'price_1TKkZBRw8gEMe8Y7ILw4uq23', perLesson: 1325, popular: true, proPrice: 22000, proPerLesson: 1100 },
  { lessons: 30, price: 34650, priceId: 'price_1TKka4Rw8gEMe8Y734Dn03uo', perLesson: 1155, popular: false, proPrice: 30000, proPerLesson: 1000 },
];


// Courtesy campaign window — must match COURTESY_CAMPAIGN_END in
// supabase/functions/create-checkout/index.ts and StudentDashboard.tsx.
const COURTESY_CAMPAIGN_END = new Date('2026-10-31T06:00:00Z');

// Courtesy free months per tier (mirrors COURTESY_DAYS_BY_TIER in create-checkout).
const COURTESY_MONTHS_BY_TIER: Partial<Record<PlanTier, number>> = {
  pro: 2,
};

type TabType = 'plans' | 'pricing';

export default function PlanSelectionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, refreshProfile, subscription, checkSubscription, checkingSubscription, effectivePlan, role, previewTier, previewCoachPricingId } = useAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const studentPreview = useStudentPreview();
  const [currentPlan, setCurrentPlan] = useState<PlanTier | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [individualQty, setIndividualQty] = useState(1);

  // Per-coach pricing — each student sees their assigned coach's prices.
  // Admin Student Preview from a coach row overrides the coach id.
  const { data: pricingSettings } = useCoachLessonPricing(
    previewCoachPricingId ?? (profile as any)?.assigned_coach_id,
  );

  // Single source of truth for every membership card: the billing_plans table.
  const { data: planRows } = useQuery({
    queryKey: ['subscription-billing-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('*')
        .in('plan_type', ['subscription', 'internal'])
        .eq('is_active', true)
        .not('tier_key', 'is', null)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const membershipPlans: MembershipPlan[] = useMemo(() => {
    return (planRows || []).map((p: any) => {
      const amt = (p.price_amount ?? 0) / 100;
      const period =
        p.billing_interval === 'year' ? t('misc.plansPerYear')
        : p.billing_interval === 'one_time' || amt === 0 ? ''
        : t('misc.plansPerMonth');
      return {
        id: p.tier_key as PlanTier,
        name: p.name || '',
        description: p.description || '',
        price: `$${amt.toLocaleString('en-US')}`,
        period,
        accent: /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#9CA3AF',
        badgeLabel: p.badge_label || null,
        badgeIcon: p.badge_icon || null,
        benefits: Array.isArray(p.features) ? p.features.map(String) : [],
        excluded: Array.isArray(p.excluded_features) ? p.excluded_features.map(String) : [],
        priceId: p.stripe_price_id || null,
      };
    });
  }, [planRows, t]);

  // Courtesy campaign eligibility (UI only) — never paid + not subscribed + window open.
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

  const courtesyEligible =
    !subscription?.subscribed &&
    stripePaymentsCount === 0 &&
    new Date() < COURTESY_CAMPAIGN_END;



  const INDIVIDUAL_LESSON_PRICE = pricingSettings?.individual_price ?? FALLBACK_INDIVIDUAL_PRICE;
  const PRO_INDIVIDUAL_LESSON_PRICE = pricingSettings?.pro_individual_price ?? FALLBACK_PRO_INDIVIDUAL_PRICE;
  const INDIVIDUAL_LESSON_PRICE_ID = pricingSettings?.individual_price_id ?? FALLBACK_INDIVIDUAL_PRICE_ID;
  const VIDEO_ANALYSIS_PRICE = pricingSettings?.additional_products?.[0]?.price ?? 550;

  const PACKAGES = useMemo(() => {
    if (!pricingSettings?.packages) return FALLBACK_PACKAGES;
    return pricingSettings.packages.map((pkg: any, idx: number) => ({
      lessons: pkg.lessons,
      price: pkg.price,
      priceId: pkg.price_id || FALLBACK_PACKAGES[idx]?.priceId || '',
      perLesson: pkg.lessons > 0 ? Math.round(pkg.price / pkg.lessons) : 0,
      popular: idx === 1,
      proPrice: pkg.pro_price,
      proPerLesson: pkg.lessons > 0 ? Math.round(pkg.pro_price / pkg.lessons) : 0,
    }));
  }, [pricingSettings]);

  const [showValueBreakdown, setShowValueBreakdown] = useState<{ lower: number; upper: number; pkg10: any; pkg30: any } | null>(null);

  const setActiveTab = (tab: TabType) => {
    setSearchParams({ tab }, { replace: true });
  };

  const getPlanName = (planId: PlanTier) => {
    const plan = membershipPlans.find(p => p.id === planId);
    return plan?.name || planId.charAt(0).toUpperCase() + planId.slice(1);
  };

  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    if (success === 'true') {
      toast({ title: t('misc.plansMembershipActivatedTitle'), description: t('misc.plansMembershipActivatedDesc') });
      (async () => {
        await Promise.all([checkSubscription(), refreshProfile()]);
        // Slight delay so the page has settled before the burst.
        setTimeout(() => {
          // Member is free (no Stripe redirect), so any return here = paid tier.
          fireSignupConfetti(subscription?.planTier ?? null);
        }, 300);
      })();
      navigate('/plans?tab=plans', { replace: true });
    } else if (canceled === 'true') {
      toast({ title: t('misc.plansCheckoutCanceledTitle'), description: t('misc.plansCheckoutCanceledDesc'), variant: 'destructive' });
      navigate('/plans?tab=plans', { replace: true });
    }
  }, [searchParams]);

  useEffect(() => { setCurrentPlan(effectivePlan as PlanTier); }, [effectivePlan]);

  const handleSelectPlan = async (planId: PlanTier) => {
    if (!profile?.id) return;
    const tierRank: Record<PlanTier, number> = { member: 0, family: 1, scratch: 2, pro: 3, apex: 4 };
    const currentTier = (subscription?.subscribed ? subscription.planTier : 'member') as PlanTier;
    const isDowngrade =
      subscription?.subscribed &&
      tierRank[planId] < tierRank[currentTier];

    // Any downgrade (Pro→Scratch, Pro/Scratch→Member) → open Stripe Customer Portal.
    // Stripe handles cancel-at-period-end and plan switches; the user keeps their
    // current paid perks until the billing period ends (handled by check-subscription
    // + subscription_history grace logic).
    if (isDowngrade) {
      setLoadingCheckout(planId);
      try {
        const { data, error } = await supabase.functions.invoke('customer-portal');
        if (error) throw error;
        if (data?.url) {
          window.location.assign(data.url);
          return;
        }
        throw new Error('No portal URL received');
      } catch (error: any) {
        toast({
          title: t('misc.plansCouldNotOpenPortalTitle'),
          description: error.message || t('misc.plansTryAgainMoment'),
          variant: 'destructive',
        });
        setLoadingCheckout(null);
      }
      return;
    }

    if (planId === 'member') {
      // No active paid subscription → just persist the free Member tier locally.
      setSaving(true);
      try {
        const { error } = await supabase.from('profiles').update({ plan_tier: planId, plan_selected_at: new Date().toISOString() }).eq('id', profile.id);
        if (error) throw error;
        await refreshProfile();
        toast({ title: t('misc.plansPlanSelectedTitle'), description: t('misc.plansPlanSelectedDesc').replace('{plan}', getPlanName(planId)) });
        navigate('/dashboard');
      } catch (error: any) {
        toast({ title: t('misc.plansErrorTitle'), description: error.message || t('misc.plansFailedToSavePlan'), variant: 'destructive' });
      } finally { setSaving(false); }
      return;
    }
    setLoadingCheckout(planId);
    try {
      const priceId = membershipPlans.find(p => p.id === planId)?.priceId || '';
      const { data, error } = await supabase.functions.invoke('create-checkout', { body: { priceId } });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; } else { throw new Error('No checkout URL received'); }
    } catch (error: any) {
      toast({ title: t('misc.plansErrorTitle'), description: error.message || t('misc.plansFailedToStartCheckout'), variant: 'destructive' });
      setLoadingCheckout(null);
    }
  };

  const handlePurchase = async (
    priceId: string,
    mode: 'payment' | 'subscription' = 'payment',
    quantity: number = 1,
  ) => {
    setLoadingCheckout(priceId);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, mode, quantity },
      });
      if (error) throw error;
      if (data?.url) { window.location.href = data.url; } else { throw new Error('No checkout URL received'); }
    } catch (err: any) {
      toast({ title: t('misc.plansErrorTitle'), description: err.message || t('misc.plansFailedToStartCheckout'), variant: 'destructive' });
    } finally { setLoadingCheckout(null); }
  };

  // When an admin is previewing a tier, the "active subscription" UI should
  // reflect the previewed tier instead of the real Stripe subscription —
  // otherwise a Free Member preview would still show "Pro · Active".
  const isAdminPreview = role === 'admin' && !!previewTier;
  const realIsSubscribed = subscription?.subscribed;
  const realSubscribedTier = subscription?.planTier;
  const isSubscribed = isAdminPreview
    ? (previewTier !== 'free' && previewTier !== 'member')
    : realIsSubscribed;
  const subscribedTier = isAdminPreview ? previewTier : realSubscribedTier;
  const viewerIsPro = studentPreview.isStudentPreview ? studentPreview.effectivePlan === 'pro' : (isSubscribed && subscribedTier === 'pro');

  // Tab from URL param - Pro viewers land on lessons & packages, everyone else on memberships
  const activeTab = (searchParams.get('tab') as TabType) || (viewerIsPro ? 'pricing' : 'plans');

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader
        titleKey={activeTab === 'plans' ? 'admin.academyMembershipTitle' : 'admin.lessonPricingTitle'}
        subtitleKey={activeTab === 'plans' ? 'admin.academyMembershipSub' : 'admin.lessonPricingSub'}
        backTo="/dashboard"
      />

      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {(studentPreview.isStudentPreview ? studentPreview.effectivePlan === 'pro' : (isSubscribed && subscribedTier === 'pro')) && (
          <ProMembershipCard
            studentId={studentPreview.isStudentPreview ? studentPreview.studentId ?? undefined : profile?.id}
            name={studentPreview.isStudentPreview ? studentPreview.studentName : (profile as any)?.full_name}
            es={language === 'es'}
          />
        )}

        {/* ── Tab Switcher ── */}
        <div className="flex rounded-2xl p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setActiveTab('pricing')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'pricing' ? 'rgba(240,192,64,0.2)' : 'transparent',
              color: activeTab === 'pricing' ? '#F5F0E8' : 'rgba(232,213,176,0.4)',
              border: activeTab === 'pricing' ? '1px solid rgba(240,192,64,0.3)' : '1px solid transparent',
            }}
          >
            <Package className="h-3.5 w-3.5" />
            {t('misc.plansTabLessonsPackages')}
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'plans' ? 'rgba(74,124,89,0.25)' : 'transparent',
              color: activeTab === 'plans' ? '#F5F0E8' : 'rgba(232,213,176,0.4)',
              border: activeTab === 'plans' ? '1px solid rgba(74,124,89,0.4)' : '1px solid transparent',
            }}
          >
            <Crown className="h-3.5 w-3.5" />
            {t('misc.plansTabMemberships')}
          </button>
        </div>

        {/* ── PLANS TAB ── */}
        {activeTab === 'plans' && (
          <>
            {/* Current Membership Status */}
            {isSubscribed && (
              <div className="glass-card p-4 flex items-center gap-3" style={{ borderRadius: 16 }}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{
                  background:
                    subscribedTier === 'apex' ? 'rgba(56,135,255,0.2)' :
                    subscribedTier === 'pro' ? 'rgba(217,170,66,0.2)' :
                    'rgba(74,124,89,0.2)'
                }}>
                  {subscribedTier === 'apex' ? (
                    <Crown className="h-5 w-5" style={{ color: '#3887FF' }} />
                  ) : subscribedTier === 'pro' ? (
                    <Crown className="h-5 w-5" style={{ color: '#D9AA42' }} />
                  ) : (
                    <CheckCircle className="h-5 w-5" style={{ color: '#4a7c59' }} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>
                    {getPlanName(subscribedTier as PlanTier)} · {t('misc.plansActive')}
                  </p>
                  {isAdminPreview && (
                    <p className="text-[10px]" style={{ color: '#F0C040', opacity: 0.8 }}>
                      {t('misc.plansAdminPreviewOnly')}
                    </p>
                  )}
                </div>
                {!isAdminPreview && (
                  <Button variant="outline" size="sm" onClick={() => setShowManageModal(true)} className="btn-glass text-xs">
                    {t('misc.plansManage')}
                  </Button>
                )}
              </div>
            )}

            {/* Admin-only: preview celebration animations */}
            {role === 'admin' && (
              <div
                className="glass-card p-4"
                style={{
                  borderRadius: 16,
                  border: '1px dashed rgba(240,192,64,0.35)',
                  background: 'rgba(240,192,64,0.04)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: '#F0C040' }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#F0C040' }}>
                    {t('misc.plansAdminPreviewLabel')}
                  </p>
                </div>
                <p className="text-[11px] mb-3" style={{ color: '#E8D5B0', opacity: 0.55 }}>
                  {t('misc.plansAdminPreviewDesc')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fireSignupConfetti('scratch')}
                    className="h-9 text-xs font-semibold"
                    style={{ background: '#4a7c59', color: '#F5F0E8' }}
                  >
                    {t('misc.plansPreviewScratch')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fireSignupConfetti('pro')}
                    className="h-9 text-xs font-semibold"
                    style={{ background: 'linear-gradient(135deg, #D9AA42, #C49A38)', color: '#1a1a1a' }}
                  >
                    {t('misc.plansPreviewPro')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fireSignupConfetti('apex')}
                    className="h-9 text-xs font-semibold"
                    style={{ background: 'linear-gradient(135deg, #3887FF, #1E5FD8)', color: '#F5F0E8' }}
                  >
                    {t('misc.plansPreviewApex')}
                  </Button>
                </div>
              </div>
            )}

            {/* Academy Memberships */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#D9AA42' }} />
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  {t('misc.plansAcademyMembership')}
                </h2>
              </div>
              <p className="text-xs mb-5" style={{ color: '#E8D5B0', opacity: 0.4 }}>
                {t('misc.plansAcademyMembershipDesc')}
              </p>

              {/* Courtesy promo details (UI only) — countdown + terms, only while eligible. */}
              {courtesyEligible && (() => {
                // Whole days remaining until COURTESY_CAMPAIGN_END, America/Cancun (fixed UTC-5).
                const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun' });
                const nowDay = dayFmt.format(new Date());
                const endDay = dayFmt.format(COURTESY_CAMPAIGN_END);
                const daysLeft = Math.ceil(
                  (new Date(`${endDay}T00:00:00-05:00`).getTime() - new Date(`${nowDay}T00:00:00-05:00`).getTime()) / 86400000
                );
                if (daysLeft <= 0) return null;
                const endDate = new Date(`${endDay}T12:00:00-05:00`);
                const endLabel = new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', {
                  timeZone: 'America/Cancun', day: 'numeric', month: 'long', year: 'numeric',
                }).format(endDate);
                return (
                  <div
                    className="mb-5 p-4 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(240,192,64,0.12), rgba(74,124,89,0.06))',
                      border: '1px solid rgba(240,192,64,0.35)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 flex-shrink-0" style={{ color: '#F0C040' }} />
                      <p className="text-sm font-heading font-bold" style={{ color: '#F0C040' }}>
                        {daysLeft === 1
                          ? (language === 'es' ? 'Último día para activar' : 'Last day to activate')
                          : (language === 'es' ? `Quedan ${daysLeft} días para activar` : `${daysLeft} days left to activate`)}
                      </p>
                    </div>
                    <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#E8D5B0', opacity: 0.6 }}>
                      {language === 'es'
                        ? `Promoción de bienvenida, válida hasta el ${endLabel}. Elige el plan Pro y tus primeros 2 meses van por nuestra cuenta ($1,998 de cortesía). Pedimos una tarjeta para activar, pero no se te cobra durante los meses gratis. Al terminar, tu plan se renueva automáticamente al precio mensual mostrado; cancela cuando quieras antes de esa fecha. Válida una sola vez y solo para miembros sin suscripción previa.`
                        : `Welcome offer, valid through ${endLabel}. Pick the Pro plan and your first 2 months are on us ($1,998 MXN value). We ask for a card to activate, but you're not charged during the free months. When they end, your plan renews automatically at the monthly price shown; cancel anytime before then. Valid once, and only for members without a previous subscription.`}
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-stretch">
                {membershipPlans.map((plan, planIndex) => {
                  const isActiveSubscription = subscribedTier === plan.id;
                  const isLoading = loadingCheckout === plan.id;
                  const isApex = plan.id === 'apex';
                  const isPro = plan.id === 'pro';
                  const isPremium = isPro || isApex;
                  // Accent color for this plan card — straight from billing_plans.color.
                  const accent = plan.accent;
                  const isLightAccent = /^#([efd])/i.test(accent) || /^#f0c040|^#d9aa42|^#c9a84c|^#9ca3af/i.test(accent);
                  const accentTextOn = isLightAccent ? '#1a1a1a' : '#F5F0E8';
                  const BadgeIcon = plan.badgeIcon === 'Crown' ? Crown : plan.badgeIcon === 'Star' ? Star : Sparkles;
                  // Five cards: 3 on the first desktop row, 2 on the second.
                  const spanClass = planIndex < 3 ? 'lg:col-span-2' : 'lg:col-span-3';
                  // Courtesy months for this plan (0 = no badge).
                  const courtesyMonths = courtesyEligible ? (COURTESY_MONTHS_BY_TIER[plan.id] ?? 0) : 0;

                  return (
                    <div
                      key={plan.id}
                      className={`glass-card relative overflow-hidden transition-all h-full ${spanClass}`}
                      style={{
                        borderRadius: 20,
                        border: `1.5px solid ${accent}`,
                        background: `linear-gradient(135deg, ${hexToRgba(accent, 0.10)}, ${hexToRgba(accent, 0.03)})`,
                      }}
                    >
                      {isActiveSubscription && (
                        <div className="absolute top-0 left-0">
                          <Badge className="rounded-none rounded-br-lg text-[10px]" style={{
                            background: accent, color: accentTextOn, border: 'none'
                          }}>
                            <Check className="h-3 w-3 mr-1" /> {t('misc.plansActive')}
                          </Badge>
                        </div>
                      )}
                      {plan.badgeLabel && !isActiveSubscription && (
                        <div className="absolute top-0 right-0">
                          <Badge className="rounded-none rounded-bl-lg text-[10px]" style={{ background: accent, color: accentTextOn, border: 'none' }}>
                            <BadgeIcon className="h-3 w-3 mr-1" /> {plan.badgeLabel}
                          </Badge>
                        </div>
                      )}

                      <div className="p-4 md:p-5 flex flex-col h-full">
                        <div className="mb-3">
                          <h3 className="font-heading font-bold text-lg" style={{ color: accent }}>{plan.name}</h3>
                          <p className="text-[11px] mt-0.5" style={{ color: '#E8D5B0', opacity: 0.5 }}>{plan.description}</p>
                          {courtesyMonths > 0 && (
                            <div className="mt-2">
                              <Badge
                                className="text-[10px] font-semibold"
                                style={{ background: hexToRgba('#F0C040', 0.16), color: '#F0C040', border: '1px solid rgba(240,192,64,0.45)' }}
                              >
                                <Gift className="h-3 w-3 mr-1" />
                                {language === 'es'
                                  ? `${courtesyMonths} ${courtesyMonths === 1 ? 'mes gratis' : 'meses gratis'}`
                                  : `${courtesyMonths} ${courtesyMonths === 1 ? 'month free' : 'months free'}`}
                              </Badge>
                            </div>
                          )}
                          <div className="mt-2">
                            {courtesyMonths > 0 && (
                              <span className="text-[11px] mr-1" style={{ color: '#E8D5B0', opacity: 0.45 }}>
                                {language === 'es' ? 'luego' : 'then'}
                              </span>
                            )}
                            <span className="font-heading font-bold text-2xl" style={{ color: accent }}>
                              {plan.price}
                            </span>
                            {plan.period && (
                              <span className="text-xs ml-0.5" style={{ color: '#E8D5B0', opacity: 0.4 }}>
                                MXN {plan.period}
                              </span>
                            )}
                          </div>
                        </div>


                        <div className="space-y-2 mb-4 flex-1">
                          {plan.benefits.map((b) => {
                            const isApexAi = b.toLowerCase().includes('margea ai');
                            return (
                              <div key={b} className="flex items-center gap-2 text-xs" style={{ color: '#E8D5B0' }}>
                                {isApexAi ? (
                                  <Sparkles className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#F0C040' }} />
                                ) : (
                                  <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} />
                                )}
                                <span style={{ opacity: 0.8 }}>{b}</span>
                              </div>
                            );
                          })}
                          {/* Dynamic Value range for Pro */}
                          {isPro && !isApex && (() => {
                            const pkg10 = PACKAGES.find(p => p.lessons === 10);
                            const pkg30 = PACKAGES.find(p => p.lessons === 30);
                            if (!pkg10 || !pkg30 || !INDIVIDUAL_LESSON_PRICE) return null;
                            // Pro includes 1 free monthly video analysis (worth VIDEO_ANALYSIS_PRICE)
                            const lower = (pkg10.price - pkg10.proPrice) + VIDEO_ANALYSIS_PRICE;
                            const upper = (pkg30.price - pkg30.proPrice) + VIDEO_ANALYSIS_PRICE;
                            if (isNaN(lower) || isNaN(upper) || lower <= 0 || upper <= 0) return null;
                            return (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowValueBreakdown({ lower, upper, pkg10, pkg30 }); }}
                                className="flex items-center gap-2 text-xs text-left group w-full"
                                style={{ color: '#E8D5B0' }}
                              >
                                <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#D9AA42' }} />
                                <span style={{ opacity: 0.8 }} className="group-hover:opacity-100 transition-opacity">
                                  {t('misc.plansValueRangePrefix')} <span className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: '#D9AA42' }}>{fmtMXNStr(lower)} – {fmtMXNStr(upper)} MXN</span>
                                </span>
                                <Info className="h-3 w-3 flex-shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: '#D9AA42' }} />
                              </button>
                            );
                          })()}
                          {plan.excluded.map((b) => {
                            const isApexAi = b.toLowerCase().includes('margea ai');
                            return (
                              <div key={b} className="flex items-center gap-2 text-xs" style={{ color: '#E8D5B0', opacity: isApexAi ? 0.55 : 0.3 }}>
                                {isApexAi ? (
                                  <Sparkles className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#F0C040', opacity: 0.7 }} />
                                ) : (
                                  <span className="h-3.5 w-3.5 flex-shrink-0 flex items-center justify-center text-[10px]">—</span>
                                )}
                                <span>{b}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-auto">
                          {isPro && !isApex && (
                            <div className="mb-3 p-3 rounded-xl" style={{ background: 'rgba(217,170,66,0.08)', border: '1px solid rgba(217,170,66,0.15)' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#D9AA42' }}>
                                {language === 'es' ? 'Después de 4 meses, tu precio baja cada 2 meses hasta $499/mes' : 'After 4 months, your price drops every 2 months to $499/mo'}
                              </p>
                              <div className="grid grid-cols-3 gap-1.5">
                                {proPriceSteps().map(s => (
                                  <div key={s.fromMonth} className="rounded-lg px-1.5 py-1 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <p className="text-[9px]" style={{ color: '#E8D5B0', opacity: 0.6 }}>{proStepLabel(s, language === 'es' ? 'es' : 'en')}</p>
                                    <p className="text-xs font-semibold" style={{ color: '#E8D5B0' }}>${s.price}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {isPro && !isApex && (
                            <div className="mb-3 p-3 rounded-xl" style={{ background: 'rgba(217,170,66,0.08)', border: '1px solid rgba(217,170,66,0.15)' }}>
                              <div className="flex items-center gap-2 mb-2">
                                <Crown className="h-3.5 w-3.5" style={{ color: '#D9AA42' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#D9AA42' }}>{t('misc.plansProPrivileges')}</span>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                                  <Zap className="h-2.5 w-2.5 flex-shrink-0" style={{ color: '#D9AA42' }} />
                                  {t('misc.plansPreferredPricing')}
                                </p>
                                <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                                  <Video className="h-2.5 w-2.5 flex-shrink-0" style={{ color: '#D9AA42' }} />
                                  {t('misc.plansMonthlyVideoAnalysis')}
                                </p>
                                <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                                  <Calendar className="h-2.5 w-2.5 flex-shrink-0" style={{ color: '#D9AA42' }} />
                                  {t('misc.plansOnCourseAccess')}
                                </p>
                                <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                                  <Sparkles className="h-2.5 w-2.5 flex-shrink-0" style={{ color: '#D9AA42' }} />
                                  {t('misc.plansFullAcademyAccess')}
                                </p>
                              </div>
                            </div>
                          )}

                          {isApex && (
                            <div className="mb-3 p-3 rounded-xl" style={{ background: 'rgba(56,135,255,0.1)', border: '1px solid rgba(56,135,255,0.3)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <Crown className="h-3.5 w-3.5" style={{ color: '#3887FF' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#3887FF' }}>{t('misc.plansAllInclusive')}</span>
                              </div>
                              <p className="text-[10px]" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                                {t('misc.plansApexAllInclusiveDesc').replace('{coach}', t('common.yourCoach').charAt(0).toUpperCase() + t('common.yourCoach').slice(1))}
                              </p>
                            </div>
                          )}

                          <Button
                            onClick={() => handleSelectPlan(plan.id)}
                            disabled={saving || isLoading || checkingSubscription || isActiveSubscription}
                            className="w-full h-10 font-semibold text-sm"
                            style={!isActiveSubscription && plan.id !== 'member'
                              ? { background: accent, color: accentTextOn }
                              : undefined}
                            variant={!isActiveSubscription && plan.id !== 'member' ? undefined : 'secondary'}
                          >

                            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('misc.plansRedirecting')}</> :
                             saving ? t('misc.plansSaving') :
                             isActiveSubscription ? <><Check className="h-4 w-4 mr-2" />{t('misc.plansCurrent')}</> :
                             plan.id === 'member' ? (currentPlan === 'member' && !isSubscribed ? t('misc.plansCurrent') : t('misc.plansSelect')) :
                             t('misc.plansJoin').replace('{plan}', plan.name)}
                          </Button>

                          {isPro && !isApex && !isActiveSubscription && (
                            <p className="text-center text-[10px] mt-1.5" style={{ color: '#D9AA42', opacity: 0.85 }}>
                              {t('misc.plansBestValueMostPopular')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>


              <div className="mt-4 text-center">
                <p className="text-[11px]" style={{ color: '#E8D5B0', opacity: 0.3 }}>
                  {t('misc.plansIncludeNote')}
                </p>
              </div>
            </section>

            {/* Cross-link to pricing */}
            <button
              onClick={() => setActiveTab('pricing')}
              className="w-full glass-card p-4 flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ borderRadius: 16 }}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.15)' }}>
                  <Package className="h-4 w-4" style={{ color: '#F0C040' }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>{t('misc.plansLessonPricingPackages')}</p>
                  <p className="text-[11px]" style={{ color: '#E8D5B0', opacity: 0.4 }}>{t('misc.plansViewIndividualPackagesDesc')}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: '#E8D5B0', opacity: 0.3 }} />
            </button>
          </>
        )}

        {/* ── PRICING TAB ── */}
        {activeTab === 'pricing' && (
          <>
            {/* Individual Lesson */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#F0C040' }} />
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  {t('misc.plansIndividualLesson')}
                </h2>
              </div>
              <div className="glass-card p-5" style={{ borderRadius: 20 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading font-bold text-xl" style={{ color: '#F5F0E8' }}>
                      {individualQty} {individualQty === 1 ? t('misc.plansLesson') : t('misc.plansLessons')}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#E8D5B0', opacity: 0.5 }}>{t('misc.plansInPersonSession').replace('{coach}', t('common.yourCoach'))}</p>
                  </div>
                  <div className="text-right">
                    {viewerIsPro && PRO_INDIVIDUAL_LESSON_PRICE < INDIVIDUAL_LESSON_PRICE ? (
                      <>
                        <p className="text-xs line-through" style={{ color: '#E8D5B0', opacity: 0.45 }}>
                          {fmtMXNStr(INDIVIDUAL_LESSON_PRICE * individualQty)}
                        </p>
                        <p className="font-heading font-bold text-2xl" style={{ color: '#F0C040' }}>
                          {fmtMXN(PRO_INDIVIDUAL_LESSON_PRICE * individualQty)}
                        </p>
                        <p className="flex items-center justify-end gap-1 text-[10px] mt-0.5 font-medium" style={{ color: '#F0C040' }}>
                          <Crown className="h-2.5 w-2.5" />
                          {language === 'es' ? 'Tu precio Pro' : 'Your Pro price'}
                        </p>
                      </>
                    ) : (
                      <p className="font-heading font-bold text-2xl" style={{ color: '#E8D5B0' }}>
                        {fmtMXN(INDIVIDUAL_LESSON_PRICE * individualQty)}
                      </p>
                    )}
                    {individualQty > 1 && (
                      <p className="text-[10px] mt-0.5" style={{ color: '#E8D5B0', opacity: 0.5 }}>
                        {fmtMXNStr(viewerIsPro ? PRO_INDIVIDUAL_LESSON_PRICE : INDIVIDUAL_LESSON_PRICE)} {t('misc.plansMxnSuffix')} {t('misc.plansEach')}
                      </p>
                    )}
                    {!viewerIsPro && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveTab('plans'); }}
                        className="group flex items-center gap-1 mt-1 ml-auto transition-opacity hover:opacity-100"
                      >
                        <Crown className="h-2.5 w-2.5" style={{ color: '#D9AA42' }} />
                        <span className="text-[10px] font-medium" style={{ color: '#D9AA42', opacity: 0.85 }}>
                          {t('misc.plansWithProPlan').replace('{price}', `${fmtMXNStr(PRO_INDIVIDUAL_LESSON_PRICE * individualQty)} ${t('misc.plansMxnSuffix')}`)}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                {/* Quantity selector */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.6 }}>
                    {t('misc.plansQuantity')}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIndividualQty((q) => Math.max(1, q - 1))}
                      disabled={individualQty <= 1 || loadingCheckout === INDIVIDUAL_LESSON_PRICE_ID}
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                      aria-label={t('misc.plansDecreaseQuantity')}
                    >
                      <Minus className="h-4 w-4" style={{ color: '#F5F0E8' }} />
                    </button>
                    <span className="font-heading font-bold text-lg w-8 text-center" style={{ color: '#F5F0E8' }}>
                      {individualQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIndividualQty((q) => Math.min(9, q + 1))}
                      disabled={individualQty >= 9 || loadingCheckout === INDIVIDUAL_LESSON_PRICE_ID}
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(74,124,89,0.2)', border: '1px solid rgba(74,124,89,0.4)' }}
                      aria-label={t('misc.plansIncreaseQuantity')}
                    >
                      <Plus className="h-4 w-4" style={{ color: '#4a7c59' }} />
                    </button>
                  </div>
                </div>
                <Button
                  onClick={() => handlePurchase(INDIVIDUAL_LESSON_PRICE_ID, 'payment', individualQty)}
                  disabled={loadingCheckout === INDIVIDUAL_LESSON_PRICE_ID}
                  className="w-full mt-4 btn-green h-11"
                >
                  {loadingCheckout === INDIVIDUAL_LESSON_PRICE_ID ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('misc.plansProcessing')}</>
                  ) : (
                    <>{t('misc.plansPay').replace('{amount}', fmtMXNStr((viewerIsPro ? PRO_INDIVIDUAL_LESSON_PRICE : INDIVIDUAL_LESSON_PRICE) * individualQty))}<ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </section>

            {/* Lesson Packages */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#4a7c59' }} />
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  {t('misc.plansLessonPackages')}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59' }}>
                  {t('misc.plansSaveMore')}
                </span>
              </div>
              <div className="space-y-3">
                {PACKAGES.map((pkg) => (
                  <button
                    key={pkg.lessons}
                    onClick={() => handlePurchase(pkg.priceId)}
                    disabled={loadingCheckout !== null}
                    className="w-full relative glass-card p-5 text-left transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                    style={{
                      borderRadius: 20,
                    }}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full"
                        style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                        {t('misc.plansBestValueBadge')}
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading font-bold text-lg" style={{ color: '#F5F0E8' }}>{pkg.lessons} {t('misc.plansLessons')}</p>
                        {viewerIsPro ? (
                          <>
                            <p className="flex items-center gap-1 mt-0.5 text-xs font-semibold" style={{ color: '#F0C040' }}>
                              <Crown className="h-3 w-3" />
                              {language === 'es' ? `Tu precio Pro: ${fmtMXNStr(pkg.proPerLesson)} c/u` : `Your Pro price: ${fmtMXNStr(pkg.proPerLesson)} ea`}
                            </p>
                            <p className="text-[10px] mt-0.5 line-through" style={{ color: '#E8D5B0', opacity: 0.4 }}>
                              {language === 'es' ? 'Público' : 'Public'}: {fmtMXNStr(pkg.perLesson)} c/u
                            </p>
                          </>
                        ) : (<>
                        <p className="text-xs mt-0.5" style={{ color: '#E8D5B0', opacity: 0.5 }}>
                          {fmtMXN(pkg.perLesson)} {t('misc.plansPerLesson')}
                        </p>
                        <p className="flex items-center gap-1 mt-0.5">
                          <Crown className="h-2.5 w-2.5" style={{ color: '#D9AA42' }} />
                          <span className="text-[10px] font-medium" style={{ color: '#D9AA42', opacity: 0.85 }}>
                            {t('misc.plansWithProPlan').replace('{price}', `${fmtMXNStr(pkg.proPerLesson)} ${t('misc.plansEaShort')}`)}
                          </span>
                        </p>
                        </>)}
                      </div>
                      <div className="text-right flex items-center gap-3">
                        {viewerIsPro ? (
                          <div className="text-right">
                            <p className="font-heading font-bold text-xl" style={{ color: '#F0C040' }}>{fmtMXN(pkg.proPrice)}</p>
                            <p className="text-[10px] line-through" style={{ color: '#E8D5B0', opacity: 0.4 }}>{fmtMXNStr(pkg.price)}</p>
                            <p className="text-[10px] font-semibold" style={{ color: '#4a7c59' }}>
                              {language === 'es' ? 'Ahorras' : 'You save'} {fmtMXNStr(pkg.price - pkg.proPrice)}
                            </p>
                          </div>
                        ) : (<>
                        <p className="font-heading font-bold text-xl" style={{ color: '#E8D5B0' }}>{fmtMXN(pkg.price)}</p>
                        <p className="text-[10px] text-right font-medium" style={{ color: '#D9AA42', opacity: 0.85 }}>
                          {fmtMXNStr(pkg.proPrice)}
                        </p>
                        </>)}
                        {loadingCheckout === pkg.priceId ? (
                          <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#4a7c59' }} />
                        ) : (
                          <ChevronRight className="h-5 w-5" style={{ color: '#F5F0E8', opacity: 0.3 }} />
                        )}
                      </div>
                    </div>
                    {pkg.lessons >= 20 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3" style={{ color: '#4a7c59' }} />
                        <span className="text-[10px]" style={{ color: '#4a7c59' }}>
                          {t('misc.plansSaveVsIndividual').replace('{amount}', fmtMXNStr((INDIVIDUAL_LESSON_PRICE * pkg.lessons) - pkg.price))}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Video Analysis */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                <h2 className="text-sm font-heading font-semibold uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  {t('misc.plansVideoAnalysis')}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                  {t('misc.plansAllTiers')}
                </span>
              </div>
              <div className="glass-card p-5" style={{ borderRadius: 20, border: '1px solid rgba(245,158,11,0.15)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
                      <Video className="h-5 w-5" style={{ color: '#f59e0b' }} />
                    </div>
                    <div>
                      <p className="font-heading font-bold text-base" style={{ color: '#F5F0E8' }}>{t('misc.plansVideoAnalysis')}</p>
                      <p className="text-[11px]" style={{ color: '#E8D5B0', opacity: 0.5 }}>{t('misc.plansDetailedFeedback')}</p>
                    </div>
                  </div>
                  <p className="font-heading font-bold text-xl" style={{ color: '#f59e0b' }}>{fmtMXN(VIDEO_ANALYSIS_PRICE)}</p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {[t('misc.plansSwingBreakdown'), t('misc.plansAreasForImprovement'), t('misc.plansDrillRecommendations'), t('misc.plansOneBusinessDayDelivery')].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px]" style={{ color: '#E8D5B0', opacity: 0.6 }}>
                      <span style={{ color: '#4a7c59' }}>✓</span> {item}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] mt-3 text-center" style={{ color: '#E8D5B0', opacity: 0.35 }}>
                  {t('misc.plansUploadFromDashboard')}
                </p>
              </div>
            </section>

            {/* Cross-link to memberships */}
            <button
              onClick={() => setActiveTab('plans')}
              className="w-full glass-card p-4 flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ borderRadius: 16 }}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.15)' }}>
                  <Crown className="h-4 w-4" style={{ color: '#4a7c59' }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>{t('misc.plansAcademyMembershipsTitle')}</p>
                  <p className="text-[11px]" style={{ color: '#E8D5B0', opacity: 0.4 }}>{t('misc.plansUnlockPricingDesc')}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: '#E8D5B0', opacity: 0.3 }} />
            </button>
          </>
        )}

        {/* Help Section */}
        <section className="text-center pb-4">
          <p className="text-xs mb-3" style={{ color: '#E8D5B0', opacity: 0.4 }}>
            {t('misc.plansNeedHelp')}
          </p>
          <div className="flex justify-center gap-3">
            <a href="https://wa.me/19153143415?text=Hi%20Santi!%20Tengo%20una%20pregunta%20sobre%20la%20membresía" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="btn-glass text-xs gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {t('misc.plansWhatsapp')}
              </Button>
            </a>
            <a href="mailto:admin@margeatravel.com?subject=SC%20Golf%20Academy%20-%20Membership%20Question">
              <Button variant="outline" size="sm" className="btn-glass text-xs gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {t('misc.plansEmail')}
              </Button>
            </a>
          </div>
        </section>
      </main>

      <SocialFooter />

      {/* Manage Membership Modal */}
      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('misc.plansManageMembership')}</DialogTitle>
            <DialogDescription>
              {t('misc.plansManageMembershipDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              variant="default"
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('customer-portal');
                  if (error) throw error;
                  if (data?.url) {
                    window.location.assign(data.url);
                    return;
                  }
                  throw new Error('No portal URL received');
                } catch (err: any) {
                  toast({
                    title: t('misc.plansCouldNotOpenPortalTitle'),
                    description: err.message || t('misc.plansTryAgainMoment'),
                    variant: 'destructive',
                  });
                }
              }}
            >
              <CreditCard className="h-4 w-4 mr-2" /> {t('misc.plansOpenBillingPortal')}
            </Button>
            <Button asChild variant="outline">
              <a href="mailto:admin@margeatravel.com?subject=SC%20Golf%20Academy%20Membership%20Help">
                <Mail className="h-4 w-4 mr-2" /> {t('misc.plansEmailSupport')}
              </a>
            </Button>
            <Button variant="secondary" onClick={() => setShowManageModal(false)}>{t('misc.plansClose')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Value Breakdown Modal */}
      <Dialog open={!!showValueBreakdown} onOpenChange={() => setShowValueBreakdown(null)}>
        <DialogContent className="sm:max-w-sm bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8]">
          <DialogHeader>
            <DialogTitle className="text-[#F5F0E8] flex items-center gap-2">
              <Crown className="h-4 w-4" style={{ color: '#D9AA42' }} />
              {t('misc.plansProPlanValue')}
            </DialogTitle>
            <DialogDescription className="text-[#E8D5B0]/50 text-xs">
              {t('misc.plansHowSavingsCalculated')}
            </DialogDescription>
          </DialogHeader>
          {showValueBreakdown && (
            <div className="space-y-4 pt-2">
              {/* Formula explanation */}
              <div className="p-3 rounded-xl" style={{ background: 'rgba(217,170,66,0.06)', border: '1px solid rgba(217,170,66,0.12)' }}>
                <p className="text-[11px] font-medium mb-2" style={{ color: '#D9AA42' }}>{t('misc.plansValueFormula')}</p>
                <p className="text-[10px]" style={{ color: '#E8D5B0', opacity: 0.5 }}>
                  {t('misc.plansValueFormulaDesc').replace('{amount}', fmtMXNStr(VIDEO_ANALYSIS_PRICE))}
                </p>
              </div>

              {/* 10-class breakdown */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: '#F5F0E8' }}>{t('misc.plansWith10Lessons')}</p>
                <div className="flex justify-between text-[11px]" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  <span>{t('misc.plansPackageSavings')}</span>
                  <span>{fmtMXNStr(showValueBreakdown.pkg10.price - showValueBreakdown.pkg10.proPrice)} {t('misc.plansMxnSuffix')}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold" style={{ color: '#F5F0E8' }}>
                  <span>{t('misc.plansFreeMonthlyAnalysis')}</span>
                  <span>{fmtMXNStr(VIDEO_ANALYSIS_PRICE)} {t('misc.plansMxnSuffix')}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#D9AA42' }}>
                  <span>{t('misc.plansTotalValue')}</span>
                  <span>{fmtMXNStr(showValueBreakdown.lower)} {t('misc.plansMxnSuffix')}</span>
                </div>
              </div>

              {/* 30-class breakdown */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: '#F5F0E8' }}>{t('misc.plansWith30Lessons')}</p>
                <div className="flex justify-between text-[11px]" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  <span>{t('misc.plansPackageSavings')}</span>
                  <span>{fmtMXNStr(showValueBreakdown.pkg30.price - showValueBreakdown.pkg30.proPrice)} {t('misc.plansMxnSuffix')}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold" style={{ color: '#F5F0E8' }}>
                  <span>{t('misc.plansFreeMonthlyAnalysis')}</span>
                  <span>{fmtMXNStr(VIDEO_ANALYSIS_PRICE)} {t('misc.plansMxnSuffix')}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#D9AA42' }}>
                  <span>{t('misc.plansTotalValue')}</span>
                  <span>{fmtMXNStr(showValueBreakdown.upper)} {t('misc.plansMxnSuffix')}</span>
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowValueBreakdown(null)}
              >
                {t('misc.plansGotIt')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
