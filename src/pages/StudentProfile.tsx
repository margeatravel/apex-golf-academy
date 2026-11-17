import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanColors } from '@/hooks/usePlanColors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Save, User, Mail, Phone, Target, Hash, Trophy, Crown, CalendarIcon, Camera, Video, Quote, Sparkles, ChevronRight, Star, UserPlus, TrendingUp, Pencil, ChevronDown, Settings, MessageCircle } from 'lucide-react';
import { InternalHeader } from '@/components/InternalHeader';
import { Link, useNavigate } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ProfileTimeline } from '@/components/profile/ProfileTimeline';
import { SocialFooter } from '@/components/SocialFooter';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ManagePlanButton } from '@/components/ManagePlanButton';
import { InternalBookingModal } from '@/components/InternalBookingModal';
import { LinkCoachCard } from '@/components/LinkCoachCard';
import { GoogleCalendarConnect } from '@/components/GoogleCalendarConnect';
import { InviteFriendModal } from '@/components/InviteFriendModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';


const COACH_QUOTES = [
  "Every swing is a step closer to your best game.",
  "Trust the process. The results will follow.",
  "Your consistency today builds your confidence tomorrow.",
  "Champions are made in practice, not in tournaments.",
];


export default function StudentProfile() {
  const { profile, refreshProfile, effectivePlan, subscription } = useAuth();
  const planColors = usePlanColors();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();
  const es = language === 'es';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    handicap: profile?.handicap?.toString() || '',
    goals: profile?.goals || '',
    ghin_number: (profile as any)?.ghin_number || '',
    thegrint_username: (profile as any)?.thegrint_username || '',
    handicap_goal: (profile as any)?.handicap_goal?.toString() || '',
    handicap_goal_date: (profile as any)?.handicap_goal_date || '',
  });

  // Pick a quote based on the day
  const quoteIndex = new Date().getDate() % COACH_QUOTES.length;
  const dailyQuote = COACH_QUOTES[quoteIndex];

  // Fetch video count
  const { data: videoCount = 0 } = useQuery({
    queryKey: ['student-video-count', profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile?.id);
      return count || 0;
    },
    enabled: !!profile?.id,
  });

  // Fetch handicap history
  const { data: handicapHistory = [] } = useQuery({
    queryKey: ['handicap-history', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('handicap_history')
        .select('*')
        .eq('user_id', profile?.id)
        .order('recorded_at', { ascending: true });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const chartData = handicapHistory.map((h: any) => ({
    date: new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(new Date(h.recorded_at)),
    handicap: Number(h.handicap),
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          handicap: formData.handicap ? parseFloat(formData.handicap) : null,
          goals: formData.goals,
          ghin_number: formData.ghin_number || null,
          thegrint_username: formData.thegrint_username || null,
          handicap_goal: formData.handicap_goal ? parseFloat(formData.handicap_goal) : null,
          handicap_goal_date: formData.handicap_goal_date || null,
        })
        .eq('id', profile?.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: t('profile.profileUpdatedTitle'), description: t('profile.profileUpdatedDesc') });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: t('profile.invalidFormatTitle'), description: t('profile.invalidFormatDesc'), variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('profile.fileTooLargeTitle'), description: t('profile.fileTooLargeDesc'), variant: 'destructive' });
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
      const { error: updateError } = await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', profile.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast({ title: t('profile.photoUpdatedTitle'), description: t('profile.photoUpdatedDesc') });
    } catch (err: any) {
      toast({ title: t('profile.uploadFailedTitle'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card-sm px-3 py-2 text-sm">
          <p className="text-ivory font-medium">{payload[0].value}</p>
          <p className="text-ivory/50 text-xs">{payload[0].payload.date}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.myProfileTitle" subtitleKey="admin.myProfileSub" backTo="/dashboard" />

      <main className="container mx-auto px-4 py-6 pb-32 max-w-2xl space-y-6">
        {/* Header */}
        <div className="glass-card p-5 flex items-center gap-4">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
            className="relative rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-green-accent h-20 w-20 group" aria-label={t('profile.changePhoto')}>
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-ivory text-2xl font-semibold">{getInitials(profile?.full_name)}</span>
            )}
            <span className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-gold-accent text-primary-foreground flex items-center justify-center border-2 border-background">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl font-bold text-ivory truncate">{profile?.full_name || '—'}</h2>
            {(() => {
              const tier = effectivePlan;
              const isPaid = ['family', 'scratch', 'pro', 'apex'].includes(tier);
              const labels: Record<string, string> = { free: t('profile.tierFree'), member: t('profile.tierFree'), family: t('profile.tierFamily'), scratch: t('profile.tierScratch'), pro: t('profile.tierPro'), apex: t('profile.tierApex') };
              const color = (planColors as any)[tier] || planColors.free;
              return (
                <Link to="/plans" className="inline-flex items-center gap-1.5 mt-1.5 rounded-full px-3 py-1 text-xs font-semibold border" style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1a` }}>
                  {isPaid ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {labels[tier] || labels.free}
                  <span className="opacity-70">· {isPaid ? (es ? 'Administrar' : 'Manage') : (es ? 'Mejorar' : 'Upgrade')}</span>
                </Link>
              );
            })()}
            <p className="text-sm text-ivory/60 mt-2 flex items-center gap-1.5">
              <Target className="h-4 w-4 text-gold-accent" />
              HCP {profile?.handicap ?? '—'}
              {(profile as any)?.handicap_goal != null && <> → <span className="text-gold-accent font-semibold">{(profile as any).handicap_goal}</span></>}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: es ? 'Reservar' : 'Book', Icon: CalendarIcon, onClick: () => setBookOpen(true), gold: true },
            { label: es ? 'Videos' : 'Videos', Icon: Video, onClick: () => navigate('/videos'), badge: videoCount },
            { label: es ? 'Avances' : 'Progress', Icon: TrendingUp, onClick: () => navigate('/pro-zone/stats?view=reports') },
            { label: es ? 'Invitar' : 'Invite', Icon: UserPlus, onClick: () => setInviteOpen(true) },
          ].map(({ label, Icon, onClick, gold, badge }) => (
            <button key={label} type="button" onClick={onClick} className="glass-card py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
              <span className={`relative h-10 w-10 rounded-xl flex items-center justify-center ${gold ? 'bg-gold-accent/15 text-gold-accent' : 'bg-green-accent/20 text-green-accent'}`}>
                <Icon className="h-5 w-5" />
                {!!badge && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-gold-accent text-primary-foreground text-[10px] font-bold flex items-center justify-center">{badge}</span>}
              </span>
              <span className="text-xs font-medium text-ivory/85">{label}</span>
            </button>
          ))}
        </div>
        <InternalBookingModal open={bookOpen} onOpenChange={setBookOpen} />
        <InviteFriendModal open={inviteOpen} onOpenChange={setInviteOpen} inviterName={profile?.full_name} />

        {!(profile as any)?.assigned_coach_id && <LinkCoachCard />}

        <GoogleCalendarConnect />

        {/* Goal progress */}
        {((profile as any)?.handicap_goal != null || chartData.length > 1) && (
          <div className="glass-card p-5">
            <h3 className="section-header-gold flex items-center gap-2 mb-3"><Target className="h-4 w-4" /> {es ? 'Mi meta' : 'My goal'}</h3>
            {(profile as any)?.handicap_goal != null && profile?.handicap != null && (() => {
              const start = chartData.length ? chartData[0].handicap : Number(profile.handicap);
              const goal = Number((profile as any).handicap_goal);
              const cur = Number(profile.handicap);
              const pct = start === goal ? 100 : Math.max(0, Math.min(100, ((start - cur) / (start - goal)) * 100));
              return (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-ivory/60 mb-1.5">
                    <span>{es ? 'Inicio' : 'Start'} {start}</span>
                    <span className="text-ivory font-semibold">{es ? 'Hoy' : 'Now'} {cur}</span>
                    <span className="text-gold-accent">{es ? 'Meta' : 'Goal'} {goal}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-green-accent to-gold-accent" style={{ width: `${pct}%` }} />
                  </div>
                  {(profile as any)?.handicap_goal_date && (
                    <p className="text-[11px] text-ivory/45 mt-1.5">{es ? 'Fecha objetivo' : 'Target date'}: {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${(profile as any).handicap_goal_date}T12:00:00`))}</p>
                  )}
                </div>
              );
            })()}
            {chartData.length > 1 && (
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fill: 'rgba(245,240,232,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="handicap" stroke="#4a7c59" strokeWidth={2} dot={{ fill: '#F0C040', r: 3, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Journey feed */}
        <section>
          <h3 className="section-header-gold flex items-center gap-2 mb-3 px-1"><Sparkles className="h-4 w-4" /> {es ? 'Mi recorrido' : 'My journey'}</h3>
          {profile?.id && <ProfileTimeline studentId={profile.id} language={language} locale={locale} />}
        </section>

        {/* Account extras that left the side menu: Settings & Contact coach */}
        <div className="glass-card overflow-hidden divide-y divide-white/[0.06]">
          <button type="button" onClick={() => navigate('/plans')} className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-white/5">
            <span className="h-9 w-9 rounded-lg flex items-center justify-center bg-gold/15 text-gold"><Crown className="h-4 w-4" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ivory">{es ? 'Mi plan y beneficios' : 'Manage my plan'}</span>
              <span className="block text-[11px] text-ivory/50">{es ? 'Ver planes, beneficios y facturación' : 'Plans, benefits & billing'}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-ivory/40" />
          </button>
          <button type="button" onClick={() => navigate('/settings')} className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-white/5">
            <span className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/10 text-ivory/70"><Settings className="h-4 w-4" /></span>
            <span className="flex-1 text-sm font-semibold text-ivory">{es ? 'Ajustes' : 'Settings'}</span>
            <ChevronRight className="h-4 w-4 text-ivory/40" />
          </button>
          <button
            type="button"
            onClick={() => window.open('https://wa.me/19153143415?text=Hola%20coach!%20Tengo%20una%20duda%20sobre%20las%20clases', '_blank', 'noopener,noreferrer')}
            className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-white/5"
          >
            <span className="h-9 w-9 rounded-lg flex items-center justify-center bg-[#5DD4C8]/15 text-[#5DD4C8]"><MessageCircle className="h-4 w-4" /></span>
            <span className="flex-1 text-sm font-semibold text-ivory">{es ? 'Contactar Coach' : 'Contact Coach'}</span>
            <ChevronRight className="h-4 w-4 text-ivory/40" />
          </button>
        </div>

        {/* Edit profile (collapsed) */}
        <Collapsible open={editOpen} onOpenChange={setEditOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="glass-card w-full px-4 py-3 flex items-center gap-3 text-left">
              <span className="h-9 w-9 rounded-lg flex items-center justify-center bg-green-accent/20 text-green-accent"><Pencil className="h-4 w-4" /></span>
              <span className="flex-1 text-sm font-semibold text-ivory">{es ? 'Editar perfil' : 'Edit profile'}</span>
              <ChevronDown className={`h-4 w-4 text-ivory/50 transition-transform ${editOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Personal Information */}
          <div className="glass-card overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-white/10">
              <h3 className="section-header-gold flex items-center gap-2">
                <User className="h-4 w-4" />
                {t('profile.personalInformation')}
              </h3>
              <p className="text-ivory/50 text-sm mt-1">{t('profile.yourBasicContactDetails')}</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <Mail className="h-4 w-4 text-ivory/50" /> {t('profile.email')}
                </Label>
                <Input id="email" type="email" value={profile?.email} disabled className="glass-input opacity-60" />
                <p className="text-xs text-ivory/40">{t('profile.emailCannotBeChanged')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <User className="h-4 w-4 text-ivory/50" /> {t('profile.fullName')}
                </Label>
                <Input id="full_name" type="text" value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe" className="glass-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <Phone className="h-4 w-4 text-ivory/50" /> {t('profile.phoneNumber')}
                </Label>
                <Input id="phone" type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567" className="glass-input" />
              </div>
            </div>
          </div>

          {/* Golf Information */}
          <div className="glass-card overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-white/10">
              <h3 className="section-header-gold flex items-center gap-2">
                <Trophy className="h-4 w-4" /> {t('profile.golfInformation')}
              </h3>
              <p className="text-ivory/50 text-sm mt-1">{t('profile.handicapAndTrackingDetails')}</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="handicap" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <Target className="h-4 w-4 text-ivory/50" /> {t('profile.currentHandicap')}
                </Label>
                <Input id="handicap" type="number" step="0.1" value={formData.handicap}
                  onChange={(e) => setFormData({ ...formData, handicap: e.target.value })}
                  placeholder="18.5" className="glass-input" />
              </div>

              {chartData.length > 1 && (
                <div className="glass-card-sm p-4">
                  <p className="text-sm font-medium text-ivory/70 mb-3">{t('profile.handicapHistory')}</p>
                  <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="date" tick={{ fill: 'rgba(245,240,232,0.4)', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: 'rgba(245,240,232,0.4)', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="handicap" stroke="#4a7c59" strokeWidth={2}
                          dot={{ fill: '#F0C040', r: 4, strokeWidth: 0 }} activeDot={{ fill: '#F0C040', r: 6, strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="handicap_goal" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <Target className="h-4 w-4 text-gold-accent" /> {t('profile.handicapGoal')}
                </Label>
                <Input id="handicap_goal" type="number" step="0.1" value={formData.handicap_goal}
                  onChange={(e) => setFormData({ ...formData, handicap_goal: e.target.value })}
                  placeholder="12.0" className="glass-input" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="handicap_goal_date" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <CalendarIcon className="h-4 w-4 text-gold-accent" /> {t('profile.targetDate')}
                </Label>
                <DateField id="handicap_goal_date" value={formData.handicap_goal_date}
                  onChange={(e) => setFormData({ ...formData, handicap_goal_date: e.target.value })}
                  className="glass-input" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ghin_number" className="flex items-center gap-2 text-sm font-medium text-ivory/80">
                  <Hash className="h-4 w-4 text-ivory/50" /> {t('profile.ghinNumber')}
                </Label>
                <Input id="ghin_number" type="text" value={formData.ghin_number}
                  onChange={(e) => setFormData({ ...formData, ghin_number: e.target.value })}
                  placeholder="1234567" className="glass-input" />
                <p className="text-xs text-ivory/40">{t('profile.ghinHelp')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="thegrint_username" className="text-sm font-medium text-ivory/80">{t('profile.theGrintUsername')}</Label>
                <Input id="thegrint_username" type="text" value={formData.thegrint_username}
                  onChange={(e) => setFormData({ ...formData, thegrint_username: e.target.value })}
                  placeholder="your_username" className="glass-input" />
                <p className="text-xs text-ivory/40">{t('profile.theGrintHelp')}</p>
              </div>
            </div>
          </div>

          {/* Goals */}
          <div className="glass-card overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-white/10">
              <h3 className="section-header-gold flex items-center gap-2">
                <Target className="h-4 w-4" /> {t('profile.goalsAndImprovement')}
              </h3>
              <p className="text-ivory/50 text-sm mt-1">{t('profile.whatYouWantToAchieve')}</p>
            </div>
            <div className="p-6">
              <div className="space-y-2">
                <Label htmlFor="goals" className="text-sm font-medium text-ivory/80">{t('profile.goalsAndAreasToImprove')}</Label>
                <Textarea id="goals" value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  placeholder={t('profile.goalsPlaceholder')}
                  className="glass-input min-h-[140px] resize-none" />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full btn-green h-12 text-base" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? t('profile.saving') : t('profile.saveChanges')}
          </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>

      </main>

      <SocialFooter />

    </div>
  );
}
