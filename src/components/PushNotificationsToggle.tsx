import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Student settings: Web Push (PWA) opt-in for new Pro Zone videos.
 * Additive — independent from the email notification preference.
 */
export function PushNotificationsToggle() {
  const { permission, isSubscribed, isSupported, loading, error, subscribe, unsubscribe } =
    usePushNotifications();
  const { t } = useLanguage();

  const denied = permission === 'denied';
  const disabled = !isSupported || denied || loading;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="push_notifications" className="text-sm font-medium text-ivory/80">
            {t('profile.pushNotificationsTitle')}
          </Label>
          <p className="text-xs text-ivory/40">{t('profile.pushNotificationsHelp')}</p>
          {!isSupported && (
            <p className="text-xs text-ivory/40">{t('profile.pushNotSupported')}</p>
          )}
          {isSupported && denied && (
            <p className="text-xs text-ivory/40">{t('profile.pushDenied')}</p>
          )}
        </div>
        <Switch
          id="push_notifications"
          checked={isSubscribed}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (checked) void subscribe();
            else void unsubscribe();
          }}
        />
      </div>
      {error && !denied && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-ivory/40">{t('profile.pushIphoneHint')}</p>
    </div>
  );
}
