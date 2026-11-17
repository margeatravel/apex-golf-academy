import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendlyBooking } from '@/components/CalendlyBooking';
import { SocialFooter } from '@/components/SocialFooter';
import ApexBrand from '@/components/ApexBrand';
import { fireSignupConfetti } from '@/lib/confetti';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CheckCircle2, Calendar, Package, Loader2, AlertTriangle,
  ArrowRight, Video, Home, Sparkles, RefreshCw
} from 'lucide-react';

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

type VerifyResult = {
  verified: boolean;
  purchase_type: string;
  product_name: string;
  amount: number;
  currency: string;
  package_size: number;
  entitlement: any;
  session_mode: string;
  customer_email: string;
  status?: string;
  message?: string;
};

export default function PaymentSuccess() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError(t('misc.paySuccessNoSession'));
      return;
    }

    const verify = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('verify-checkout', {
          body: { session_id: sessionId },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setResult(data as VerifyResult);
      } catch (e: any) {
        setError(e.message || t('misc.paySuccessCouldNotVerify'));
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [sessionId]);

  // Fire confetti once when a paid subscription has been verified.
  // Free Member never reaches this page (no Stripe redirect), so any
  // verified subscription here is a paid tier.
  useEffect(() => {
    if (!result?.verified || result.purchase_type !== 'subscription') return;
    const name = (result.product_name || '').toLowerCase();
    const tier =
      name.includes('apex') ? 'apex' :
      name.includes('pro') ? 'pro' :
      name.includes('scratch') ? 'scratch' :
      null;
    if (!tier) return;
    const t = setTimeout(() => fireSignupConfetti(tier), 200);
    return () => clearTimeout(t);
  }, [result?.verified, result?.purchase_type, result?.product_name]);

  const studentEmail = profile?.email || user?.email || '';
  const studentName = profile?.full_name || '';

  // Loading state
  if (loading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto" style={{ color: '#4a7c59' }} />
          <p style={{ color: '#F5F0E8', fontSize: 16 }}>{t('misc.paySuccessVerifying')}</p>
          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 13 }}>{t('misc.paySuccessMomentNote')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !result?.verified) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-8 max-w-md w-full text-center space-y-6">
          <AlertTriangle className="h-12 w-12 mx-auto" style={{ color: '#fbbf24' }} />
          <div>
            <h1 style={{ color: '#F5F0E8', fontSize: 22, fontWeight: 700 }}>{t('misc.paySuccessPendingTitle')}</h1>
            <p style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 14 }} className="mt-2">
              {error || result?.message || t('misc.paySuccessPendingFallback')}
            </p>
          </div>
          <div className="space-y-3">
            <Button onClick={() => navigate('/dashboard')} className="w-full gap-2" style={{ background: 'rgba(74,124,89,0.3)', color: '#4a7c59' }}>
              <Home className="h-4 w-4" /> {t('misc.paySuccessGoDashboard')}
            </Button>
            <p style={{ color: '#E8D5B0', opacity: 0.4, fontSize: 11 }}>
              {t('misc.paySuccessChargedNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isIndividual = result.purchase_type === 'individual_lesson';
  const isPackage = result.purchase_type === 'lesson_package';
  const isVideoAnalysis = result.purchase_type === 'video_analysis';
  const isSubscription = result.purchase_type === 'subscription';

  return (
    <div className="app-bg min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="flex justify-center mb-2"><ApexBrand size="md" align="center" /></div>
        </div>

        {/* Success confirmation */}
        <div className="glass-card p-6 text-center space-y-4">
          <div className="relative inline-block">
            <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'rgba(74,124,89,0.2)', boxShadow: '0 0 30px rgba(74,124,89,0.3)' }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: '#4a7c59' }} />
            </div>
            <Sparkles className="h-5 w-5 absolute -top-1 -right-1" style={{ color: '#f0c040' }} />
          </div>

          <div>
            <h1 style={{ color: '#F5F0E8', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {t('misc.paySuccessTitle')}
            </h1>
            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 14 }} className="mt-1">
              {t('misc.paySuccessThankYou')}
            </p>
          </div>

          {/* Purchase details */}
          <div className="py-3 px-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <span style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>{t('misc.paySuccessProduct')}</span>
              <span style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{result.product_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>{t('misc.paySuccessAmount')}</span>
              <span style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>
                {formatPrice(result.amount, result.currency)}
                <span style={{ opacity: 0.4, fontSize: 10 }}> {result.currency.toUpperCase()}</span>
              </span>
            </div>
            {isPackage && (
              <div className="flex items-center justify-between">
                <span style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>{t('misc.paySuccessLessonsIncluded')}</span>
                <Badge style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59', border: 'none' }}>
                  {t('misc.paySuccessLessonsBadge').replace('{n}', String(result.package_size))}
                </Badge>
              </div>
            )}
          </div>

          {/* Refresh hint — applies to every purchase type */}
          <div
            className="flex items-start gap-3 text-left p-3 rounded-xl"
            style={{ background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.25)' }}
          >
            <RefreshCw className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#f0c040' }} />
            <div className="space-y-0.5">
              <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 600 }}>
                {t('misc.paySuccessDontSee')}
              </p>
              <p style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 12, lineHeight: 1.45 }}>
                {isSubscription
                  ? t('misc.paySuccessRefreshSub')
                  : isPackage
                  ? t('misc.paySuccessRefreshPackage')
                  : isIndividual
                  ? t('misc.paySuccessRefreshIndividual')
                  : t('misc.paySuccessRefreshGeneric')}
              </p>
            </div>
          </div>
        </div>

        {/* Next steps — product-type-aware */}
        <div className="glass-card p-6 space-y-4">
          {(isIndividual || isPackage) && (
            <>
              <div className="text-center space-y-2">
                <Calendar className="h-6 w-6 mx-auto" style={{ color: '#60a5fa' }} />
                <h2 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>
                  {isIndividual ? t('misc.paySuccessScheduleLesson') : t('misc.paySuccessScheduleFirstLesson')}
                </h2>
                <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
                  {isIndividual
                    ? t('misc.paySuccessChooseTimeIndividual')
                    : t('misc.paySuccessChooseTimePackage').replace('{n}', String(result.package_size))}
                </p>
              </div>

              <CalendlyBooking
                prefillEmail={studentEmail}
                triggerButton={
                  <Button className="w-full h-12 text-base gap-2 font-semibold"
                    style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                    <Calendar className="h-5 w-5" />
                    {isIndividual ? t('misc.paySuccessScheduleLesson') : t('misc.paySuccessScheduleFirstLesson')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                }
              />

              {isPackage && (
                <p style={{ color: '#E8D5B0', opacity: 0.4, fontSize: 11 }} className="text-center">
                  {t('misc.paySuccessScheduleAnytime')}
                </p>
              )}
            </>
          )}

          {isVideoAnalysis && (
            <div className="text-center space-y-3">
              <Video className="h-6 w-6 mx-auto" style={{ color: '#60a5fa' }} />
              <h2 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>{t('misc.paySuccessVideoPurchased')}</h2>
              <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
                {t('misc.paySuccessVideoNextSteps')}
              </p>
              <Button onClick={() => navigate('/videos/upload')} className="w-full h-12 gap-2" style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                <Video className="h-5 w-5" /> {t('misc.paySuccessUploadVideo')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isSubscription && (
            <div className="text-center space-y-3">
              <Sparkles className="h-6 w-6 mx-auto" style={{ color: '#f0c040' }} />
              <h2 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>{t('misc.paySuccessSubscriptionActivated')}</h2>
              <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
                {t('misc.paySuccessSubscriptionDesc')}
              </p>
              <Button onClick={() => navigate('/pro-zone?tour=1')} className="w-full h-12 gap-2" style={{ background: '#f0c040', color: '#000' }}>
                <Sparkles className="h-5 w-5" /> {t('misc.paySuccessEnterProZone')}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => navigate('/dashboard')} variant="ghost" className="w-full h-10 gap-2 text-ivory/70 hover:text-ivory hover:bg-white/10">
                <Home className="h-4 w-4" /> {t('misc.paySuccessOrGoDashboard')}
              </Button>
            </div>
          )}

          {!isIndividual && !isPackage && !isVideoAnalysis && !isSubscription && (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-6 w-6 mx-auto" style={{ color: '#4a7c59' }} />
              <h2 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>{t('misc.paySuccessAllSet')}</h2>
              <Button onClick={() => navigate('/dashboard')} className="w-full h-12 gap-2" style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                <Home className="h-5 w-5" /> {t('misc.paySuccessGoDashboard')}
              </Button>
            </div>
          )}
        </div>

        {/* Secondary action */}
        <div className="text-center">
          <Link to="/dashboard" style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 13 }} className="hover:opacity-80 inline-flex items-center gap-1">
            <Home className="h-3.5 w-3.5" /> {t('misc.paySuccessBackToDashboard')}
          </Link>
        </div>
      </div>
      <SocialFooter />
    </div>
  );
}
