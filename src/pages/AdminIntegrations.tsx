import { useQuery } from '@tanstack/react-query';
import { Calendar, CreditCard, ExternalLink, Loader2, CheckCircle2, AlertTriangle, LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { GoogleCalendarSyncSection, type GoogleCalSettings } from '@/pages/AdminSettings';
import { GoogleCalendarConnect } from '@/components/GoogleCalendarConnect';

/* Each coach connects their own Google Calendar (per-user OAuth). */
function PersonalCalendarSyncCard() {
  return <GoogleCalendarConnect />;
}

/* Non-owner coach: dedicated Google Calendar page (personal sync only). */
export function CoachGoogleCalendarPage() {
  const { user, role } = useAuth();
  const { data: settings = {} } = useQuery({
    queryKey: ['academy-settings', 'google_calendar_sync'],
    enabled: role === 'staff',
    queryFn: async () => {
      const { data, error } = await supabase.from('academy_settings').select('value').eq('key', 'google_calendar_sync').maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as GoogleCalSettings;
    },
  });
  return (
    <div className="app-bg min-h-screen">
      <InternalHeader title="Google Calendar" subtitle="Sync lessons to your personal calendar" backTo="/admin" />
      <main className="px-4 py-6 space-y-5 max-w-3xl mx-auto">
        {role === 'staff' ? <GoogleCalendarSyncSection data={settings} userId={user?.id ?? ''} /> : <PersonalCalendarSyncCard />}
      </main>
      <SocialFooter />
    </div>
  );
}

/* Stripe status card — reuses stripe_payments data from Revenue page. */
function StripeStatusCard() {
  const { role } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['integrations-stripe-status', role],
    queryFn: async () => {
      if (role === 'staff') {
        const { data, error } = await supabase.rpc('staff_stripe_status');
        if (error) throw error;
        return data as { total: number; latest: { created_at: string; status: string } | null };
      }
      const { data: rows, error } = await supabase
        .from('stripe_payments')
        .select('id, created_at, amount, status')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const { count } = await supabase
        .from('stripe_payments')
        .select('*', { count: 'exact', head: true });
      return { latest: rows?.[0] ?? null, total: count ?? 0 };
    },
  });

  const latest = data?.latest;
  const connected = !!latest;

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-ivory flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-gold-accent" /> Stripe
        </CardTitle>
        <CardDescription className="text-ivory/60">
          Payments, subscriptions and webhooks. Full ledger lives on the Revenue page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-ivory/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {connected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-accent" />
                  <span className="text-ivory">Connected — receiving webhook events</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-gold-accent" />
                  <span className="text-ivory">No Stripe payments recorded yet</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-ivory/75">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ivory/45">Total payments</p>
                <p className="text-ivory font-medium text-base mt-0.5">{data?.total ?? 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ivory/45">Last webhook</p>
                <p className="text-ivory font-medium text-base mt-0.5">
                  {latest?.created_at ? new Date(latest.created_at).toLocaleString() : '—'}
                </p>
              </div>
            </div>
            {latest?.status && (
              <p className="text-ivory/55 text-[12px]">
                Latest status: <span className="text-ivory/80">{latest.status}</span>
              </p>
            )}
          </>
        )}
        <Separator className="bg-white/10" />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => refetch()}
            disabled={isFetching}
            variant="outline"
            className="border-white/15 text-ivory hover:bg-white/10"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Test connection
          </Button>
          {role !== 'staff' && <Button asChild variant="outline" className="border-white/15 text-ivory hover:bg-white/10">
            <Link to="/admin/revenue">
              <ExternalLink className="h-4 w-4 mr-2" /> Open Revenue
            </Link>
          </Button>}
          {role !== 'staff' && <Button asChild variant="outline" className="border-white/15 text-ivory hover:bg-white/10">
            <Link to="/admin/stripe-payments">
              <ExternalLink className="h-4 w-4 mr-2" /> Stripe payments
            </Link>
          </Button>}
        </div>
      </CardContent>
    </Card>
  );
}

/* Owner: dedicated "Google Calendar & Stripe" page. */
export function OwnerIntegrationsPage() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const { data: sharedRow } = useQuery({
    queryKey: ['academy-settings', 'google_calendar_sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('academy_settings')
        .select('value')
        .eq('key', 'google_calendar_sync')
        .maybeSingle();
      return (data as any)?.value ?? {};
    },
  });
  const gcalSync: GoogleCalSettings = (sharedRow as GoogleCalSettings) || {};

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader
        title="Google Calendar & Stripe"
        subtitle="Personal calendar sync, the legacy shared academy connector, and Stripe status"
        backTo="/admin"
      />
      <main className="px-4 py-6 space-y-5 max-w-3xl mx-auto">
        <PersonalCalendarSyncCard />
        <GoogleCalendarSyncSection data={gcalSync} userId={userId} />
        <StripeStatusCard />
      </main>
      <SocialFooter />
    </div>
  );
}
export function StaffStripePage() {
  return (
    <div className="app-bg min-h-screen">
      <InternalHeader title="Stripe" backTo="/staff" />
      <main className="px-4 py-6 max-w-3xl mx-auto"><StripeStatusCard /></main>
      <SocialFooter />
    </div>
  );
}
