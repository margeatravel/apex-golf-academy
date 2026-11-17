import { useState } from 'react';
import { Bell } from 'lucide-react';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { StudentSubscriptionSection } from '@/components/StudentSubscriptionSection';
import { PushNotificationsToggle } from '@/components/PushNotificationsToggle';
import { ChangePasswordSection } from '@/components/ChangePasswordSection';
import { ParentAccessManager } from '@/components/ParentAccessManager';

/**
 * Student Settings screen — subscription, notifications, password and
 * family access. These sections used to live in the Profile page and keep
 * their original components and logic.
 */
export default function StudentSettings() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { blockWrite } = useStudentPreview();
  const [emailVideos, setEmailVideos] = useState<boolean>(
    (profile as any)?.email_video_notifications ?? true,
  );
  const [saving, setSaving] = useState(false);

  const toggleEmailVideos = async (checked: boolean) => {
    if (blockWrite()) return;
    const previous = emailVideos;
    setEmailVideos(checked);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_video_notifications: checked })
        .eq('id', profile?.id);
      if (error) throw error;
      await refreshProfile();
    } catch (err: any) {
      setEmailVideos(previous);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="profile.settingsTitle" subtitleKey="profile.settingsSub" backTo="/profile" />

      <main className="container mx-auto px-4 py-6 pb-32 max-w-2xl space-y-6">
        <StudentSubscriptionSection />

        {/* Notifications */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-white/10">
            <h3 className="section-header-gold flex items-center gap-2">
              <Bell className="h-4 w-4" /> {t('profile.notificationPreferences')}
            </h3>
            <p className="text-ivory/50 text-sm mt-1">{t('profile.controlHowYouReceiveUpdates')}</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="email_notifications" className="text-sm font-medium text-ivory/80">
                  {t('profile.emailNotificationsForVideos')}
                </Label>
                <p className="text-xs text-ivory/40">{t('profile.emailNotificationsHelp')}</p>
              </div>
              <Switch
                id="email_notifications"
                checked={emailVideos}
                disabled={saving}
                onCheckedChange={toggleEmailVideos}
              />
            </div>

            <div className="pt-5 border-t border-white/10">
              <PushNotificationsToggle />
            </div>
          </div>
        </div>

        <ChangePasswordSection />

        {profile?.id && <ParentAccessManager studentId={profile.id} />}
      </main>

      <SocialFooter />
    </div>
  );
}
