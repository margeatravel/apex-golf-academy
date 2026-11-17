import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Change password card. Moved verbatim out of StudentProfile so the Settings
 * screen can reuse it — logic is unchanged.
 */
export function ChangePasswordSection() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pw, setPw] = useState({ current: '', newPw: '', confirm: '' });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPw.length < 8) {
      toast({ title: 'Error', description: t('profile.newPasswordMinLength'), variant: 'destructive' });
      return;
    }
    if (pw.newPw !== pw.confirm) {
      toast({ title: 'Error', description: t('profile.passwordsDoNotMatch'), variant: 'destructive' });
      return;
    }
    setPwLoading(true);
    try {
      // Verify current password by re-signing in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user found');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pw.current,
      });
      if (signInError) {
        toast({ title: 'Error', description: t('profile.currentPasswordIncorrect'), variant: 'destructive' });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: pw.newPw });
      if (error) throw error;
      setPw({ current: '', newPw: '', confirm: '' });
      toast({ title: t('profile.passwordUpdatedTitle'), description: t('profile.passwordUpdatedDesc') });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <form onSubmit={handleChangePassword} className="space-y-0">
      <div className="glass-card overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-white/10">
          <h3 className="section-header-gold flex items-center gap-2">
            <Lock className="h-4 w-4" /> {t('profile.changePassword')}
          </h3>
          <p className="text-ivory/50 text-sm mt-1">{t('profile.updateLoginPassword')}</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="current_password" className="text-sm font-medium text-ivory/80">{t('profile.currentPassword')}</Label>
            <div className="relative">
              <Input id="current_password" type={showCurrent ? 'text' : 'password'} value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                placeholder="••••••••" className="glass-input pr-10" required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
                onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password" className="text-sm font-medium text-ivory/80">{t('profile.newPassword')}</Label>
            <div className="relative">
              <Input id="new_password" type={showNew ? 'text' : 'password'} value={pw.newPw}
                onChange={(e) => setPw({ ...pw, newPw: e.target.value })}
                placeholder={t('profile.minimum8Characters')} className="glass-input pr-10" required minLength={8} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
                onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password" className="text-sm font-medium text-ivory/80">{t('profile.confirmNewPassword')}</Label>
            <div className="relative">
              <Input id="confirm_password" type={showConfirm ? 'text' : 'password'} value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                placeholder={t('profile.repeatNewPassword')} className="glass-input pr-10" required minLength={8} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
                onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full btn-green h-12 text-base mt-4" disabled={pwLoading}>
        <Lock className="mr-2 h-4 w-4" />
        {pwLoading ? t('profile.updating') : t('profile.changePassword')}
      </Button>
    </form>
  );
}
