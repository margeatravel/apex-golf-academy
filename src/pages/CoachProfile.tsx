import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { demoCoachProfile } from '@/data/demoData';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, User, Mail, Camera, Settings, Shield, LogOut, Lock, Eye, EyeOff, Landmark } from 'lucide-react';

function getInitials(name?: string | null) {
  if (!name) return 'C';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function ChangePasswordSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pw, setPw] = useState({ current: '', newPw: '', confirm: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPw.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (pw.newPw !== pw.confirm) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user');
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
      if (signInErr) {
        toast({ title: 'Error', description: 'Current password is incorrect.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: pw.newPw });
      if (error) throw error;
      setPw({ current: '', newPw: '', confirm: '' });
      toast({ title: 'Password updated', description: 'Your password was changed.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-white/10">
        <h3 className="section-header-gold flex items-center gap-2">
          <Lock className="h-4 w-4" /> Change Password
        </h3>
        <p className="text-ivory/50 text-sm mt-1">Update your login password</p>
      </div>
      <div className="p-6 space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-ivory/80">Current password</Label>
          <div className="relative">
            <Input type={showCurrent ? 'text' : 'password'} value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              placeholder="••••••••" className="glass-input pr-10" required />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
              onClick={() => setShowCurrent(!showCurrent)}>
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-ivory/80">New password</Label>
          <div className="relative">
            <Input type={showNew ? 'text' : 'password'} value={pw.newPw}
              onChange={(e) => setPw({ ...pw, newPw: e.target.value })}
              placeholder="Minimum 8 characters" className="glass-input pr-10" required minLength={8} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
              onClick={() => setShowNew(!showNew)}>
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-ivory/80">Confirm new password</Label>
          <div className="relative">
            <Input type={showConfirm ? 'text' : 'password'} value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              placeholder="Repeat new password" className="glass-input pr-10" required />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
              onClick={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-[#4a7c59] hover:bg-[#3d6649] text-ivory">
          {loading ? 'Updating...' : 'Update password'}
        </Button>
      </div>
    </form>
  );
}

export default function CoachProfile() {
  const { profile: realProfile, refreshProfile, signOut } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { t } = useLanguage();
  const profile: any = isDemoMode
    ? { ...(realProfile || {}), full_name: demoCoachProfile.full_name, email: demoCoachProfile.email, photo_url: null, clabe: null }
    : realProfile;
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [clabe, setClabe] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || '');
    setClabe((profile as any)?.clabe || '');
  }, [profile?.full_name, (profile as any)?.clabe]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) { toast({ title: 'Modo Demo', description: 'Lectura sola.' }); return; }
    if (!profile?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), clabe: clabe.trim() || null } as any)
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: 'Profile updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (isDemoMode) { toast({ title: 'Modo Demo', description: 'Lectura sola.' }); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    if (!file || !profile?.id) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid format', description: 'JPG, PNG, or WebP only.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 5MB.', variant: 'destructive' });
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from('profiles').update({ photo_url: photoUrl } as any).eq('id', profile.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast({ title: 'Photo updated' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const photoUrl = (profile as any)?.photo_url;

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader title={t('i18nExtras.coachProfile')} backTo="/admin" />
      <main className="px-4 py-6 space-y-5 max-w-2xl mx-auto pb-32">
        {/* Identity card */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoUrl ? (
                <img src={photoUrl} alt={profile?.full_name || 'Coach'} className="h-20 w-20 rounded-full object-cover border border-white/15" />
              ) : (
                <div className="h-20 w-20 rounded-full flex items-center justify-center text-ivory text-xl font-semibold border border-white/15"
                  style={{ background: 'rgba(74,124,89,0.3)' }}>
                  {getInitials(profile?.full_name)}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full flex items-center justify-center border border-white/15"
                style={{ background: 'rgba(0,0,0,0.7)' }}
                aria-label="Change photo"
              >
                <Camera className="h-4 w-4 text-ivory" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-ivory text-xl font-semibold truncate">{profile?.full_name || 'Coach'}</h1>
              <p className="text-ivory/60 text-sm truncate">{profile?.email}</p>
              <Badge className="mt-2 bg-[#4a7c59]/20 text-[#7FB88E] border-none text-[11px]">
                <Shield className="h-3 w-3 mr-1" /> Coach
              </Badge>
            </div>
          </div>
        </div>

        {/* Edit identity */}
        <form onSubmit={handleSave} className="glass-card overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-white/10">
            <h3 className="section-header-gold flex items-center gap-2">
              <User className="h-4 w-4" /> {t('i18nExtras.personalInfo')}
            </h3>
            <p className="text-ivory/50 text-sm mt-1">{t('i18nExtras.visibleToYourStudents')}</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-ivory/80 flex items-center gap-2"><User className="h-4 w-4" /> {t('i18nExtras.fullName')}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="glass-input" placeholder="Coach name" disabled={isDemoMode} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-ivory/80 flex items-center gap-2"><Mail className="h-4 w-4" /> Email</Label>
              <Input type="email" value={profile?.email || ''} disabled className="glass-input opacity-60" />
              <p className="text-xs text-ivory/40">Contact support to change your sign-in email.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-ivory/80 flex items-center gap-2"><Landmark className="h-4 w-4" /> CLABE Interbancaria</Label>
              <Input
                value={clabe}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 18);
                  setClabe(v);
                }}
                className="glass-input font-mono tracking-wider"
                placeholder="18-digit CLABE"
                maxLength={18}
                inputMode="numeric"
                disabled={isDemoMode}
              />
              <p className="text-xs text-ivory/40">Students will see this when they choose bank transfer as payment method.</p>
            </div>
            <Button type="submit" disabled={saving || isDemoMode} className="w-full bg-[#4a7c59] hover:bg-[#3d6649] text-ivory">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>

        {/* Password */}
        <ChangePasswordSection />

        {/* Quick links */}
        <div className="glass-card p-2">
          <button
            onClick={() => navigate('/admin/settings')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition text-left"
          >
            <Settings className="h-4 w-4 text-ivory/70" />
            <span className="text-ivory text-sm flex-1">Coach settings</span>
            <span className="text-ivory/40 text-xs">Plans, pricing, lesson types</span>
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/auth'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 transition text-left"
          >
            <LogOut className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm">Sign out</span>
          </button>
        </div>
      </main>
      <SocialFooter />
    </div>
  );
}