import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Link2, ExternalLink, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoStripePayments } from '@/data/demoData';
import { supabase } from '@/integrations/supabase/client';
import { fmtMXN } from '@/lib/formatCurrency';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { SocialFooter } from '@/components/SocialFooter';
import { InternalHeader } from '@/components/InternalHeader';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { localizeDemoText } from '@/lib/demoText';

export default function AdminStripePayments() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const { data: payments = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-stripe-payments', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoStripePayments as any[];
      const { data, error } = await supabase
        .from('stripe_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const statusIcon = (status: string) => {
    if (status === 'succeeded') return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400" />;
    if (status === 'refunded') return <XCircle className="h-4 w-4 text-orange-400" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      succeeded: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
      refunded: 'bg-orange-500/20 text-orange-300',
      partially_refunded: 'bg-orange-500/20 text-orange-300',
      pending: 'bg-yellow-500/20 text-yellow-300',
    };
    const labels: Record<string, string> = {
      succeeded: t('money.statusSucceeded'),
      failed: t('money.statusFailed'),
      refunded: t('money.statusRefunded'),
      partially_refunded: t('money.statusPartiallyRefunded'),
      pending: t('money.statusPending'),
    };
    return <Badge className={`${colors[status] || 'bg-muted text-muted-foreground'} text-xs`}>{labels[status] || status}</Badge>;
  };

  const unmatchedCount = payments.filter((p: any) => !p.student_matched).length;
  const totalSucceeded = payments
    .filter((p: any) => p.status === 'succeeded')
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0) - (Number(p.refund_amount) || 0), 0);

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.stripePaymentsTitle" subtitleKey="admin.stripePaymentsSub" backTo="/admin" />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ivory">{t('money.paymentRecords')}</h2>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-ivory/70 border-ivory/20">
            <RefreshCw className="h-4 w-4 mr-1" /> {t('money.refresh')}
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="card-dark border-ivory/10">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-ivory/50">{t('money.totalPayments')}</p>
              <p className="text-lg font-bold text-ivory">{payments.length}</p>
            </CardContent>
          </Card>
          <Card className="card-dark border-ivory/10">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-ivory/50">{t('money.succeededRevenue')}</p>
              <p className="text-lg font-bold text-ivory">{fmtMXN(totalSucceeded)}</p>
            </CardContent>
          </Card>
          <Card className="card-dark border-ivory/10">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-ivory/50">{t('money.matched')}</p>
              <p className="text-lg font-bold text-green-400">{payments.filter((p: any) => p.student_matched).length}</p>
            </CardContent>
          </Card>
          <Card className={`card-dark border-ivory/10 ${unmatchedCount > 0 ? 'border-yellow-500/30' : ''}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-ivory/50">{t('money.unmatched')}</p>
              <p className={`text-lg font-bold ${unmatchedCount > 0 ? 'text-yellow-400' : 'text-ivory'}`}>{unmatchedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Payments table */}
        <Card className="card-dark border-ivory/10">
          <CardHeader>
            <CardTitle className="text-ivory text-sm font-heading">{t('money.paymentRecords')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-ivory/50 text-sm text-center py-8">{t('money.loading')}</p>
            ) : payments.length === 0 ? (
              <p className="text-ivory/50 text-sm text-center py-8">{t('money.noStripePayments')}</p>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="border-ivory/10">
                      <TableHead className="text-ivory/60 text-xs">{t('money.date')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.student')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.product')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.type')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.amount')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.status')}</TableHead>
                      <TableHead className="text-ivory/60 text-xs">{t('money.matched')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p: any) => (
                      <TableRow key={p.id} className="border-ivory/5 hover:bg-ivory/5">
                        <TableCell className="text-ivory/80 text-xs whitespace-nowrap">
                          {p.paid_at ? format(parseISO(p.paid_at), 'MMM d, yyyy') : format(parseISO(p.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-ivory text-xs">
                          {p.student_name || p.student_email || t('money.unknown')}
                          {p.student_id && (
                            <Link to={`/admin/student/${p.student_id}`} className="ml-1">
                              <ExternalLink className="h-3 w-3 inline text-ivory/40 hover:text-ivory" />
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-ivory/80 text-xs max-w-[150px] truncate">{localizeDemoText(t, p.product_name) || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] text-ivory/60 border-ivory/20">
                            {p.reporting_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-ivory font-mono text-xs">
                          {fmtMXN(Number(p.amount) || 0)}
                          {Number(p.refund_amount) > 0 && (
                            <span className="text-orange-400 ml-1 text-[10px]">(-{fmtMXN(Number(p.refund_amount))})</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        <TableCell>
                          {p.student_matched ? (
                            <Link2 className="h-4 w-4 text-green-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
      <SocialFooter />
    </div>
  );
}
