import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { resolveLandingRoute, hasActiveStaffScopes } from '@/lib/staffLanding';

/**
 * OAuth Callback Handler
 * 
 * CONFIGURATION REQUIRED:
 * 1. Enable Google and Apple providers in Supabase Dashboard > Authentication > Providers
 * 2. Add this redirect URL to Supabase Dashboard > Authentication > URL Configuration:
 *    - ${YOUR_SITE_URL}/auth/callback
 * 3. For Google: Configure OAuth consent screen and credentials in Google Cloud Console
 * 4. For Apple: Configure Sign in with Apple in Apple Developer Console
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Detect parent-access magic link (?parent=1&grant=<id>) BEFORE redirecting.
        const url = new URL(window.location.href);
        const isParent = url.searchParams.get('parent') === '1';
        const grantId = url.searchParams.get('grant');
        if (isParent) {
          sessionStorage.setItem('apex_parent_session', '1');
        }

        // Get the session - Supabase handles the OAuth code exchange automatically
        // when detectSessionInUrl is enabled in the client config
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session?.user) {
          await consumePendingInvite();
          if (isParent && grantId) {
            await markGrantUsed(grantId);
            navigate('/dashboard', { replace: true });
            return;
          }
          navigate(await resolveLanding(session.user.id), { replace: true });
        } else {
          // No session yet, wait for auth state change
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (event === 'SIGNED_IN' && session?.user) {
                subscription.unsubscribe();
                await consumePendingInvite();
                if (isParent && grantId) {
                  await markGrantUsed(grantId);
                  navigate('/dashboard', { replace: true });
                  return;
                }
                navigate(await resolveLanding(session.user.id), { replace: true });
              }
            }
          );

          // Timeout after 10 seconds
          setTimeout(() => {
            subscription.unsubscribe();
            setError('Authentication timed out. Please try again.');
          }, 10000);
        }
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        setError(err.message || 'Authentication failed. Please try again.');
      }
    };

    handleCallback();
  }, [navigate]);

  async function markGrantUsed(grantId: string): Promise<void> {
    try {
      await supabase
        .from('parent_access_grants')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', grantId);
    } catch (e) {
      console.warn('mark grant used failed:', e);
    }
  }

  async function consumePendingInvite(): Promise<void> {
    const code = sessionStorage.getItem('pending_invite_code');
    if (!code) return;
    try {
      await supabase.functions.invoke('accept-invite', { body: { code } });
    } catch (e) {
      console.warn('accept-invite failed:', e);
    }
    sessionStorage.removeItem('pending_invite_code');
  }

  async function resolveLanding(userId: string): Promise<string> {
    const [{ data: roleData }, { data: permsData }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('staff_permissions').select('scope').eq('user_id', userId),
    ]);
    const isAdminOrCoach = (roleData ?? []).some((r: any) => r.role === 'admin' || r.role === 'coach');
    if (isAdminOrCoach) return '/admin';
    const scopes = (permsData ?? []).map((p: any) => p.scope);
    // Dual-role users (active staff scopes + student activity) land on their
    // student portal unless they explicitly chose staff mode. Everything is
    // resolved from the DB on each load, never from cached claims.
    if (hasActiveStaffScopes(scopes)) {
      const isStudentRole = (roleData ?? []).some((r: any) => r.role === 'student');
      let isAlsoStudent = isStudentRole;
      if (!isAlsoStudent) {
        const [lessonsRes, videosRes] = await Promise.all([
          supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('student_id', userId),
          supabase.from('videos').select('id', { count: 'exact', head: true }).eq('student_id', userId),
        ]);
        isAlsoStudent = ((lessonsRes.count ?? 0) + (videosRes.count ?? 0)) > 0;
      }
      return resolveLandingRoute({ userId, permissions: scopes, isAlsoStudent });
    }
    if (scopes.includes('pro_zone')) return '/admin/pro-zone';
    if (scopes.includes('students')) return '/admin/students';
    if (scopes.includes('lessons')) return '/admin/lessons';
    if (scopes.includes('revenue')) return '/admin/revenue';
    if (scopes.includes('subscribers')) return '/admin/subscribers';
    if (scopes.includes('stripe_payments')) return '/admin/stripe-payments';
    if (scopes.includes('analysis_requests')) return '/admin/analysis-requests';
    if (scopes.includes('settings')) return '/admin/settings';
    return '/dashboard';
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => navigate('/auth')}
            className="text-primary hover:underline"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
