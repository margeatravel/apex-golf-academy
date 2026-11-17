import { useState, useMemo } from 'react';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, ChevronRight, Crown, ArrowLeft, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LinkCoachCard } from '@/components/LinkCoachCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { PaymentMethodSelector } from '@/components/PaymentMethodSelector';
import { useCoachLessonPricing } from '@/hooks/useCoachLessonPricing';
import { getFunctionErrorMessage } from '@/lib/functionError';

interface PackageSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PackageInfo {
  lessons: number;
  price: number;
  priceId: string;
  perLesson: number;
  popular: boolean;
  proPrice: number;
  proPerLesson: number;
  proPriceId: string;
}

const FALLBACK_PACKAGES: PackageInfo[] = [
  { lessons: 10, price: 14850, priceId: 'price_1TKkYkRw8gEMe8Y7CxohteUh', perLesson: 1485, popular: false, proPrice: 12000, proPerLesson: 1200, proPriceId: '' },
  { lessons: 20, price: 26500, priceId: 'price_1TKkZBRw8gEMe8Y7ILw4uq23', perLesson: 1325, popular: true, proPrice: 22000, proPerLesson: 1100, proPriceId: '' },
  { lessons: 30, price: 34650, priceId: 'price_1TKka4Rw8gEMe8Y734Dn03uo', perLesson: 1155, popular: false, proPrice: 30000, proPerLesson: 1000, proPriceId: '' },
];

export function PackageSelectionModal({ open, onOpenChange }: PackageSelectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<PackageInfo | null>(null);
  const { effectivePlan, hasLinkedCoach, profile, previewCoachPricingId } = useAuth();
  const isPro = effectivePlan === 'pro';
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: pricingSettings } = useCoachLessonPricing(
    previewCoachPricingId ?? profile?.assigned_coach_id,
  );

  const INDIVIDUAL_LESSON_PRICE = pricingSettings?.individual_price ?? 1650;

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
      proPriceId: pkg.pro_price_id || '',
    }));
  }, [pricingSettings]);

  const handleConfirmPurchase = async () => {
    if (!selectedPkg) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('packages.signInToContinue'));
        return;
      }
      if (isPro && !selectedPkg.proPriceId) {
        toast(t('packages.proDiscountNotConfiguredPkg'), {
          description: t('packages.proDiscountAdminHintPkg'),
        });
      }
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          mode: 'payment',
          item: 'package',
          packageSize: selectedPkg.lessons,
          coachId: previewCoachPricingId ?? profile?.assigned_coach_id ?? null,
          currency: 'mxn',
        },
      });
      if (error) {
        toast.error(await getFunctionErrorMessage(error, t('packages.errorProcessingPayment')));
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || t('packages.errorProcessingPayment'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) setSelectedPkg(null);
    onOpenChange(val);
  };

  const goToPlans = () => {
    setSelectedPkg(null);
    onOpenChange(false);
    navigate('/plans');
  };

  // Defense-in-depth: if this modal is somehow opened without a linked coach
  // (deep link, future caller, etc.), don't show prices — render the link-coach
  // gate inline instead. The dashboard entry points already pre-gate this, so
  // most users never see this branch.
  if (open && !hasLinkedCoach) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-center gap-2">
              <DialogTitle className="text-[#F5F0E8] text-xl font-semibold text-center">
                {t('packages.linkCoachFirst')}
              </DialogTitle>
            </div>
            <p className="text-[#F5F0E8]/55 text-sm text-center mt-1">
              {t('packages.linkCoachFirstSub')}
            </p>
          </DialogHeader>
          <div className="px-5 pb-6 pt-3">
            <LinkCoachCard variant="card" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Checkout confirmation view ──
  if (selectedPkg) {
    const effectivePackagePrice = isPro ? selectedPkg.proPrice : selectedPkg.price;
    const effectivePerLesson = isPro ? selectedPkg.proPerLesson : selectedPkg.perLesson;
    const savings = (INDIVIDUAL_LESSON_PRICE * selectedPkg.lessons) - effectivePackagePrice;
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3">
            <button
              onClick={() => setSelectedPkg(null)}
              className="absolute left-4 top-4 text-[#F5F0E8]/50 hover:text-[#F5F0E8] transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <DialogTitle className="text-[#F5F0E8] text-xl font-semibold text-center">
              {t('packages.confirmPurchase')}
            </DialogTitle>
            {isPro && (
              <div className="flex justify-center mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.4)', color: '#F0C040' }}>
                  <Crown className="h-3 w-3" /> {t('dashboard.proMemberPrice')}
                </span>
              </div>
            )}
          </DialogHeader>

          <div className="px-6 pb-6 space-y-5">
            {/* Package summary card */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: 'linear-gradient(135deg, rgba(74,124,89,0.3), rgba(74,124,89,0.08))',
                border: '1px solid rgba(74,124,89,0.4)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.3)' }}>
                  <ShoppingCart className="h-5 w-5 text-[#4a7c59]" />
                </div>
                <div>
                  <p className="text-[#F5F0E8] font-heading font-bold text-lg">
                    {t('packages.lessonPackageTitle').replace('{n}', String(selectedPkg.lessons))}
                  </p>
                  <p className="text-[#E8D5B0]/50 text-xs">{t('packages.privateGolf60')}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#F5F0E8]/60 text-sm">{t('packages.numberOfLessons')}</span>
                  <span className="text-[#F5F0E8] font-semibold">{selectedPkg.lessons}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#F5F0E8]/60 text-sm">{t('packages.pricePerLesson')}</span>
                  <span className="text-[#F5F0E8] font-semibold">{fmtMXN(effectivePerLesson)}</span>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm flex items-center gap-1" style={{ color: '#7BC894' }}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t('packages.savingsVsIndividual')}
                    </span>
                    <span className="font-semibold" style={{ color: '#7BC894' }}>{fmtMXN(savings)}</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2.5 flex justify-between items-center">
                  <span className="text-[#F5F0E8] font-semibold">{t('packages.total')}</span>
                  <span className="text-[#E8D5B0] font-heading font-bold text-2xl">{fmtMXN(effectivePackagePrice)}</span>
                </div>
              </div>
            </div>

            {/* Pro plan upsell — hidden when student is already Pro */}
            {!isPro && selectedPkg.proPrice < selectedPkg.price && (
              <button
                type="button"
                onClick={goToPlans}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                style={{ background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.32)' }}
              >
                <div className="flex items-center gap-2 min-w-0 text-left">
                  <Crown className="h-4 w-4 shrink-0" style={{ color: '#F0C040' }} />
                  <p className="text-[11px] font-semibold" style={{ color: '#F0C040' }}>
                    {t('dashboard.getProPlan')}: {fmtMXNStr(selectedPkg.proPrice)} ({fmtMXNStr(selectedPkg.proPerLesson)}/{t('packages.perLesson')})
                  </p>
                </div>
                <span className="text-[11px] font-bold shrink-0" style={{ color: '#F0C040' }}>{t('dashboard.subscribeArrow')}</span>
              </button>
            )}

            {/* CTA */}
            <PaymentMethodSelector
              totalAmount={effectivePackagePrice}
              concept="Lesson Package"
              onStripeCheckout={handleConfirmPurchase}
              onOfflinePaymentCreated={() => {
                setSelectedPkg(null);
                onOpenChange(false);
              }}
              stripeLoading={loading}
              lessonsCredited={selectedPkg.lessons}
              packageName={`${selectedPkg.lessons}-Lesson Package`}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Package selection view ──
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-[#F5F0E8] text-xl font-semibold text-center">
            {t('packages.chooseYourPackage')}
          </DialogTitle>
          <p className="text-[#F5F0E8]/50 text-sm text-center mt-1">
            {t('packages.investSubtitle')}
          </p>
        </DialogHeader>

        <div className="px-5 pb-6 space-y-3">
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.lessons}
              onClick={() => setSelectedPkg(pkg)}
              className="w-full relative rounded-2xl p-5 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: pkg.popular
                  ? 'linear-gradient(135deg, rgba(74,124,89,0.4), rgba(74,124,89,0.15))'
                  : 'rgba(255,255,255,0.05)',
                border: pkg.popular
                  ? '1.5px solid rgba(74,124,89,0.6)'
                  : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {pkg.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full"
                  style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                  {t('packages.mostPopular')}
                </span>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#F5F0E8] font-heading font-bold text-lg">
                    {t('packages.lessonsCount').replace('{n}', String(pkg.lessons))}
                  </p>
                  <p className="text-[#E8D5B0]/60 text-xs mt-0.5">
                    {fmtMXN(isPro ? pkg.proPerLesson : pkg.perLesson)} {t('packages.perLesson')}
                  </p>
                  {isPro && (
                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.4)', color: '#F0C040' }}>
                      <Crown className="h-2.5 w-2.5" /> {t('packages.proPrice')}
                    </span>
                  )}
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-[#E8D5B0] font-heading font-bold text-xl">
                      {fmtMXN(isPro ? pkg.proPrice : pkg.price)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#F5F0E8]/30" />
                </div>
              </div>

              {!isPro && pkg.proPerLesson < pkg.perLesson && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); goToPlans(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); goToPlans(); }
                  }}
                  className="mt-2 ml-auto flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Crown className="h-3 w-3" style={{ color: '#F0C040' }} />
                  <span className="text-[11px] font-semibold" style={{ color: '#F0C040' }}>
                    {t('packages.withPro')}: {fmtMXNStr(pkg.proPrice)} ({fmtMXNStr(pkg.proPerLesson)}/{t('packages.perLesson')}) →
                  </span>
                </span>
              )}

              {(INDIVIDUAL_LESSON_PRICE * pkg.lessons) > (isPro ? pkg.proPrice : pkg.price) && (
                <div className="mt-2 flex items-center gap-1.5">
                  <CheckCircle className="h-3 w-3" style={{ color: '#7BC894' }} />
                  <span className="text-[11px] font-semibold" style={{ color: '#E8D5B0' }}>
                    {t('packages.saveVsIndividual').split('{amount}')[0]}{fmtMXN((INDIVIDUAL_LESSON_PRICE * pkg.lessons) - (isPro ? pkg.proPrice : pkg.price))}{t('packages.saveVsIndividual').split('{amount}')[1]}
                  </span>
                </div>
              )}

            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
