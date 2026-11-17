import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, isInTrial } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sparkles, X, Clock } from 'lucide-react';

/**
 * Countdown banner for the full-access free trial.
 * Renders only when the user is on Free/Member/Family tier AND trial_ends_at is still in the future.
 * Dismissal is keyed to the current trial end date, so extending/resetting a trial
 * makes the banner show up again even if the student dismissed the previous one.
 */
export function TrialBanner() {
  const { effectivePlan, trialEndsAt } = useAuth();
  const { t } = useLanguage();

  const dismissKey = trialEndsAt ? `apex_trial_banner_dismissed:${trialEndsAt}` : null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // Read the per-trial dismissal flag whenever the trial end date changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !dismissKey) {
      setDismissedKey(null);
      return;
    }
    setDismissedKey(window.sessionStorage.getItem(dismissKey) === '1' ? dismissKey : null);
  }, [dismissKey]);

  // Re-render every minute so the countdown stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Hide on paid plans or expired/missing trial.
  if (effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex') return null;
  if (!isInTrial(trialEndsAt)) return null;
  if (dismissKey && dismissedKey === dismissKey) return null;

  const end = new Date(trialEndsAt!);
  const msLeft = end.getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  // Visual urgency tiers
  const urgency: 'normal' | 'warning' | 'critical' =
    hoursLeft <= 24 ? 'critical' : daysLeft <= 7 ? 'warning' : 'normal';

  const tone =
    urgency === 'critical'
      ? 'border-red-400/40 bg-red-500/10'
      : urgency === 'warning'
      ? 'border-gold-accent/40 bg-gold-accent/10'
      : 'border-green-accent/30 bg-green-accent/5';

  const icon =
    urgency === 'critical'
      ? <Clock className="h-4 w-4 text-red-300 shrink-0" />
      : urgency === 'warning'
      ? <Sparkles className="h-4 w-4 text-gold-accent shrink-0" />
      : <Sparkles className="h-4 w-4 text-green-accent shrink-0" />;

  const fill = (key: string, n: number) =>
    t(key).replace('{n}', String(n)).replace(/\{s\}/g, n === 1 ? '' : 's');

  const headline =
    urgency === 'critical'
      ? fill('misc.trialBannerHours', hoursLeft)
      : fill('misc.trialBannerDays', daysLeft);

  const handleDismiss = () => {
    if (!dismissKey) return;
    setDismissedKey(dismissKey);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(dismissKey, '1');
    }
  };

  return (
    <div
      className={`glass-card border ${tone} rounded-2xl p-3 sm:p-4 flex items-start gap-3 mb-4`}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-ivory text-sm sm:text-base leading-tight">
          {headline}
        </p>
        <p className="text-ivory/70 text-xs sm:text-[13px] mt-1 leading-snug">
          {t('misc.trialBannerBody')}
        </p>
        <Link
          to="/plans"
          className="inline-flex items-center gap-1.5 mt-2 text-xs sm:text-sm font-semibold text-gold-accent hover:text-gold-accent/80"
        >
          {t('misc.trialBannerCta')} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('misc.trialBannerDismiss')}
        className="text-ivory/50 hover:text-ivory shrink-0 p-1 -m-1 rounded-md"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
