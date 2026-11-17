import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Mail, ExternalLink, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

interface DnsRecord {
  record?: string;       // e.g. "MX", "TXT", "SPF", "DKIM"
  name?: string;
  type?: string;
  value?: string;
  ttl?: string | number;
  priority?: number;
  status?: string;       // "verified" | "not_started" | "pending" | "failed"
}

interface DomainStatus {
  configured: boolean;
  from: string;
  sender_domain: string;
  found?: boolean;
  domain?: {
    id: string;
    name: string;
    status: string;       // "verified" | "pending" | "not_started" | "failed" | "temporary_failure"
    region?: string;
    created_at?: string;
    records?: DnsRecord[];
  };
  error?: string;
}

const REQUIRED_KINDS = ['MX', 'SPF', 'DKIM'] as const;
type RequiredKind = typeof REQUIRED_KINDS[number];

/** Resend returns records with `record: "MX" | "SPF" | "DKIM"` (or sometimes only `type`). */
function classify(rec: DnsRecord): RequiredKind | null {
  const tag = (rec.record || rec.type || '').toUpperCase();
  if (tag.includes('MX')) return 'MX';
  if (tag.includes('DKIM')) return 'DKIM';
  if (tag.includes('SPF') || (tag === 'TXT' && (rec.value || '').toLowerCase().includes('spf'))) return 'SPF';
  return null;
}

function statusBadge(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'verified') {
    return (
      <Badge variant="outline" className="border-primary/40 text-primary">
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verified
      </Badge>
    );
  }
  if (s === 'pending' || s === 'not_started') {
    return (
      <Badge variant="outline" className="border-accent/40 text-accent">
        <Clock className="h-3.5 w-3.5 mr-1" /> {s === 'pending' ? 'Pending' : 'Not started'}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertCircle className="h-3.5 w-3.5 mr-1" /> {status || 'Unknown'}
    </Badge>
  );
}

function copy(value: string, label = 'Value') {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error('Could not copy'),
  );
}

export default function AdminEmailDomain() {
  const { data, isLoading, isFetching, refetch, error } = useQuery<DomainStatus>({
    queryKey: ['resend-domain-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('resend-domain-status', {
        body: {},
      });
      if (error) throw error;
      return data as DomainStatus;
    },
  });

  const records = data?.domain?.records ?? [];

  const checklist: Record<RequiredKind, DnsRecord | undefined> = {
    MX: records.find((r) => classify(r) === 'MX'),
    SPF: records.find((r) => classify(r) === 'SPF'),
    DKIM: records.find((r) => classify(r) === 'DKIM'),
  };

  return (
    <div className="min-h-screen bg-background">
      <InternalHeader
        titleKey="admin.emailDomainTitle"
        subtitleKey="admin.emailDomainSub"
        backTo="/admin/settings"
      />
      <main className="container max-w-3xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              Email sending domain
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live status of your Resend domain and the DNS records required to send transactional email.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh
          </Button>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-6 text-sm text-destructive">
              Failed to load domain status: {(error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configured sender</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="From address" value={data?.from ?? '—'} />
                <Row label="Sender domain" value={data?.sender_domain ?? '—'} />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Resend status</span>
                  {data?.found && data?.domain ? statusBadge(data.domain.status) : (
                    <Badge variant="destructive">
                      <AlertCircle className="h-3.5 w-3.5 mr-1" /> Not added in Resend
                    </Badge>
                  )}
                </div>
                {data?.error && (
                  <p className="text-xs text-destructive pt-2 border-t border-border">
                    {data.error}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">DNS checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!data?.found ? (
                  <div className="text-sm text-muted-foreground">
                    The domain hasn't been added to Resend yet. Add{' '}
                    <code className="text-foreground">{data?.sender_domain}</code> in the Resend dashboard,
                    then return here to copy the records.
                  </div>
                ) : (
                  REQUIRED_KINDS.map((kind) => {
                    const rec = checklist[kind];
                    const verified = (rec?.status || '').toLowerCase() === 'verified';
                    return (
                      <div
                        key={kind}
                        className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card/40"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-medium">
                            {verified ? (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            ) : (
                              <Clock className="h-4 w-4 text-accent" />
                            )}
                            <span>{kind}</span>
                          </div>
                          {rec ? statusBadge(rec.status) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Missing
                            </Badge>
                          )}
                        </div>
                        {rec && (
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_auto] gap-2 text-xs">
                            <span className="text-muted-foreground">Name</span>
                            <code className="font-mono break-all text-foreground">{rec.name || '—'}</code>
                            {rec.name ? (
                              <Button size="sm" variant="ghost" className="h-6 px-2"
                                onClick={() => copy(rec.name!, 'Name')}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            ) : <span />}

                            <span className="text-muted-foreground">Value</span>
                            <code className="font-mono break-all text-foreground">{rec.value || '—'}</code>
                            {rec.value ? (
                              <Button size="sm" variant="ghost" className="h-6 px-2"
                                onClick={() => copy(rec.value!, 'Value')}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            ) : <span />}

                            {(rec.priority !== undefined || rec.ttl !== undefined) && (
                              <>
                                <span className="text-muted-foreground">Other</span>
                                <span className="text-foreground">
                                  {rec.priority !== undefined && <>priority {rec.priority}</>}
                                  {rec.priority !== undefined && rec.ttl !== undefined && ' · '}
                                  {rec.ttl !== undefined && <>ttl {rec.ttl}</>}
                                </span>
                                <span />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="https://resend.com/domains" target="_blank" rel="noreferrer">
                  Open Resend Domains <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noreferrer">
                  DNS docs <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            </div>
          </>
        )}
      </main>
      <SocialFooter />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <code className="font-mono text-xs sm:text-sm text-foreground break-all text-right">{value}</code>
    </div>
  );
}