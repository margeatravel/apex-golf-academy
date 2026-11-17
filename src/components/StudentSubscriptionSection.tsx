import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import { CreditCard, Loader2, RotateCcw, Settings2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SubRow {
  id: string;
  plan_tier: string | null;
  plan_name: string | null;
  status: string | null;
  is_active: boolean;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  current_period_end: string | null;
  archived_at: string | null;
}

/** Maps plan_tier to the billing_plans row name used for pricing. */
const TIER_PLAN_NAME: Record<string, string> = {
  family: 'familiar',
  scratch: 'scratch',
  pro: 'pro',
  apex: 'apex level',
};

/** Localized long date, e.g. "26 de septiembre de 2026" / "September 26, 2026". */
function formatDate(value: string | Date | null | undefined, locale: string): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

type PendingAction = 'cancel' | 'reactivate' | null;

/**
 * Student self-service subscription panel.
 * Every Stripe action runs in the `manage-my-subscription` Edge Function, which
 * derives ownership from the caller's JWT (never from client-sent ids).
 */
export function StudentSubscriptionSection() {
  const { user, refreshProfile } = useAuth() as any;
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [priceMxn, setPriceMxn] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirm, setConfirm] = useState<PendingAction>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('subscriptions')
      .select('id, plan_tier, plan_name, status, is_active, cancel_at_period_end, cancel_at, current_period_end, archived_at')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = (data as unknown as SubRow) ?? null;
    setSub(row);

    // Monthly price comes from billing_plans (price_amount is in cents).
    const planName = row?.plan_tier ? TIER_PLAN_NAME[row.plan_tier] : undefined;
    if (planName) {
      const { data: planRow } = await supabase
        .from('billing_plans')
        .select('price_amount')
        .ilike('name', planName)
        .eq('plan_type', 'subscription')
        .limit(1)
        .maybeSingle();
      setPriceMxn(typeof planRow?.price_amount === 'number' ? planRow.price_amount / 100 : null);
    } else {
      setPriceMxn(null);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const isActive =
    !!sub && !sub.archived_at && sub.is_active &&
    (sub.status === 'active' || sub.status === 'trialing');

  const cancelDate = sub?.cancel_at ?? (sub?.cancel_at_period_end ? sub?.current_period_end : null);
  const isCanceling = !!cancelDate && (sub?.cancel_at_period_end || !!sub?.cancel_at);

  const periodEndLabel = formatDate(sub?.current_period_end, locale);
  const cancelLabel = formatDate(cancelDate, locale);

  const statusLabel = !isActive
    ? t('profile.statusInactive')
    : isCanceling
      ? t('profile.statusCancelsOn').replace('{date}', String(cancelLabel))
      : t('profile.statusActive');

  const priceLabel =
    priceMxn != null
      ? `${new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(priceMxn)} ${t('misc.plansPerMonth')}`
      : null;

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error('No portal URL received');
      window.location.assign(url);
    } catch (e: any) {
      toast({ title: t('profile.couldNotComplete'), description: e.message, variant: 'destructive' });
      setPortalLoading(false);
    }
  };

  const run = async (action: Exclude<PendingAction, null>) => {
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-my-subscription', {
        body: { action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const messages: Record<string, string> = {
        cancel: t('profile.cancellationScheduled'),
        reactivate: t('profile.subscriptionReactivated'),
      };
      toast({ title: messages[action] });
      setConfirm(null);
      await load();
      await refreshProfile?.();
    } catch (e: any) {
      toast({ title: t('profile.couldNotComplete'), description: e.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-white/10">
        <h3 className="section-header-gold flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> {t('profile.subscription')}
        </h3>
        <p className="text-ivory/50 text-sm mt-1">{t('profile.yourPlanAndBillingStatus')}</p>
      </div>
      <div className="p-6 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-ivory/50 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('profile.loadingEllipsis')}
          </div>
        ) : !sub || !isActive ? (
          <div className="space-y-3">
            <p className="text-sm text-ivory/60">{t('profile.noActiveSubscription')}</p>
            <Link to="/plans?tab=plans">
              <Button size="sm" className="bg-gold-accent text-[#1a1a1a] hover:bg-gold-accent/90 font-semibold">
                <CreditCard className="h-4 w-4 mr-2" /> {t('profile.viewPlans')}
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-ivory/40 text-xs">{t('profile.plan')}</p>
                <p className="text-ivory/90 font-medium capitalize">
                  {sub.plan_tier || sub.plan_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-ivory/40 text-xs">{t('profile.monthlyPrice')}</p>
                <p className="text-ivory/90 font-medium">{priceLabel || '—'}</p>
              </div>
              <div>
                <p className="text-ivory/40 text-xs">{t('profile.status')}</p>
                <p className="text-ivory/90 font-medium">{statusLabel}</p>
              </div>
              <div>
                <p className="text-ivory/40 text-xs">
                  {isCanceling ? t('profile.periodEnd') : t('profile.nextRenewal')}
                </p>
                <p className="text-ivory/90 font-medium">{periodEndLabel || '—'}</p>
              </div>
            </div>

            {isActive && isCanceling && (
              <p className="text-sm text-ivory/60">
                {t('profile.cancelsOnKeepAccess').replace('{date}', String(cancelLabel))}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/plans?tab=plans">
                <Button size="sm" className="bg-gold-accent text-[#1a1a1a] hover:bg-gold-accent/90 font-semibold">
                  <CreditCard className="h-4 w-4 mr-2" /> {t('profile.changePlan')}
                </Button>
              </Link>
              <Button size="sm" variant="secondary" onClick={() => void openBillingPortal()} disabled={portalLoading}>
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Settings2 className="h-4 w-4 mr-2" />
                )}
                {portalLoading ? t('profile.openingBillingPortal') : t('profile.manageSubscription')}
              </Button>
              {isCanceling ? (
                <Button size="sm" variant="secondary" onClick={() => setConfirm('reactivate')}>
                  <RotateCcw className="h-4 w-4 mr-2" /> {t('profile.reactivate')}
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => setConfirm('cancel')}>
                  <XCircle className="h-4 w-4 mr-2" /> {t('profile.cancelSubscription')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirmation for cancel / reactivate */}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !working && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'cancel' && t('profile.cancelSubscriptionTitle')}
              {confirm === 'reactivate' && t('profile.reactivateSubscriptionTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'cancel' && (
                periodEndLabel
                  ? t('profile.cancelSubscriptionDescWithDate').replace('{date}', String(periodEndLabel))
                  : t('profile.cancelSubscriptionDesc')
              )}
              {confirm === 'reactivate' && t('profile.reactivateSubscriptionDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>{t('profile.goBack')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirm) void run(confirm); }}
              disabled={working}
            >
              {working && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('profile.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
