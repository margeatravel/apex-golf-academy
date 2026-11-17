import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CircleDot, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import ApexBrand from '@/components/ApexBrand';

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

/**
 * Password Reset Page
 * 
 * Supabase Auth URL Configuration Required:
 * - Site URL: https://scgolfacademy.lovable.app
 * - Additional Redirect URLs must include: https://scgolfacademy.lovable.app/auth/reset
 */
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    // Detect a recovery link in either the URL hash (#access_token=...&type=recovery)
    // or the query string (?code=... from PKCE flow). Supabase's client will exchange
    // these into a session automatically because detectSessionInUrl is enabled.
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const looksLikeRecovery =
      hash.includes('type=recovery') ||
      hash.includes('access_token=') ||
      /[?&]code=/.test(search);

    // Listen for auth events FIRST so we don't miss PASSWORD_RECOVERY / SIGNED_IN.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasSession(true);
      }
    });

    // Then poll for the session a few times — recovery tokens in the URL take a
    // moment to be exchanged, and the auth event isn't always fired in time.
    const checkSession = async () => {
      for (let i = 0; i < 10; i++) {
        if (cancelled) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasSession(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      // After ~4s with no session and no recovery markers in the URL, treat
      // the link as invalid. If recovery markers were present, give the user
      // the benefit of the doubt and still show the form so they can try.
      if (!cancelled) {
        setHasSession((prev) => (prev === null ? looksLikeRecovery : prev));
      }
    };
    checkSession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      passwordSchema.parse({ password, confirmPassword });

      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: 'Password updated!',
        description: 'Your password has been successfully reset.',
      });

      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking session
  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/20 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No valid session - link may be expired or invalid
  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/20 to-background">
        <Card className="w-full max-w-md p-8 card-elevated border-border/50 text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            Invalid or Expired Link
          </h2>
          <p className="text-muted-foreground mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <div className="space-y-3">
            <Link to="/auth/forgot" className="block">
              <Button className="w-full">
                Request New Reset Link
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/20 to-background">
        <Card className="w-full max-w-md p-8 card-elevated border-border/50 text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            Password Updated!
          </h2>
          <p className="text-muted-foreground mb-6">
            Your password has been successfully reset. Redirecting to dashboard...
          </p>
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/20 to-background">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <ApexBrand size="lg" align="center" glow />
        </div>

        <Card className="p-8 card-elevated border-border/50">
          <div className="space-y-2 text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">
              Set New Password
            </h2>
            <p className="text-muted-foreground">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-12 bg-secondary/50 border-border/60 focus:border-primary focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-medium">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-12 bg-secondary/50 border-border/60 focus:border-primary focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg hover:shadow-xl transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Password must be at least 8 characters
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
