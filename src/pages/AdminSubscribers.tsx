import { useQuery } from '@tanstack/react-query';
import { useCoachPreview } from '@/contexts/CoachPreviewContext';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoSubscriptions, demoBillingPlans } from '@/data/demoData';
import { fmtMXN } from '@/lib/formatCurrency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, CreditCard, TrendingUp, AlertTriangle, Search, RefreshCw, ArrowLeft, UserCheck, UserX, Clock, MoreVertical, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MobileMenu } from '@/components/MobileMenu';
import { CoachAvatarMenu } from '@/components/CoachAvatarMenu';
import { NotificationBell } from '@/components/NotificationBell';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SocialFooter } from '@/components/SocialFooter';
import { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import ApexBrand from '@/components/ApexBrand';
import { CancelSubscriptionDialog } from '@/components/CancelSubscriptionDialog';
import { PauseSubscriptionDialog } from '@/components/PauseSubscriptionDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { XCircle, PauseCircle, PlayCircle } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

type SubscriptionRow = {
  id: string;
  student_id: string | null;
  student_email: string | null;
  student_name: string | null;
  plan_name: string | null;
  plan_tier: string | null;
  billing_interval: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  is_active: boolean;
  student_matched: boolean;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  last_synced_at: string | null;
  billing_plan_id: string | null;
  paused_at: string | null;
  archived_at: string | null;
  billing_plans?: { price_amount: number | null; billing_interval: string | null; currency: string | null } | null;
};

// Single-source status badge. Precedence: canceled > paused > canceling > raw.
function getStatusBadge(sub: { status: string; cancel_at_period_end: boolean; paused_at: string | null }, t: (k: string) => string) {
  if (sub.status === 'canceled') {
    return { label: t('money.stCanceled'), bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
  }
  if (sub.paused_at) {
    return { label: t('money.stPaused'), bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' };
  }
  if (sub.cancel_at_period_end && sub.status === 'active') {
    return { label: t('money.stCanceling'), bg: 'rgba(251,146,60,0.15)', color: '#fb923c' };
  }
  switch (sub.status) {
    case 'active': return { label: t('money.stActive'), bg: 'rgba(74,124,89,0.2)', color: '#4a7c59' };
    case 'trialing': return { label: t('money.stTrial'), bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' };
    case 'past_due': return { label: t('money.stPastDue'), bg: 'rgba(251,146,60,0.15)', color: '#fb923c' };
    case 'unpaid': return { label: t('money.stUnpaid'), bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    case 'incomplete': return { label: t('money.stIncomplete'), bg: 'rgba(251,146,60,0.15)', color: '#fb923c' };
    case 'incomplete_expired': return { label: t('money.stExpired'), bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    default: return { label: sub.status, bg: 'rgba(255,255,255,0.1)', color: '#F5F0E8' };
  }
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getPlanBadge(tier: string | null) {
  switch (tier) {
    case 'pro':
      return { bg: 'rgba(217,170,66,0.15)', color: '#D9AA42' };
    case 'scratch': return { bg: 'rgba(74,124,89,0.2)', color: '#4a7c59' };
    default: return { bg: 'rgba(255,255,255,0.08)', color: '#E8D5B0' };
  }
}

export default function AdminSubscribers() {
  const { t } = useLanguage();
  const { signOut, role, effectiveIsAdmin, effectiveCoachId, user } = useAuth();
  // Coaches (real or previewed) only ever see their own assigned students.
  const previewCoachId = useCoachPreview()?.coachId ?? (effectiveIsAdmin ? null : (effectiveCoachId ?? user?.id ?? 'none'));
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [cancelTarget, setCancelTarget] = useState<SubscriptionRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<SubscriptionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteAckStripe, setDeleteAckStripe] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const resyncedRef = useRef<Set<string>>(new Set());

  const { data: subscriptions = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-subscriptions', isDemoModeActive() ? 'demo' : 'live', previewCoachId ?? 'all'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoSubscriptions as unknown as SubscriptionRow[];
      let sq = supabase
        .from('subscriptions')
        .select('*, billing_plans(price_amount, billing_interval, currency)')
        .order('created_at', { ascending: false });
      // Coach preview only: restrict to students assigned to the previewed coach.
      if (previewCoachId) {
        const { data: assigned } = await supabase.from('profiles').select('id').eq('assigned_coach_id', previewCoachId);
        const ids = (assigned || []).map((r: any) => r.id);
        if (ids.length === 0) return [] as SubscriptionRow[];
        sq = sq.in('student_id', ids);
      }
      const { data, error } = await sq;
      if (error) throw error;
      return (data || []) as SubscriptionRow[];
    },
  });

  // Self-healing: any row with current_period_end in the past gets a one-shot
  // Stripe re-sync, then refetch. Each row resynced only once per page load.
  useEffect(() => {
    if (!subscriptions?.length) return;
    const now = Date.now();
    const stale = subscriptions
      .filter(s =>
        s.stripe_subscription_id &&
        s.current_period_end &&
        new Date(s.current_period_end).getTime() < now &&
        !resyncedRef.current.has(s.id)
      )
      .map(s => s.id);
    if (stale.length === 0 || isDemoModeActive()) return;
    stale.forEach(id => resyncedRef.current.add(id));
    (async () => {
      try {
        await supabase.functions.invoke('admin-resync-subscription', {
          body: { subscription_ids: stale },
        });
        await refetch();
      } catch (e) {
        console.warn('[AdminSubscribers] resync failed', e);
      }
    })();
  }, [subscriptions, refetch]);

  // Some subscriptions don't have billing_plan_id set; fall back to looking up
  // the matching billing_plan via stripe_price_id.
  const { data: billingPlans = [] } = useQuery({
    queryKey: ['billing-plans-price-lookup', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoBillingPlans as any[];
      const { data, error } = await supabase
        .from('billing_plans')
        .select('id, stripe_price_id, price_amount, billing_interval, currency');
      if (error) return [];
      return data || [];
    },
  });

  const priceByStripeId = useMemo(() => {
    const m = new Map<string, { price_amount: number; billing_interval: string }>();
    for (const p of billingPlans) {
      if (p.stripe_price_id) m.set(p.stripe_price_id, {
        price_amount: p.price_amount ?? 0,
        billing_interval: p.billing_interval || 'month',
      });
    }
    return m;
  }, [billingPlans]);

  // price_amount is stored in cents. Returns monthly equivalent in MXN whole units.
  const getMonthlyMXN = (sub: SubscriptionRow): number => {
    let amt = sub.billing_plans?.price_amount ?? 0;
    let interval = (sub.billing_plans?.billing_interval || sub.billing_interval || 'month').toLowerCase();
    if (!amt && sub.stripe_price_id) {
      const fb = priceByStripeId.get(sub.stripe_price_id);
      if (fb) { amt = fb.price_amount; interval = fb.billing_interval.toLowerCase(); }
    }
    if (!amt) return 0;
    const mxn = amt / 100;
    if (['year', 'yearly', 'annual'].includes(interval)) return mxn / 12;
    if (['week', 'weekly'].includes(interval)) return mxn * 4.345;
    if (['one_time', 'one-time'].includes(interval)) return 0;
    return mxn;
  };

  // KPI calculations
  const activeMonthly = subscriptions.filter(s => s.is_active && s.billing_interval === 'month');
  const totalActive = subscriptions.filter(s => s.is_active);
  const canceledRecent = subscriptions.filter(s => s.status === 'canceled' || s.cancel_at_period_end);
  const unmatched = subscriptions.filter(s => !s.student_matched);
  const pastDue = subscriptions.filter(s => s.status === 'past_due' || s.status === 'unpaid');

  // Total MRR across ALL active subscriptions.
  const totalMRR = totalActive.reduce((sum, s) => sum + getMonthlyMXN(s), 0);

  // Subscribers by plan
  const byPlan = totalActive.reduce((acc, s) => {
    const tier = s.plan_tier || 'unknown';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Filter
  const filtered = subscriptions.filter(s => {
    if (viewFilter === 'active' && s.archived_at) return false;
    if (viewFilter === 'archived' && !s.archived_at) return false;
    if (statusFilter === 'active' && !s.is_active) return false;
    if (statusFilter === 'canceled' && s.status !== 'canceled' && !s.cancel_at_period_end) return false;
    if (statusFilter === 'past_due' && s.status !== 'past_due' && s.status !== 'unpaid') return false;
    if (statusFilter === 'unmatched' && s.student_matched) return false;
    if (planFilter !== 'all' && s.plan_tier !== planFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.student_name || '').toLowerCase().includes(q) ||
             (s.student_email || '').toLowerCase().includes(q) ||
             (s.plan_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleArchiveToggle = async (sub: SubscriptionRow) => {
    const next = sub.archived_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from('subscriptions')
      .update({ archived_at: next })
      .eq('id', sub.id);
    if (error) {
      toast({ title: t('money.failed'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: next ? t('money.archived') : t('money.unarchived') });
    refetch();
  };

  const openDelete = (sub: SubscriptionRow) => {
    setDeleteTarget(sub);
    setDeleteConfirmName('');
    setDeleteAckStripe(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const expected = (deleteTarget.student_name || deleteTarget.student_email || '').trim();
    if (!expected || deleteConfirmName.trim() !== expected) {
      toast({ title: t('money.nameDoesNotMatch'), variant: 'destructive' });
      return;
    }
    const blockedByStripe = deleteTarget.is_active && !!deleteTarget.stripe_subscription_id;
    if (blockedByStripe && !deleteAckStripe) {
      toast({ title: t('money.confirmStripeFirst'), variant: 'destructive' });
      return;
    }
    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-subscription', {
        body: {
          subscription_id: deleteTarget.id,
          acknowledge_stripe_canceled: deleteAckStripe,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: t('money.subscriptionDeleted') });
      setDeleteTarget(null);
      refetch();
    } catch (e: any) {
      toast({ title: t('money.deleteFailed'), description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <header className="sticky top-0 z-10" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin" aria-label="Go to dashboard" className="flex-shrink-0">
              <ApexBrand size="md" taglineHiddenOnMobile />
            </Link>
            <div className="min-w-0">
              <p className="truncate" style={{ color: '#4a7c59', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('money.coachPortal')}</p>
              <h1 className="truncate" style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700 }}>{t('money.subscribers')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <GlobalSearch />
            <LanguageToggle variant="header" />
            <NotificationBell />
            <CoachAvatarMenu />
            <MobileMenu isCoach={true} onSignOut={signOut} currentView="coach" />
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-5 max-w-4xl mx-auto">
        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-2 text-xs" style={{ color: '#E8D5B0', opacity: 0.7 }}>
          <ArrowLeft className="h-4 w-4" /> {t('money.backToDashboard')}
        </Button>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: t('money.activeSubscribers'), value: totalActive.length, icon: UserCheck, iconBg: '#4a7c59' },
            { label: 'MRR', value: fmtMXN(Math.round(totalMRR)), icon: TrendingUp, iconBg: 'rgba(74,124,89,0.2)' },
          ].map(kpi => (
            <div key={kpi.label} className="glass-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</p>
                  <p style={{ color: '#E8D5B0', fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.value}</p>
                </div>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: kpi.iconBg }}>
                  <kpi.icon className="h-5 w-5" style={{ color: '#F5F0E8' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* By Plan breakdown */}
        {Object.keys(byPlan).length > 0 && (
          <div className="glass-card p-4">
            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('ui.subscribers.activeByPlan')}</p>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(byPlan).map(([tier, count]) => {
                const pb = getPlanBadge(tier);
                return (
                  <div key={tier} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: pb.bg }}>
                    <span style={{ color: pb.color, fontWeight: 600, fontSize: 14 }}>{count}</span>
                    <span style={{ color: pb.color, fontSize: 12, textTransform: 'capitalize' }}>{tier}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past due alert */}
        {pastDue.length > 0 && (
          <div className="glass-card p-4 flex items-center gap-3" style={{ borderLeft: '3px solid #fb923c' }}>
            <AlertTriangle className="h-5 w-5" style={{ color: '#fb923c' }} />
            <div>
              <p style={{ color: '#fb923c', fontWeight: 600, fontSize: 14 }}>{t('money.subsPastDue').replace('{n}', String(pastDue.length))}</p>
              <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 12 }}>{t('ui.subscribers.mayLoseAccess')}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#E8D5B0', opacity: 0.5 }} />
            <Input
              placeholder={t('ui.subscribers.searchPh')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 glass-input"
              style={{ fontSize: 13 }}
            />
          </div>
          <div className="grid grid-cols-3 sm:flex sm:flex-row gap-2 sm:gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px] glass-input text-xs">
              <SelectValue placeholder={t('money.filterStatus')} />
            </SelectTrigger>
            <SelectContent style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
              <SelectItem value="all" style={{ color: '#F5F0E8' }}>{t('ui.subscribers.allStatuses')}</SelectItem>
              <SelectItem value="active" style={{ color: '#F5F0E8' }}>{t('ui.subscribers.active')}</SelectItem>
              <SelectItem value="canceled" style={{ color: '#F5F0E8' }}>{t('ui.subscribers.canceled')}</SelectItem>
              <SelectItem value="past_due" style={{ color: '#F5F0E8' }}>{t('ui.subscribers.pastDue')}</SelectItem>
              <SelectItem value="unmatched" style={{ color: '#F5F0E8' }}>{t('ui.subscribers.unmatched')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={viewFilter} onValueChange={(v: any) => setViewFilter(v)}>
            <SelectTrigger className="w-full sm:w-[130px] glass-input text-xs">
              <SelectValue placeholder={t('money.filterView')} />
            </SelectTrigger>
            <SelectContent style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
              <SelectItem value="active" style={{ color: '#F5F0E8' }}>{t('money.viewActive')}</SelectItem>
              <SelectItem value="archived" style={{ color: '#F5F0E8' }}>{t('money.viewArchived')}</SelectItem>
              <SelectItem value="all" style={{ color: '#F5F0E8' }}>{t('money.viewAll')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-full sm:w-[130px] glass-input text-xs">
              <SelectValue placeholder={t('money.filterPlan')} />
            </SelectTrigger>
            <SelectContent style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
              <SelectItem value="all" style={{ color: '#F5F0E8' }}>{t('money.allPlans')}</SelectItem>
              <SelectItem value="scratch" style={{ color: '#F5F0E8' }}>Scratch</SelectItem>
              <SelectItem value="pro" style={{ color: '#F5F0E8' }}>Pro</SelectItem>
            </SelectContent>
          </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 self-start sm:self-auto" style={{ color: '#E8D5B0' }}>
            <RefreshCw className="h-4 w-4" /> {t('money.refresh')}
          </Button>
        </div>

        {/* Subscribers table */}
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" style={{ color: '#E8D5B0', opacity: 0.4 }} />
              <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 13 }}>{t('money.loadingSubscribers')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-10 w-10 mx-auto mb-2" style={{ color: '#E8D5B0', opacity: 0.3 }} />
              <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 14 }}>{t('ui.subscribers.none')}</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {filtered.map(sub => {
                const statusBadge = getStatusBadge(sub, t);
                const planBadge = getPlanBadge(sub.plan_tier);
                return (
                  <div key={sub.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: sub.student_matched ? '#4a7c59' : 'rgba(251,146,60,0.2)', color: '#F5F0E8' }}>
                          {sub.student_name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {sub.student_id ? (
                              <Link to={`/admin/student/${sub.student_id}`} style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 14 }} className="hover:underline truncate">
                                {sub.student_name || t('money.unknown')}
                              </Link>
                            ) : (
                              <span style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 14 }} className="truncate">{sub.student_name || sub.student_email || t('money.unknown')}</span>
                            )}
                            {!sub.student_matched && (
                              <span style={{ color: '#fb923c', fontSize: 10, background: 'rgba(251,146,60,0.1)', padding: '1px 6px', borderRadius: 6 }}>{t('money.unmatched')}</span>
                            )}
                            {sub.archived_at && (
                              <span style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 6 }}>{t('money.badgeArchived')}</span>
                            )}
                          </div>
                          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }} className="truncate">{sub.student_email || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0 sm:justify-end pl-[52px] sm:pl-0">
                        {(() => {
                          const monthly = getMonthlyMXN(sub);
                          if (!monthly) return null;
                          return (
                            <Badge style={{ background: 'rgba(255,255,255,0.08)', color: '#F5F0E8', border: 'none', fontSize: 11, fontWeight: 600 }}>
                              {fmtMXN(Math.round(monthly))}/mo
                            </Badge>
                          );
                        })()}
                        <Badge style={{ background: planBadge.bg, color: planBadge.color, border: 'none', fontSize: 11, textTransform: 'capitalize' }}>
                          {sub.plan_tier || sub.plan_name || '—'}
                        </Badge>
                        <Badge style={{ background: statusBadge.bg, color: statusBadge.color, border: 'none', fontSize: 11 }}>
                          {statusBadge.label}
                        </Badge>
                        {sub.is_active && sub.stripe_subscription_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPauseTarget(sub)}
                            className="h-7 gap-1 text-xs"
                            style={{ color: '#60a5fa' }}
                          >
                            {sub.paused_at ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                            {sub.paused_at ? t('money.resume') : t('money.pause')}
                          </Button>
                        )}
                        {sub.is_active && !sub.cancel_at_period_end && sub.stripe_subscription_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTarget(sub)}
                            className="h-7 gap-1 text-xs"
                            style={{ color: '#ef4444' }}
                          >
                            <XCircle className="h-3.5 w-3.5" /> {t('money.cancel')}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" style={{ color: '#E8D5B0' }}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
                            <DropdownMenuItem onClick={() => handleArchiveToggle(sub)} style={{ color: '#F5F0E8' }}>
                              {sub.archived_at ? (
                                <><ArchiveRestore className="h-3.5 w-3.5 mr-2" /> {t('money.unarchive')}</>
                              ) : (
                                <><Archive className="h-3.5 w-3.5 mr-2" /> {t('money.archive')}</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDelete(sub)} style={{ color: '#ef4444' }}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t('money.deletePermanently')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {/* Details row */}
                    <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap pl-[52px]">
                        <span style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>
                          <Clock className="h-3 w-3 inline mr-1" />
                        {sub.billing_interval === 'month' ? t('money.monthly') : sub.billing_interval === 'year' ? t('money.yearly') : sub.billing_interval}
                      </span>
                      {sub.started_at && (
                        <span style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>
                          {t('money.startedOn').replace('{date}', format(new Date(sub.started_at), 'MMM d, yyyy'))}
                        </span>
                      )}
                      {sub.current_period_end && !sub.cancel_at_period_end && sub.status !== 'canceled' && (
                        <span style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>
                          {t('money.renewsEvery').replace('{day}', String(new Date(sub.current_period_end).getDate()))}
                        </span>
                      )}
                      {/* Single cancel-related label */}
                      {sub.status === 'canceled' ? (
                        <span style={{ color: '#ef4444', opacity: 0.8, fontSize: 11 }}>
                          {t('money.canceledOn').replace('{date}', format(new Date(sub.canceled_at || sub.current_period_end || Date.now()), 'MMM d, yyyy'))}
                        </span>
                      ) : sub.cancel_at_period_end && sub.current_period_end ? (
                        <span style={{ color: '#fb923c', fontSize: 11 }}>
                          {t('money.cancelsOn').replace('{date}', format(new Date(sub.current_period_end), 'MMM d, yyyy'))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <SocialFooter />
      <CancelSubscriptionDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        subscriptionId={cancelTarget?.id}
        studentName={cancelTarget?.student_name || cancelTarget?.student_email}
        onCanceled={() => refetch()}
      />
      <PauseSubscriptionDialog
        open={!!pauseTarget}
        onOpenChange={(o) => { if (!o) setPauseTarget(null); }}
        subscriptionId={pauseTarget?.id}
        studentName={pauseTarget?.student_name || pauseTarget?.student_email}
        isPaused={!!pauseTarget?.paused_at}
        onChanged={() => refetch()}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ui.subscribers.permaDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {t('money.delDescIntro').replace('{name}', deleteTarget?.student_name || deleteTarget?.student_email || t('money.thisSubscriber'))}
                </p>
                {deleteTarget?.is_active && deleteTarget?.stripe_subscription_id && (
                  <div className="rounded-md p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <p style={{ color: '#ef4444', fontWeight: 600 }}>{t('money.delActiveWarn')}</p>
                    <p className="mt-1" style={{ color: '#fca5a5' }}>
                      {t('money.delStripeWarn').replace('{id}', deleteTarget.stripe_subscription_id)}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Checkbox
                        id="ack-stripe"
                        checked={deleteAckStripe}
                        onCheckedChange={(c) => setDeleteAckStripe(!!c)}
                      />
                      <Label htmlFor="ack-stripe" className="text-xs cursor-pointer">
                        {t('money.delAckStripe')}
                      </Label>
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-xs">
                    {t('money.delTypeName').replace('{name}', deleteTarget?.student_name || deleteTarget?.student_email || '')}
                  </Label>
                  <Input
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={t('ui.subscribers.typeNamePh')}
                    className="mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>{t('money.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={deleteBusy}
              style={{ background: '#ef4444' }}
            >
              {deleteBusy ? t('money.deleting') : t('money.deletePermanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
