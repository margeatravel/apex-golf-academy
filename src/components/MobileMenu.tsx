import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Users, Calendar, BarChart3, User, LogOut, UserCog, GraduationCap, BookOpen, CircleDot, CreditCard, DollarSign, Upload, LinkIcon, Settings, Sparkles, Star, ShieldCheck, Trophy, Hash, Copy, Check, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { replayTour } from '@/components/GuidedTour';
import { InviteFriendModal } from '@/components/InviteFriendModal';
import { useStudentNavEntries } from '@/hooks/useStudentNavEntries';
import { getTierTheme } from '@/lib/tierTheme';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { demoCoachProfile, demoCoachCode, demoAccessCode } from '@/data/demoData';
import ApexBrand from '@/components/ApexBrand';
import { Inbox } from 'lucide-react';

const STUDENT_SITE_URL = 'https://margeagolfacademy.com';

interface MobileMenuProps {
  isCoach: boolean;
  onSignOut: () => void;
  currentView: 'coach' | 'student';
}

export function MobileMenu({ isCoach, onSignOut, currentView }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, profile: realProfile, effectivePlan, role, hasPermission, setPreviewTier, clearPreview, effectiveIsAdmin } = useAuth();
  const { isDemoMode } = useDemoMode();
  const profile = isDemoMode
    ? { ...(realProfile || {}), full_name: demoCoachProfile.full_name, email: demoCoachProfile.email, photo_url: demoCoachProfile.photo_url }
    : realProfile;
  const { t, language } = useLanguage();
  const isAdmin = effectiveIsAdmin;
  const isCoachRole = role === 'coach' || (role === 'admin' && !effectiveIsAdmin);
  // Non-owner coach view gets extra vertical breathing room on the top-nav
  // rows now that the Share section has been consolidated into one button.
  // Owner view keeps its existing density unchanged.
  const coachNavRowH = !isAdmin && isCoachRole ? 'h-14' : 'h-12';
  const can = (scope: string) => isAdmin || isCoachRole || hasPermission(scope);
  // Pro Zone media management is admin-only (owner), not partner coaches.
  const canProZone = isAdmin || hasPermission('pro_zone');
  const canStudents = can('students');
  const canLessons = can('lessons');
  const canRevenue = can('revenue');
  const canAnalysis = can('analysis_requests');
  const canSettings = can('settings');
  const canStudentFacingProZone = hasPermission('pro_zone');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [coachCode, setCoachCode] = useState<string | null>(isDemoMode ? demoCoachCode : null);
  const [mintingCode, setMintingCode] = useState(false);
  const [codeJustCopied, setCodeJustCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(isDemoMode ? demoAccessCode : null);
  const [mintingAccess, setMintingAccess] = useState(false);
  const [accessJustCopied, setAccessJustCopied] = useState(false);
  // Which kind of share link is currently open in the modal. `null` = closed.
  const [shareModalPurpose, setShareModalPurpose] = useState<'coach_code' | 'access_link' | null>(null);
  // Whether the consolidated "Share" row is expanded to show its 3 targets.
  const [shareExpanded, setShareExpanded] = useState(false);

  // Single canonical student nav list — identical to the desktop sidebar.
  const { entries: studentNavEntries } = useStudentNavEntries();

  // Tier theme: the student drawer matches the desktop sidebar exactly
  // (plan-based background + border). Coach view keeps its solid fallback.
  const { navBg: tierNavBg, border: tierBorder } = getTierTheme(effectivePlan);

  // Pre-fetch the coach's existing reusable invite code so it's visible
  // beside the row instead of needing two clicks.
  useEffect(() => {
    if (isDemoMode) return;
    // Both owners (admin) and partner coaches (coach role) have a personal
    // reusable coach code — prefetch it for either.
    if (!isOpen || !(isAdmin || isCoachRole) || currentView !== 'coach' || coachCode || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('student_invites')
        .select('code')
        .eq('inviter_id', user.id)
        .eq('is_reusable', true)
        .eq('inviter_is_coach', true)
        .is('assigned_coach_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.code) setCoachCode(data.code);
    })();
    return () => { cancelled = true; };
  }, [isOpen, isAdmin, isCoachRole, currentView, coachCode, user, isDemoMode]);

  // Pre-fetch the latest reusable "access link" (no coach assigned) so it
  // shows in the Share section without needing two clicks. Owner uses this
  // to invite students who don't train with them.
  useEffect(() => {
    if (isDemoMode) return;
    if (!isOpen || !isAdmin || currentView !== 'coach' || accessCode || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('student_invites')
        .select('code')
        .eq('inviter_id', user.id)
        .eq('is_reusable', true)
        .is('assigned_coach_id', null)
        .eq('inviter_is_coach', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.code) setAccessCode(data.code);
    })();
    return () => { cancelled = true; };
  }, [isOpen, isAdmin, currentView, accessCode, user, isDemoMode]);

  const ensureCoachCode = async (): Promise<string | null> => {
    if (coachCode) return coachCode;
    setMintingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: { purpose: 'coach_code' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const code = data?.code || data?.invite?.code || null;
      if (code) setCoachCode(code);
      return code;
    } catch (err: any) {
      toast.error(err.message || 'Could not generate coach code');
      return null;
    } finally {
      setMintingCode(false);
    }
  };

  const handleCopyStudentSite = async () => {
    // Build the welcome message (intro + coach code + plain Margea link).
    const who = profile?.full_name?.split(' ')[0] || 'Tu coach';
    const buildMessage = (code: string | null) => {
      const url = STUDENT_SITE_URL;
      return code
        ? `¡Hola! ${who} te invita a unirte a Margea Golf Academy ⛳ — sigue tus clases, videos de swing y tips de pro.\n\n` +
          `1. Crea tu cuenta aquí: ${url}\n` +
          `2. Código de coach: ${code}`
        : `¡Hola! Únete a Margea Golf Academy ⛳\n${url}`;
    };
    const codePromise: Promise<string | null> = isDemoMode
      ? Promise.resolve(demoCoachCode)
      : coachCode ? Promise.resolve(coachCode) : ensureCoachCode();

    // Copy within the same tap (iOS requires the user gesture); ClipboardItem
    // accepts a promise so the code can still be minted in the background.
    let copied = false;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const blob = codePromise.then((c) => new Blob([buildMessage(c)], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
        copied = true;
      }
    } catch { /* fall through */ }
    const message = buildMessage(await codePromise);
    if (!copied) {
      try { await navigator.clipboard.writeText(message); copied = true; } catch { /* ignore */ }
    }
    setIsOpen(false);
    if (copied) toast.success('Mensaje de invitación copiado');
    else toast.error('No se pudo copiar el mensaje');
  };

  const openShareModal = (purpose: 'coach_code' | 'access_link') => {
    setIsOpen(false);
    setShareModalPurpose(purpose);
    // Wait for the side sheet's close animation so the dialog overlay
    // doesn't fight with the sheet's pointer-events lock on mobile.
    setTimeout(() => setInviteOpen(true), 250);
  };

  const ensureAccessCode = async (): Promise<string | null> => {
    if (accessCode) return accessCode;
    setMintingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: { purpose: 'access_link' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const code = data?.code || data?.invite?.code || null;
      if (code) setAccessCode(code);
      return code;
    } catch (err: any) {
      toast.error(err.message || 'Could not generate access code');
      return null;
    } finally {
      setMintingAccess(false);
    }
  };



  const handleReplayTour = async () => {
    if (!user) return;
    setIsOpen(false);
    toast.success(t('dashboard.restartingTour'));
    // Wait for the Sheet close animation to finish so the driver.js overlay
    // isn't blocked by the closing backdrop / pointer-events lock on mobile.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await replayTour(user.id, currentView);
  };

  // Testing helper (coach view): reopen the one-time student onboarding quiz
  // for the current account. Clears the seen/completed stamps but keeps the
  // previous answers until the quiz is answered again.
  const handleReplayOnboarding = async () => {
    if (!user) return;
    if (!window.confirm(t('nav.replayOnboardingConfirm'))) return;
    setIsOpen(false);
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_seen_at: null, onboarding_completed_at: null, onboarding_completed: false } as any)
      .eq('id', user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate('/onboarding');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleSignOut = () => {
    setIsOpen(false);
    onSignOut();
  };

  const previewAs = (
    tier: 'free' | 'member' | 'scratch' | 'pro' | 'apex',
  ) => {
    setPreviewTier(tier);
    setPreviewExpanded(false);
    navigate('/dashboard');
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          /* In coach view we keep the side menu visible on desktop too, so the
             header stays compact and never overflows. */
          className={`relative p-2 text-ivory/80 hover:text-ivory hover:bg-white/10 ${
            currentView === 'coach' ? '' : 'lg:hidden'
          }`}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">{t('nav.openMenu')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={currentView === 'student' ? 'left' : 'right'}
        className={`w-[270px] p-0 backdrop-blur-xl flex flex-col overflow-hidden ${
          currentView === 'student' ? 'border-r border-white/10' : 'border-l border-white/10'
        }`}
        style={{
          // Student view uses the same plan-based theme as the desktop
          // sidebar; coach view keeps the solid dark-green fallback so the
          // menu feels instant — no white flash on slower devices.
          background: currentView === 'student' ? tierNavBg : '#0d1f18',
          ...(currentView === 'student' ? { borderRight: `1px solid ${tierBorder}` } : {}),
        }}
      >
        <SheetHeader
          className="px-5 pb-4 border-b border-white/10"
          style={{
            // Clear the device status bar / notch on mobile so the logo and
            // title are never cut off. Falls back to 24px on devices without
            // safe-area support.
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
          }}
        >
          <SheetTitle className="flex items-center gap-2.5">
            <ApexBrand size="sm" />
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col py-2 overflow-y-auto flex-1 min-h-0">
          {currentView === 'coach' ? (
            <>
              {(isAdmin || isCoachRole) && <Button variant="ghost" onClick={() => handleNavigation('/admin/inbox')} className={`flex items-center justify-start gap-3 ${coachNavRowH} px-5 rounded-none text-foreground`}><Inbox className="h-5 w-5 text-accent" /><span>{language === 'es' ? 'Bandeja de entrada' : 'Inbox'}</span></Button>}
              {canLessons && (
                <button onClick={() => handleNavigation('/admin/fixed-schedule')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                  <Calendar className="h-5 w-5 text-ivory/50" />
                  <span className="font-medium">{t('nav.prioritySpot')}</span>
                </button>
              )}
              {!isAdmin && canStudentFacingProZone && (
                <button onClick={() => handleNavigation('/pro-zone')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                  <Star className="h-5 w-5 text-gold-accent" />
                  <span className="font-medium">{t('nav.proZoneStar')}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => handleNavigation('/admin/coaches')}
                  className="flex items-center gap-3 h-12 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors"
                >
                  <ShieldCheck className="h-5 w-5 text-gold-accent" />
                  <span className="font-medium">{t('nav.coachAccess')}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => handleNavigation('/admin/staff')}
                  className="flex items-center gap-3 h-12 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors"
                >
                  <ShieldCheck className="h-5 w-5 text-ivory/50" />
                  <span className="font-medium">{t('nav.staffAccess')}</span>
                </button>
              )}
              {canSettings && (
                <>
                  <button onClick={() => handleNavigation('/admin/settings')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                    <Settings className="h-5 w-5 text-ivory/50" />
                    <span className="font-medium">{t('nav.settings')}</span>
                  </button>
                  {isCoachRole && !isAdmin && (
                    <button onClick={() => handleNavigation('/admin/integrations/google-calendar')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                      <LinkIcon className="h-5 w-5 text-ivory/50" />
                      <span className="font-medium">Google Calendar &amp; Stripe</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleNavigation('/admin/integrations')} className="flex items-center gap-3 h-12 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors">
                      <LinkIcon className="h-5 w-5 text-ivory/50" />
                      <span className="font-medium">Google Calendar &amp; Stripe</span>
                    </button>
                  )}
                  <button onClick={() => handleNavigation('/admin/plans-billing')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                    <CreditCard className="h-5 w-5 text-ivory/50" />
                    <span className="font-medium">{t('nav.plansAndBilling')}</span>
                  </button>
                  <button onClick={() => handleNavigation('/admin/pricing')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                    <BookOpen className="h-5 w-5 text-ivory/50" />
                    <span className="font-medium">{t('nav.lessonPackagePricing')}</span>
                  </button>
                  <button onClick={() => handleNavigation('/admin/gamification')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                    <Trophy className="h-5 w-5 text-gold-accent" />
                    <span className="font-medium">{t('nav.gamificationScPoints')}</span>
                  </button>
                  {isCoachRole && !isAdmin && (
                    <button onClick={() => handleNavigation('/admin/profile')} className={`flex items-center gap-3 ${coachNavRowH} px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors`}>
                      <User className="h-5 w-5 text-ivory/50" />
                      <span className="font-medium">{t('nav.profile')}</span>
                    </button>
                  )}
                </>
              )}
              {(isAdmin || isCoachRole) && (
                <>
                  <Separator className="my-2 bg-white/10" />
                  {/* Consolidated Share entry — opens a target picker; each target
                      still supports WhatsApp (Web Share API for site link,
                      InviteFriendModal for coach code / access code). */}
                  <div>
                    <button
                      onClick={() => setShareExpanded((v) => !v)}
                      className="flex items-center gap-3 h-12 px-5 text-left text-ivory/85 hover:text-ivory hover:bg-white/10 transition-colors w-full"
                    >
                      <Share2 className="h-5 w-5 text-ivory/60" />
                      <span className="font-medium flex-1">{t('nav.share')}</span>
                      <span className="text-ivory/40 text-sm">{shareExpanded ? '▾' : '▸'}</span>
                    </button>
                    {shareExpanded && (
                      <div className="pl-12 pr-5 pb-2 space-y-1">
                        <button
                          onClick={handleCopyStudentSite}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-sm text-ivory/80 hover:text-ivory hover:bg-white/10"
                        >
                          <LinkIcon className="h-4 w-4 text-ivory/50" />
                          <span>{t('nav.shareStudentSiteLink')}</span>
                        </button>
                        <button
                          onClick={() => { setShareExpanded(false); openShareModal('coach_code'); }}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-sm text-ivory/80 hover:text-ivory hover:bg-white/10"
                        >
                          <Hash className="h-4 w-4 text-green-accent" />
                          <span>{t('nav.shareCoachCode')}</span>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => { setShareExpanded(false); openShareModal('access_link'); }}
                            disabled={mintingAccess}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-sm text-ivory/80 hover:text-ivory hover:bg-white/10 disabled:opacity-60"
                          >
                            {mintingAccess
                              ? <Loader2 className="h-4 w-4 animate-spin text-ivory/50" />
                              : <Hash className="h-4 w-4 text-gold-accent" />}
                            <span>{t('nav.shareAccessCode')}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Student drawer renders the SAME canonical flat list as the
                  desktop sidebar (useStudentNavEntries): Inicio, Mis clases,
                  Videos, Pro Zone, Reporte de avances, Margea AI, Mi perfil. */}
              {studentNavEntries.map((item) => (
                <button
                  key={item.label}
                  onClick={() => { item.onClick(); setIsOpen(false); }}
                  aria-current={item.active ? 'page' : undefined}
                  className="flex items-center gap-3 h-10 px-5 text-left hover:bg-white/10 transition-colors w-full"
                  style={{ color: item.active ? '#FFFFFF' : 'rgba(245,240,232,0.8)' }}
                >
                  <item.Icon className="h-5 w-5" style={{ color: item.color ?? 'rgba(245,240,232,0.5)' }} />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </>
          )}

          <Separator className="my-2 bg-white/10" />

          {isCoach && currentView === 'student' && (
            <button
              onClick={() => {
                clearPreview();
                handleNavigation('/admin');
              }}
              className="flex items-center gap-3 h-10 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors"
            >
              <UserCog className="h-5 w-5 text-ivory/50" />
              <span className="font-medium">{t('nav.backToCoachView')}</span>
            </button>
          )}

          {/* "Student Preview" entry removed from side menu — the same
              function is available in the app dropdown; it was duplicated here. */}

          {currentView === 'coach' && <Separator className="my-2 bg-white/10" />}

          {currentView === 'coach' && (
            <button
              onClick={handleReplayTour}
              className="flex items-center gap-3 h-10 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors"
            >
              <Sparkles className="h-5 w-5 text-gold-accent" />
              <span className="font-medium">{t('nav.replayTour')}</span>
            </button>
          )}

          {currentView === 'coach' && (
            <button
              onClick={handleReplayOnboarding}
              className="flex items-center gap-3 h-10 px-5 text-left text-ivory/80 hover:text-ivory hover:bg-white/10 transition-colors"
            >
              <GraduationCap className="h-5 w-5 text-gold-accent" />
              <span className="font-medium">{t('nav.replayOnboarding')}</span>
            </button>
          )}



          {/* Language toggle — coach view only; students manage language in Settings */}
          {currentView === 'coach' && (
            <div className="flex items-center justify-between h-10 px-5">
              <span className="text-sm font-medium text-ivory/70">{t('language.label')}</span>
              <LanguageToggle variant="inline" />
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 h-10 px-5 text-left text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">{t('nav.signOut')}</span>
          </button>
        </nav>
      </SheetContent>
      {currentView === 'coach' && isAdmin && (
        <InviteFriendModal
          open={inviteOpen}
          onOpenChange={(o) => {
            setInviteOpen(o);
            if (!o) setShareModalPurpose(null);
          }}
          inviterName={profile?.full_name ?? null}
          purpose={shareModalPurpose ?? 'coach_code'}
          prefetchedCode={shareModalPurpose === 'access_link' ? accessCode : coachCode}
        />
      )}
    </Sheet>
  );
}
