import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoSubscriptions, demoClassPackages } from '@/data/demoData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, User, Search, CreditCard, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

const statusStyles: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/25',
  canceled: 'bg-destructive/15 text-destructive border-destructive/25',
  past_due: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  inactive: 'bg-muted text-muted-foreground border-border',
  trialing: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
};

export function AdminSubscribersView() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'student' | 'period_end'>('period_end');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { effectiveIsAdmin, effectiveCoachId, user } = useAuth();
  const scopeCoach = effectiveIsAdmin ? null : (effectiveCoachId ?? user?.id ?? 'none');
  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['admin-subscriptions-view', isDemoModeActive() ? 'demo' : 'live', scopeCoach ?? 'all'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoSubscriptions as any[];
      let q = supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (scopeCoach) {
        const { data: assigned } = await supabase.from('profiles').select('id').eq('assigned_coach_id', scopeCoach);
        const ids = (assigned || []).map((r: any) => r.id);
        if (ids.length === 0) return [];
        q = q.in('student_id', ids);
      }
      const { data, error } = await q;
      if (error) { console.error('Error fetching subscriptions:', error); return []; }
      return data || [];
    },
  });

  // Also fetch packages to cross-ref which subscribers also have packages
  const { data: packages = [] } = useQuery({
    queryKey: ['admin-packages-for-subs', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoClassPackages.filter((p: any) => (p.classes_remaining ?? 0) > 0) as any[];
      const { data, error } = await supabase.from('class_packages').select('user_id, classes_remaining').gt('classes_remaining', 0);
      if (error) return [];
      return data || [];
    },
  });

  const packageUserIds = useMemo(() => new Set(packages.map((p: any) => p.user_id)), [packages]);

  const toggleSort = (field: 'student' | 'period_end') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const processed = useMemo(() => {
    let result = subscriptions.map((sub: any) => ({
      ...sub,
      displayName: sub.student_name || sub.student_email || 'Unknown',
      hasPackage: sub.student_id ? packageUserIds.has(sub.student_id) : false,
    }));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s: any) => s.displayName.toLowerCase().includes(q) || (s.student_email || '').toLowerCase().includes(q) || (s.plan_name || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter((s: any) => s.status === statusFilter);

    result.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === 'student') cmp = a.displayName.localeCompare(b.displayName);
      else cmp = (a.current_period_end || '').localeCompare(b.current_period_end || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [subscriptions, search, statusFilter, sortField, sortDir, packageUserIds]);

  const stats = useMemo(() => ({
    active: subscriptions.filter((s: any) => s.status === 'active').length,
    canceled: subscriptions.filter((s: any) => s.status === 'canceled').length,
    pastDue: subscriptions.filter((s: any) => s.status === 'past_due').length,
    total: subscriptions.length,
  }), [subscriptions]);

  const SortBtn = ({ field, label }: { field: 'student' | 'period_end'; label: string }) => (
    <button onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('adminTabs.activeSubscribers'), value: stats.active, color: 'text-success' },
          { label: t('adminTabs.canceled'), value: stats.canceled, color: 'text-destructive' },
          { label: t('adminTabs.pastDue'), value: stats.pastDue, color: 'text-orange-400' },
          { label: t('adminTabs.total'), value: stats.total, color: 'text-muted-foreground' },
        ].map(s => (
          <Card key={s.label} className="card-elevated">
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-3xl font-heading font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('adminTabs.searchStudentOrPlan')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder={t('adminTabs.filterStatus')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminTabs.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('adminTabs.statusActive')}</SelectItem>
                <SelectItem value="canceled">{t('adminTabs.statusCanceled')}</SelectItem>
                <SelectItem value="past_due">{t('adminTabs.statusPastDue')}</SelectItem>
                <SelectItem value="trialing">{t('adminTabs.statusTrialing')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : processed.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-heading font-semibold text-lg mb-2">{t('adminTabs.noSubscribersFound')}</h3>
              <p className="text-muted-foreground text-sm">{t('adminTabs.noSubscribersMatchFilters')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead><SortBtn field="student" label={t('adminTabs.hdrStudent')} /></TableHead>
                    <TableHead className="font-semibold">{t('adminTabs.hdrPlan')}</TableHead>
                    <TableHead className="font-semibold text-center">{t('adminTabs.hdrStatus')}</TableHead>
                    <TableHead className="font-semibold text-center">{t('adminTabs.hdrInterval')}</TableHead>
                    <TableHead><SortBtn field="period_end" label={t('adminTabs.hdrPeriodEnd')} /></TableHead>
                    <TableHead className="font-semibold text-center">{t('adminTabs.hdrHasPackage')}</TableHead>
                    <TableHead className="font-semibold text-center">{t('adminTabs.hdrSource')}</TableHead>
                    <TableHead className="font-semibold text-right">{t('adminTabs.hdrActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processed.map((sub: any) => (
                    <TableRow key={sub.id} className="hover:bg-secondary/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-xs">
                            {sub.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{sub.displayName}</p>
                            {sub.student_email && <p className="text-xs text-muted-foreground">{sub.student_email}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{sub.plan_name || sub.plan_tier || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusStyles[sub.status] || 'bg-muted text-muted-foreground'}>
                          {sub.status === 'past_due' ? t('adminTabs.statusPastDue')
                            : sub.status === 'canceled' ? t('adminTabs.statusCanceled')
                            : sub.status === 'active' ? t('adminTabs.statusActive')
                            : sub.status === 'trialing' ? t('adminTabs.statusTrialing')
                            : sub.status === 'unpaid' ? t('adminTabs.statusUnpaid')
                            : sub.status?.charAt(0).toUpperCase() + sub.status?.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground capitalize">
                        {sub.billing_interval}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sub.current_period_end ? format(new Date(sub.current_period_end), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {sub.hasPackage ? (
                          <Badge className="bg-primary/15 text-primary border-primary/25">{t('adminTabs.yes')}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t('adminTabs.no')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs capitalize">{sub.source}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {sub.student_id && (
                          <Link to={`/admin/student/${sub.student_id}`}>
                            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                              <User className="h-3.5 w-3.5" />
                              {t('adminTabs.view')}
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
