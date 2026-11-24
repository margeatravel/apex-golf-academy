import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase, REMEMBER_ME_KEY } from '@/integrations/supabase/client';
import { resolveLandingRoute } from '@/lib/staffLanding';
import { lovable } from '@/integrations/lovable';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Instagram, ShoppingBag, Eye, EyeOff, ShieldCheck, Sparkles, Lock, CheckCircle2, XCircle } from 'lucide-react';
import googleLogo from '@/assets/brands/google.svg';
import { AuthHero } from '@/components/marketing/AuthHero';
import { MarketingShowcase } from '@/components/marketing/MarketingShowcase';
import { z } from 'zod';
import ApexBrand, { ApexMark } from '@/components/ApexBrand';

const authSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').optional(),
});

// lookup-invite is a public pre-signup edge function, but the Supabase
// gateway enforces JWT verification on it, so a raw fetch without an
// Authorization header gets 401 and every code looks invalid. The
// publishable key is public and satisfies the gateway check.
const inviteLookupHeaders = (): HeadersInit => {
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  return anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {};
};

export default function Auth() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const inviteEmail = (searchParams.get('invite') || '').trim().toLowerCase();
  const isStaffInvite = !!inviteEmail;
  const initialStaffMode = isStaffInvite || searchParams.get('staff') === '1';

  // Student referral invite — accept ?ref=, ?code=, or ?invite= (when not a staff email-based invite).
  const refCodeFromUrl = (
    searchParams.get('ref') ||
    searchParams.get('code') ||
    (isStaffInvite ? '' : searchParams.get('invite') || '')
  ).trim().toUpperCase();
  const [referralInfo, setReferralInfo] = useState<{ inviter_name: string; inviter_is_coach: boolean } | null>(null);
  // Invite-only gating state for student signups
  const [codeValidated, setCodeValidated] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [gateInput, setGateInput] = useState(refCodeFromUrl);

  const [isLogin, setIsLogin] = useState(!isStaffInvite);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState(refCodeFromUrl);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Staff/coach mode: dedicated sign-in flow, no signup, no student welcome email.
  const [staffMode, setStaffMode] = useState(initialStaffMode);
  // When signing in via the staff/coach flow, the user tells us which "mode"
  // they expect to use. We still validate against their real role in the DB
  // after sign-in — this selector is UX/clarity only, not a permission bypass.
  const [staffKind, setStaffKind] = useState<'coach' | 'staff'>('staff');
  const { user, role, permissions, isStaff, loading: authLoading , canSwitchViews, isAlsoStudent } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Persist referral code across signup → email confirm / OAuth callback
  useEffect(() => {
    if (refCodeFromUrl) {
      sessionStorage.setItem('pending_invite_code', refCodeFromUrl);
      setInviteCode(refCodeFromUrl);
      setIsLogin(false); // referral implies signup intent
      // Look up inviter info to render banner
      (async () => {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const url = `https://${projectId}.supabase.co/functions/v1/lookup-invite?code=${encodeURIComponent(refCodeFromUrl)}`;
          const r = await fetch(url, { headers: inviteLookupHeaders() });
          const data = await r.json();
          if (data?.valid) {
            setReferralInfo({
              inviter_name: data.inviter_name,
              inviter_is_coach: !!data.inviter_is_coach,
            });
            setCodeValidated(true);
            setCodeError(null);
          } else {
            setCodeValidated(false);
            setCodeError(
              data?.reason === 'expired'
                ? 'This invite code has expired.'
                : data?.reason === 'accepted'
                  ? 'This invite code has already been used.'
                  : data?.reason === 'cancelled'
                    ? 'This invite code has been revoked.'
                    : 'This invite code is not valid.'
            );
          }
        } catch (e) {
          console.warn('lookup-invite failed', e);
        }
      })();
    }
  }, [refCodeFromUrl]);

  async function validateGateCode(raw: string): Promise<boolean> {
    const code = raw.trim().toUpperCase();
    if (!code || code.length < 4) {
      setCodeError('Enter a valid invite code.');
      return false;
    }
    setValidatingCode(true);
    setCodeError(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/lookup-invite?code=${encodeURIComponent(code)}`;
      const r = await fetch(url, { headers: inviteLookupHeaders() });
      const data = await r.json();
      if (data?.valid) {
        setReferralInfo({
          inviter_name: data.inviter_name,
          inviter_is_coach: !!data.inviter_is_coach,
        });
        setInviteCode(code);
        sessionStorage.setItem('pending_invite_code', code);
        setCodeValidated(true);
        return true;
      }
      setCodeError(
        data?.reason === 'expired'
          ? 'This invite code has expired.'
          : data?.reason === 'accepted'
            ? 'This invite code has already been used.'
            : data?.reason === 'cancelled'
              ? 'This invite code has been revoked.'
              : 'This invite code is not valid.'
      );
      setCodeValidated(false);
      return false;
    } catch {
      setCodeError('Could not verify code. Please try again.');
      setCodeValidated(false);
      return false;
    } finally {
      setValidatingCode(false);
    }
  }

  // In staff mode, force the form into sign-in only.
  // When entering staff mode default to sign-in; leaving staff mode also resets.
  useEffect(() => {
    setIsLogin(true);
  }, [staffMode]);

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    // For new student signups, Google must also pass the invite gate.
    // We allow it freely on the Sign-In view (existing users keep working).
    if (!isLogin && !staffMode && !isStaffInvite && !codeValidated) {
      toast({
        title: 'Invite code required',
        description: 'Validate your invite code first to sign up with Google.',
        variant: 'destructive',
      });
      return;
    }
    setOauthLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) throw result.error;
      // If redirected, the browser is navigating away — nothing more to do.
      if (result.redirected) return;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to sign in with ${provider}`,
        variant: 'destructive',
      });
      setOauthLoading(null);
    }
  };

  useEffect(() => {
    // Wait until auth context has finished loading AND the role has been
    // resolved to a non-null value before redirecting. Otherwise admins/staff
    // would briefly be sent to /dashboard while role is still null.
    if (user && !authLoading && role) {
      // If the user came in through the staff/coach selector, enforce that
      // their DB role actually matches the mode they picked.
      const selectedKind = sessionStorage.getItem('staff_selected_kind') as
        | 'coach'
        | 'staff'
        | null;
      if (selectedKind) {
        sessionStorage.removeItem('staff_selected_kind');
        const isCoachRole = role === 'coach' || role === 'admin';
        const isStaffRole = role === 'staff';
        if (selectedKind === 'coach' && !isCoachRole) {
          toast({
            title: 'No autorizado como Coach',
            description:
              'Esta cuenta no tiene rol de coach. Selecciona “Soy Staff” e inicia sesión de nuevo.',
            variant: 'destructive',
          });
          supabase.auth.signOut();
          return;
        }
        if (selectedKind === 'staff' && !isStaffRole) {
          toast({
            title: 'No autorizado como Staff',
            description:
              isCoachRole
                ? 'Esta cuenta es de coach. Selecciona “Soy Coach” e inicia sesión de nuevo.'
                : 'Esta cuenta no tiene permisos de staff.',
            variant: 'destructive',
          });
          supabase.auth.signOut();
          return;
        }
      }
      if (role === 'admin' || role === 'coach') {
        navigate('/admin');
      } else if (isStaff) {
        // Dual-role (staff + student): honor the persisted view preference,
        // defaulting to the student portal. Preference alone never grants access.
        if (canSwitchViews) {
          navigate(resolveLandingRoute({ userId: user.id, permissions, isAlsoStudent }));
          return;
        }
        // Route staff to their first assigned scope's section.
        if (permissions.includes('pro_zone')) navigate('/admin/pro-zone');
        else if (permissions.includes('students')) navigate('/admin/students');
        else if (permissions.includes('lessons')) navigate('/admin/lessons');
        else if (permissions.includes('revenue')) navigate('/admin/revenue');
        else if (permissions.includes('subscribers')) navigate('/admin/subscribers');
        else if (permissions.includes('stripe_payments')) navigate('/admin/stripe-payments');
        else if (permissions.includes('analysis_requests')) navigate('/admin/analysis-requests');
        else if (permissions.includes('settings')) navigate('/admin/settings');
        else navigate('/dashboard');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, authLoading, role, isStaff, permissions, canSwitchViews, isAlsoStudent, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = isLogin ? { email, password } : { email, password, fullName };
      authSchema.parse(formData);

      // "Recordarme": fix where the session will live BEFORE signing in.
      // Checked (default) -> localStorage, session survives closing the tab.
      // Unchecked -> sessionStorage, session ends when the tab closes.
      // The storage adapter in the supabase client reads this flag on every
      // get/set/remove; it only affects the next sign-in.
      try {
        localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? '1' : '0');
      } catch {
        // Storage unavailable: fall back to the default (remember).
      }

      if (isLogin) {
        // Remember which mode was selected on the staff/coach sign-in flow so
        // the redirect effect above can validate it against the real role.
        if (staffMode) {
          sessionStorage.setItem('staff_selected_kind', staffKind);
        } else {
          sessionStorage.removeItem('staff_selected_kind');
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // If a coach/invite code is pending (e.g. user signed up, confirmed
        // email, and is now signing in for the first time), apply it now
        // that we have a real session.
        const pendingCode = sessionStorage.getItem('pending_invite_code');
        const typedCode = inviteCode.trim().toUpperCase();
        const codeToApply = pendingCode || typedCode;
        if (codeToApply) {
          try {
            const { error: acceptErr } = await supabase.functions.invoke('accept-invite', {
              body: { code: codeToApply },
            });
            if (!acceptErr) sessionStorage.removeItem('pending_invite_code');
            else console.warn('accept-invite on sign-in failed:', acceptErr);
          } catch (acceptErr) {
            console.warn('accept-invite on sign-in threw:', acceptErr);
          }
        }

        toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
      } else {
        // Hard guard: enforce validated invite code for student signup
        if (!isStaffInvite && !staffMode && !codeValidated) {
          toast({
            title: 'Invite code required',
            description: 'Please validate your invite code before creating an account.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        // Coach self-signup: route through a dedicated edge function that
        // assigns the 'coach' role with service-role privileges. This avoids
        // the default 'student' role assignment from handle_new_user (which
        // is what broke panchoprosalazar@gmail.com's account).
        if (staffMode && staffKind === 'coach') {
          const { data: coachData, error: coachErr } = await supabase.functions.invoke('coach-signup', {
            body: { email, password, full_name: fullName },
          });
          if (coachErr || (coachData && (coachData as any).error)) {
            const msg = (coachErr as any)?.message || (coachData as any)?.error || 'Failed to create coach account';
            throw new Error(msg);
          }
          // Sign the coach in immediately (email is pre-confirmed by the edge function).
          sessionStorage.setItem('staff_selected_kind', 'coach');
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw signInErr;
          toast({ title: 'Coach account created', description: 'Signed in as coach.' });
          setLoading(false);
          return;
        }

        // If user typed a code in the form, persist it for accept-invite.
        const typed = inviteCode.trim().toUpperCase();
        if (typed) sessionStorage.setItem('pending_invite_code', typed);

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;

        // Supabase returns a success-shaped response with an empty `identities`
        // array when the email already has an auth user. The password is NOT
        // updated in that case, so a follow-up sign-in with the just-typed
        // password will fail with "Invalid login credentials". Detect it and
        // surface a clear, actionable message instead of the misleading
        // "Account created — you can now sign in".
        const alreadyRegistered =
          !!signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0;
        if (alreadyRegistered) {
          toast({
            title: 'This email already has an account',
            description: isStaffInvite || staffMode
              ? 'Sign in with the existing password, or ask the admin to reset your PIN from Admin → Staff access.'
              : 'Try signing in instead, or use “Forgot password” to reset it.',
            variant: 'destructive',
          });
          if (isStaffInvite || staffMode) setIsLogin(true);
          setLoading(false);
          return;
        }

        // Consume pending student-referral invite (if any) right after signup.
        // IMPORTANT: when email confirmation is enabled, signUp returns no
        // session, so accept-invite would fail with 401 here. In that case we
        // MUST keep the code in sessionStorage so AuthCallback can apply it
        // after the user confirms their email and signs in.
        const pendingCode = sessionStorage.getItem('pending_invite_code');
        if (signUpData.user && signUpData.session && pendingCode) {
          try {
            const { error: acceptErr } = await supabase.functions.invoke('accept-invite', {
              body: { code: pendingCode },
            });
            if (acceptErr) {
              console.warn('accept-invite failed (will retry on next sign-in):', acceptErr);
            } else {
              sessionStorage.removeItem('pending_invite_code');
            }
          } catch (acceptErr) {
            console.warn('accept-invite threw (will retry on next sign-in):', acceptErr);
          }
        }

        // Skip the student welcome email when the user is signing up
        // through a staff invite link or via the staff signup flow.
        if (signUpData.user && !isStaffInvite && !staffMode) {
          try {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: email,
                studentName: fullName || email.split('@')[0],
                notificationType: 'welcome',
              },
            });
          } catch (emailError) {
            console.warn('Failed to send welcome email:', emailError);
          }

          // Notify admin of new student registration (non-blocking).
          try {
            await supabase.functions.invoke('notify-admin', {
              body: {
                eventType: 'user_registered',
                studentName: fullName || email.split('@')[0],
                studentEmail: email,
              },
            });
          } catch (adminNotifyError) {
            console.warn('Failed to notify admin of registration:', adminNotifyError);
          }
        }

        toast({
          title: 'Account created!',
          description: isStaffInvite || staffMode
            ? 'Staff account created. You can now sign in.'
            : 'Welcome to Margea Golf Academy. Check your email for a welcome message!',
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message || 'An error occurred', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex auth-bg">
      {/* Left Side — Branding (hidden on mobile) */}
      <aside className="hidden lg:block lg:w-[45%] relative h-screen sticky top-0 overflow-hidden">
        {/* Background layers (non-interactive) */}
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
        <div className="absolute inset-0 login-pattern pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-green-accent/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] rounded-full bg-gold-accent/5 blur-3xl pointer-events-none" />

        {/* Scrollable column content */}
        <div className="relative z-10 h-full overflow-y-auto auth-scroll">
          {/* Sticky brand bar */}
          <div className="sticky top-0 z-20 backdrop-blur-md bg-black/30 border-b border-white/5 px-10 py-4 flex items-center gap-3">
            <ApexBrand size="md" glow taglineHiddenOnMobile />
          </div>

          <div className="px-10 pt-6 pb-12">
            <AuthHero hideCta hideLogo />
            <MarketingShowcase />

            {/* Social footer */}
            <div className="mt-12 pt-8 border-t border-white/10 space-y-3">
              <p className="text-sm text-ivory/40">Follow us & shop golf products</p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="https://www.instagram.com/scgolfacademy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-ivory/60 hover:text-gold-accent transition-colors"
                >
                  <Instagram className="h-5 w-5" />
                  <span>@scgolfacademy</span>
                </a>
                <a
                  href="https://www.instagram.com/cancungolfproducts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-ivory/60 hover:text-gold-accent transition-colors"
                >
                  <ShoppingBag className="h-5 w-5" />
                <span>@cancungolfproducts</span>
                </a>
              </div>
              <Link to="/privacidad" className="inline-block text-xs text-ivory/40 hover:text-gold-accent transition-colors">
                Privacidad
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Side — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md lg:max-w-md space-y-8">
          {/* Mobile/tablet — headline only above the login form, so the
              sign-in card is visible without scrolling. The marketing
              description + showcase live BELOW the login card.
              Hidden on lg+ where the left column handles all of this. */}
          <div className="lg:hidden -mx-6 md:-mx-12 px-6 md:px-12 max-w-2xl mx-auto">
            <AuthHero headlineOnly />
          </div>

          {/* Login card */}
          <div id="login" className="glass-card overflow-hidden scroll-mt-8">
            {/* Coaching-moment accent banner — flush to the top of the card */}
            <div
              className="relative aspect-[16/9] w-full"
              style={{
                backgroundImage: "url('/images/auth-card-accent.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center center',
              }}
              aria-hidden="true"
            >
              {/* Soft fade into the card body so it blends instead of sitting as a hard slab */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(8,16,28,0.10) 0%, rgba(8,16,28,0.20) 70%, rgba(14,22,32,0.55) 100%)',
                }}
              />
            </div>

            <div className="p-8">
            {referralInfo && !isStaffInvite && !staffMode && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-green-accent/10 border border-green-accent/40">
                <Sparkles className="h-5 w-5 text-green-accent mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="text-green-accent font-semibold mb-0.5">
                    {referralInfo.inviter_is_coach
                      ? `Coach ${referralInfo.inviter_name} invited you`
                      : `${referralInfo.inviter_name} invited you`}
                  </div>
                  <div className="text-ivory/70 text-xs leading-relaxed">
                    Sign up to claim your spot at Margea Golf Academy
                    {referralInfo.inviter_is_coach ? ' and get linked to your Coach automatically.' : '.'}
                  </div>
                </div>
              </div>
            )}
            {isStaffInvite && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-gold-accent/10 border border-gold-accent/40">
                <ShieldCheck className="h-5 w-5 text-gold-accent mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="text-gold-accent font-semibold mb-0.5">Staff invitation</div>
                  <div className="text-ivory/70 text-xs leading-relaxed">
                    {isLogin
                      ? `Sign in with ${inviteEmail} to access your staff account.`
                      : `Create your account using ${inviteEmail} — you'll get staff access automatically.`}
                  </div>
                </div>
              </div>
            )}

            {staffMode && !isStaffInvite && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-gold-accent/10 border border-gold-accent/40">
                <ShieldCheck className="h-5 w-5 text-gold-accent mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="text-gold-accent font-semibold mb-0.5">
                    {isLogin
                      ? (staffKind === 'coach' ? 'Coach sign in' : 'Staff sign in')
                      : (staffKind === 'coach' ? 'Create coach account' : 'Create staff account')}
                  </div>
                  <div className="text-ivory/70 text-xs leading-relaxed">
                    {isLogin
                      ? (staffKind === 'coach'
                          ? 'Use the email your Coach account was set up with. If an admin pre-authorized you, signing up will automatically grant coach access.'
                          : 'Use the email your account was set up with. If an admin pre-authorized you, signing up will automatically grant staff access.')
                      : (staffKind === 'coach'
                          ? 'Use the exact email an admin authorized for you. Your coach role will be applied automatically on signup.'
                          : 'Use the exact email an admin authorized for you. Your staff role and permissions will be applied automatically on signup.')}
                  </div>
                </div>
              </div>
            )}


            <div className="space-y-2 text-center mb-8">
              <h2 className="text-3xl font-heading font-bold text-ivory">
                {staffMode
                  ? (staffKind === 'coach'
                      ? (isLogin ? t('auth.coachSignIn') : t('auth.coachCreateAccount'))
                      : (isLogin ? t('auth.staffSignIn') : t('auth.staffCreateAccount')))
                  : isLogin
                    ? t('auth.welcomeBack')
                    : isStaffInvite
                      ? t('auth.activateStaffAccess')
                      : t('auth.getStarted')}
              </h2>
              <p className="text-ivory/60">
                {staffMode
                  ? (staffKind === 'coach'
                      ? (isLogin ? t('auth.coachSignInSub') : t('auth.coachCreateAccountSub'))
                      : (isLogin ? t('auth.staffSignInSub') : t('auth.staffCreateAccountSub')))
                  : isLogin
                    ? t('auth.welcomeBackSub')
                    : isStaffInvite
                      ? t('auth.activateStaffAccessSub')
                      : t('auth.getStartedSub')}
              </p>
              <div className="flex justify-center pt-2">
                <LanguageToggle variant="inline" />
              </div>
            </div>

            {!isLogin && !isStaffInvite && !staffMode && !codeValidated ? (
              <div className="relative overflow-hidden rounded-2xl border border-gold-accent/30 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(240,192,64,0.25)] p-7 sm:p-9 space-y-6">
                {/* Subtle gold corner glow */}
                <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gold-accent/15 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-gold-accent/10 blur-3xl" />

                <div className="relative flex flex-col items-center text-center space-y-4">
                  <ApexMark size="lg" glow />
                  <div className="h-px w-10 bg-gold-accent/50" />
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] text-gold-accent/90">
                      <Lock className="h-3 w-3" />
                      Members only
                    </div>
                    <h2 className="font-serif text-2xl sm:text-3xl text-ivory tracking-wide">
                      By Invitation Only
                    </h2>
                    <p className="text-sm text-ivory/60 leading-relaxed max-w-xs mx-auto">
                      Margea Golf Academy is a private community. Enter your invitation code to continue.
                    </p>
                  </div>
                </div>

                <div className="relative space-y-3">
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gold-accent/70 pointer-events-none" />
                    <Input
                      id="gateCode"
                      type="text"
                      placeholder="INVITATION CODE"
                      aria-label="Invitation code"
                      value={gateInput}
                      onChange={(e) => {
                        setGateInput(e.target.value.toUpperCase());
                        if (codeError) setCodeError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          validateGateCode(gateInput);
                        }
                      }}
                      maxLength={32}
                      autoFocus
                      className="glass-input h-14 pl-11 pr-4 font-mono tracking-[0.3em] text-center text-base placeholder:text-ivory/25 placeholder:tracking-[0.25em] focus-visible:ring-2 focus-visible:ring-gold-accent/60 focus-visible:border-gold-accent/60"
                    />
                  </div>
                  {validatingCode && (
                    <div className="flex items-center justify-center gap-2 text-xs text-ivory/60">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying invitation…
                    </div>
                  )}
                  {!validatingCode && referralInfo && codeValidated && (
                    <div className="flex items-center justify-center gap-2 text-xs text-green-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Invited by {referralInfo.inviter_name}
                    </div>
                  )}
                  {!validatingCode && codeError && (
                    <div className="flex items-center justify-center gap-2 text-xs text-red-400">
                      <XCircle className="h-3.5 w-3.5" /> {codeError}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={() => validateGateCode(gateInput)}
                  disabled={validatingCode || gateInput.trim().length < 4}
                  className="relative w-full h-12 btn-green text-base font-semibold shadow-lg"
                >
                  {validatingCode ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying…</>
                  ) : (
                    'Continue with invitation'
                  )}
                </Button>

                <div className="relative flex flex-col items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className="text-sm text-ivory/60 hover:text-gold-accent transition-colors"
                  >
                    Already a member? <span className="underline underline-offset-4">Sign in</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffMode(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-ivory/40 hover:text-gold-accent transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    I'm staff or a coach
                  </button>
                </div>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-5">
              {staffMode && !isStaffInvite && (
                <div className="mb-6">
                  <div className="text-xs uppercase tracking-widest text-ivory/50 mb-2">
                    Inicio de sesión como
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Tipo de cuenta"
                    className="grid grid-cols-2 gap-2"
                  >
                    {(['coach', 'staff'] as const).map((kind) => {
                      const active = staffKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setStaffKind(kind)}
                          className={`h-12 rounded-xl border text-sm font-semibold transition-all ${
                            active
                              ? 'border-gold-accent bg-gold-accent/15 text-gold-accent shadow-[0_0_0_1px_rgba(240,192,64,0.35)]'
                              : 'border-white/10 bg-white/[0.03] text-ivory/70 hover:border-white/25 hover:text-ivory'
                          }`}
                        >
                          {kind === 'coach' ? 'Soy Coach' : 'Soy Staff'}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-ivory/40 mt-2 leading-relaxed">
                    Validaremos tu selección contra tu rol real. Si eliges un modo
                    que no tienes autorizado, te lo indicaremos claramente.
                  </p>
                </div>
              )}

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-ivory/80 font-medium">{t('auth.fullName')}</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={!isLogin}
                    className="glass-input h-12"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-ivory/80 font-medium">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  readOnly={isStaffInvite}
                  className={`glass-input h-12 ${isStaffInvite ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>

              {!isLogin && !isStaffInvite && !staffMode && codeValidated && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-green-accent/10 border border-green-accent/40">
                  <CheckCircle2 className="h-5 w-5 text-green-accent mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <div className="text-green-accent font-semibold">
                      Invite code verified · {inviteCode}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCodeValidated(false);
                        setReferralInfo(null);
                        setGateInput('');
                        setInviteCode('');
                        sessionStorage.removeItem('pending_invite_code');
                      }}
                      className="text-[11px] text-ivory/50 hover:text-ivory underline mt-0.5"
                    >
                      Use a different code
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-ivory/80 font-medium">{t('auth.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="glass-input h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/50 hover:text-ivory transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {isLogin && (
                <div className="flex items-center justify-between -mt-2">
                  <label htmlFor="rememberMe" className="flex items-center gap-2 text-xs text-ivory/70 cursor-pointer select-none">
                    <Checkbox
                      id="rememberMe"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                      className="border-white/30 data-[state=checked]:bg-gold-accent data-[state=checked]:border-gold-accent data-[state=checked]:text-black"
                    />
                    {t('auth.rememberMe')}
                  </label>
                  <Link to="/auth/forgot" className="text-xs text-ivory/50 hover:text-gold-accent transition-colors">
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 btn-green text-base font-semibold shadow-lg"
                disabled={loading || oauthLoading !== null}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('common.pleaseWait')}</>
                ) : staffMode
                    ? (staffKind === 'coach'
                        ? (isLogin ? t('auth.signInAsCoach') : t('auth.createCoachAccount'))
                        : (isLogin ? t('auth.signInAsStaff') : t('auth.createStaffAccount')))
                    : isLogin ? t('auth.signIn') : t('auth.createAccount')}
              </Button>

              {staffMode ? (
                <div className="space-y-3 pt-2">
                  <div className="text-center p-3 -mx-1 bg-white/5 border border-white/10 rounded-xl">
                    {isLogin ? (
                      <>
                        <p className="text-xs text-ivory/50 mb-1">
                          {staffKind === 'coach'
                            ? t('auth.firstTimeCoach')
                            : t('auth.firstTimeStaff')}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsLogin(false)}
                          className="text-sm font-semibold text-gold-accent hover:text-gold-accent/80 transition-colors underline underline-offset-4"
                        >
                          {staffKind === 'coach'
                            ? t('auth.createCoachArrow')
                            : t('auth.createStaffArrow')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsLogin(true)}
                        className="text-sm text-ivory/60 hover:text-gold-accent transition-colors"
                      >
                        {staffKind === 'coach'
                          ? t('auth.alreadyHaveCoach')
                          : t('auth.alreadyHaveStaff')}
                      </button>
                    )}
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setStaffMode(false)}
                      className="text-xs text-ivory/40 hover:text-ivory/70 transition-colors"
                    >
                      ← Back to student sign in
                    </button>
                  </div>
                </div>
              ) : isLogin ? (
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className="group relative w-full mt-4 -mx-1 overflow-hidden rounded-xl border border-gold-accent/40 bg-gradient-to-b from-gold-accent/[0.08] to-gold-accent/[0.02] hover:from-gold-accent/[0.14] hover:to-gold-accent/[0.04] hover:border-gold-accent/60 transition-all p-4 text-left flex items-center gap-3 shadow-[0_8px_30px_-12px_rgba(240,192,64,0.3)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-accent/15 border border-gold-accent/30">
                    <Lock className="h-4 w-4 text-gold-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-gold-accent/90 mb-0.5">Members only</div>
                    <div className="text-sm font-semibold text-ivory">Request access with an invitation</div>
                    <div className="text-xs text-ivory/50 mt-0.5">Margea Golf Academy is invite-only.</div>
                  </div>
                  <span className="text-gold-accent text-lg transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              ) : (
                <div className="text-center pt-2">
                  <button type="button" onClick={() => setIsLogin(true)} className="text-sm text-ivory/50 hover:text-gold-accent transition-colors">
                    {t('auth.haveAccount')} {t('auth.signIn')}
                  </button>
                </div>
              )}
            </form>

            {!staffMode && (
              <>
                {/* Divider */}
                <div className="my-6 flex items-center gap-3" role="separator" aria-label="Or continue with">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase tracking-wider text-ivory/40 whitespace-nowrap">
                    Or continue with
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                {/* OAuth Buttons */}
                <div className="space-y-3">
                  <Button
                    type="button"
                    className="w-full h-12 btn-glass font-medium flex items-center justify-center gap-2"
                    onClick={() => handleOAuthLogin('google')}
                    disabled={oauthLoading !== null || loading}
                  >
                    {oauthLoading === 'google' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <img src={googleLogo} alt="Google" className="w-5 h-5" />
                    )}
                    {t('auth.signInWithGoogle')}
                  </Button>
                </div>

                {/* Staff / Coach entry point */}
                <div className="mt-6 pt-6 border-t border-white/10 text-center">
                  <p className="text-xs text-ivory/40 mb-2">Are you a coach or staff member?</p>
                  <button
                    type="button"
                    onClick={() => setStaffMode(true)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-gold-accent hover:text-gold-accent/80 transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    I'm a staff or coach
                  </button>
                </div>
              </>
            )}
            </>
            )}
            </div>
          </div>

          {/* Mobile/tablet — marketing description + showcase below the login card */}
          <div className="lg:hidden -mx-6 md:-mx-12 px-6 md:px-12 max-w-2xl mx-auto">
            <AuthHero descriptionOnly />
            <MarketingShowcase />
          </div>

          {/* Mobile social links */}
          <div className="text-center space-y-3 lg:hidden">
            <p className="text-xs text-ivory/40">Follow us & shop golf products</p>
            <div className="flex justify-center gap-6">
              <a href="https://www.instagram.com/scgolfacademy" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-ivory/50 hover:text-gold-accent transition-colors">
                <Instagram className="h-4 w-4" />
                <span>@scgolfacademy</span>
              </a>
              <a href="https://www.instagram.com/cancungolfproducts" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-ivory/50 hover:text-gold-accent transition-colors">
                <ShoppingBag className="h-4 w-4" />
                <span>@cancungolfproducts</span>
              </a>
            </div>
            <Link to="/privacidad" className="inline-block text-xs text-ivory/40 hover:text-gold-accent transition-colors">
              Privacidad
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
