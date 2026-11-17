import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CircleDot, Mail, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import ApexBrand from '@/components/ApexBrand';

const emailSchema = z.string().email('Please enter a valid email address');

/**
 * Password Reset Configuration:
 * Uses the current origin so the reset link returns the user to the same
 * environment they requested it from (preview or production).
 * Supabase Auth must have each origin's /auth/reset URL allow-listed.
 */
// Always send the password-reset link to the production custom domain so
// the email lands on a stable, allow-listed URL. Otherwise Supabase Auth
// falls back to the project's Site URL (a Lovable preview URL), which is
// what was happening before.
const PRODUCTION_RESET_URL = 'https://apexgolf.com.mx/auth/reset';
const getResetUrl = () => PRODUCTION_RESET_URL;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      emailSchema.parse(email);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetUrl(),
      });

      if (error) throw error;

      // Always show success to avoid leaking whether email exists
      setSubmitted(true);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Invalid Email',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      } else {
        // Still show success to avoid leaking info
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/20 to-background">
        <Card className="w-full max-w-md p-8 card-elevated border-border/50 text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            Check your email
          </h2>
          <p className="text-muted-foreground mb-2">
            We sent you a reset link.
          </p>
          <p className="text-sm text-muted-foreground/80 mb-6">
            If an account exists for <span className="font-medium text-foreground">{email}</span>, the link will arrive shortly. Don't forget to check your spam folder.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-6">
            Still nothing after a few minutes? Your account may have been created by your Coach without an email address yet. Reach out to them so they can add it and send you in.
          </p>
          <Link to="/auth">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </Link>
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
                <Mail className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">
              Forgot your password?
            </h2>
            <p className="text-muted-foreground">
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-secondary/50 border-border/60 focus:border-primary focus:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg hover:shadow-xl transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/auth"
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Sign In
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
