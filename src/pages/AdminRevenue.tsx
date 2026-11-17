import { useAuth } from '@/contexts/AuthContext';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, DollarSign, TrendingUp, Calendar, Users, AlertCircle, ExternalLink, CreditCard, Search, Copy, CheckCircle, XCircle, AlertTriangle, RefreshCw, Pencil, Tag, Eye, EyeOff, Wallet, Package as PackageIcon, ChevronDown, Trash2, Plus, CheckCircle2, Play, FileDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import {
  demoStripePayments,
  buildDemoLessons,
  demoPackagePayments,
  demoManualLessonPayments,
  demoClassPackages,
  demoProfiles,
} from '@/data/demoData';
import { DEMO_REVENUE_SUMMARY, DEMO_PACKAGE_SUMMARY } from '@/data/demoData';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, parseISO, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SocialFooter } from '@/components/SocialFooter';
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TransactionEditModal } from '@/components/TransactionEditModal';
import { MarkARPaidModal, type MarkPaidTarget } from '@/components/MarkARPaidModal';
import { RevenueBreakdownModal, type BreakdownScope, type TrendBucket } from '@/components/RevenueBreakdownModal';
import { LinkToARModal } from '@/components/LinkToARModal';
import { EditARModal, type EditARTarget } from '@/components/EditARModal';
import { ActivateDraftModal, type ActivateDraftTarget } from '@/components/ActivateDraftModal';
import { BulkMarkARPaidModal, type BulkMarkPaidTarget } from '@/components/BulkMarkARPaidModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { localizeDemoText } from '@/lib/demoText';
import { StudentPackagesQuickModal } from '@/components/StudentPackagesQuickModal';
import { AddRevenueEntryModal } from '@/components/AddRevenueEntryModal';
import { deletePackageCascade } from '@/lib/deletePackage';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DateFilter = 'mtd' | 'last30' | 'last90' | 'all';
type ChartView = 'daily' | 'weekly' | 'monthly' | 'by-student';
type TxFilter = 'all' | 'succeeded' | 'failed' | 'refunded';
type TxTypeFilter = 'all' | 'individual_lesson' | 'lesson_package' | 'subscription' | 'video_analysis' | 'one_time';
type GolfFilter = 'all' | 'golf' | 'non_golf' | 'unknown' | 'needs_review';

// Keywords used for auto-classification
import { autoClassifyTransaction, computeRevenueFrom } from '@/lib/revenueCalc';
import { RevenueProjectionChart } from '@/components/revenue/RevenueProjectionChart';
import { downloadRevenuePdfReport } from '@/lib/revenuePdfBridge';


export default function AdminRevenue() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState<DateFilter>('last30');
  const [chartView, setChartView] = useState<ChartView>('daily');
  const [txStatusFilter, setTxStatusFilter] = useState<TxFilter>('all');
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>('all');
  const [txSearch, setTxSearch] = useState('');
  const [txMatchFilter, setTxMatchFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [golfFilter, setGolfFilter] = useState<GolfFilter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingAR, setDeletingAR] = useState<{ kind: 'lesson' | 'package'; id: string; label: string; amount: number } | null>(null);
  const [isDeletingAR, setIsDeletingAR] = useState(false);
  // Multi-select state for the 3 deletable tables
  const [selectedARLessons, setSelectedARLessons] = useState<Set<string>>(new Set());
  const [selectedARPackages, setSelectedARPackages] = useState<Set<string>>(new Set());
  const [selectedTx, setSelectedTx] = useState<Set<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState<{ kind: 'tx' | 'ar-lesson' | 'ar-package'; count: number } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkMarkPaid, setBulkMarkPaid] = useState<BulkMarkPaidTarget | null>(null);
  const { language, t } = useLanguage();
  const es = language === 'es';
  // Stripe card drill-down: when set, forces filter to the selected segment
  const [drillDown, setDrillDown] = useState<'stripe' | 'matched' | 'unmatched' | null>(null);
  const [breakdownScope, setBreakdownScope] = useState<BreakdownScope | null>(null);
  const [trendBucket, setTrendBucket] = useState<TrendBucket | null>(null);
  const [addToARopen, setAddToARopen] = useState(false);
  const [addIncomeOpen, setAddIncomeOpen] = useState(false);
  const [secondaryKpi, setSecondaryKpi] = useState<'none' | 'last30' | 'last90' | 'ytd'>('none');
  // Revenue-by-Student panel: search + per-row package modal
  const [studentSearch, setStudentSearch] = useState('');
  const [packagesModalStudent, setPackagesModalStudent] = useState<{ id: string; name: string } | null>(null);
  const [resolvingDupStudent, setResolvingDupStudent] = useState<string | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<MarkPaidTarget | null>(null);
  const [editARTarget, setEditARTarget] = useState<EditARTarget | null>(null);
  const [activateDraftTarget, setActivateDraftTarget] = useState<ActivateDraftTarget | null>(null);

  const getDateRange = () => {
    const today = new Date();
    switch (dateFilter) {
      case 'mtd': return { start: startOfMonth(today), end: today };
      case 'last30': return { start: subDays(today, 30), end: today };
      case 'last90': return { start: subDays(today, 90), end: today };
      case 'all': return { start: new Date('2000-01-01'), end: today };
      default: return { start: subDays(today, 30), end: today };
    }
  };

  const dateRange = getDateRange();

  const { data: stripePayments = [], isLoading: loadingTx, refetch: refetchTx, dataUpdatedAt: stripeUpdatedAt } = useQuery({
    queryKey: ['revenue-stripe-payments', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoStripePayments as any[];
      const { data, error } = await supabase
        .from('stripe_payments')
        .select('*')
        .order('paid_at', { ascending: false })
        .limit(2000);
      if (error) { console.error('Error fetching stripe payments:', error); return []; }
      return data || [];
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 30_000,
  });

  const { data: lessons = [], isLoading, dataUpdatedAt: lessonsUpdatedAt } = useQuery({
    queryKey: ['revenue-lessons', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return buildDemoLessons();
      const { data, error } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_type, revenue, status, student_id, package_id, imported, payment_method, ar_status, profiles!lessons_student_id_fkey(id, full_name, email)')
        .or('status.eq.completed,revenue.gt.0,ar_status.eq.draft')
        .order('lesson_date', { ascending: false });
      if (error) { console.error('Error fetching lessons:', error); return []; }
      return data || [];
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 30_000,
  });

  const { data: packagePayments = [], dataUpdatedAt: pkgPayUpdatedAt } = useQuery({
    queryKey: ['revenue-package-payments', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoPackagePayments as any[];
      const { data, error } = await supabase
        .from('package_payments')
        .select('id, amount, payment_date, package_id, payment_method, notes, created_at');
      if (error) return [];
      return data || [];
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 30_000,
  });

  // Manual lesson payments (table: payments) — these are recorded by the
  // coach for individual lessons paid in cash/transfer, separate from Stripe.
  const { data: manualLessonPayments = [], dataUpdatedAt: manualPayUpdatedAt } = useQuery({
    queryKey: ['revenue-manual-payments', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoManualLessonPayments as any[];
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, concept, notes, student_id, created_at');
      if (error) return [];
      return data || [];
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 30_000,
  });

  const { data: classPackages = [], dataUpdatedAt: pkgUpdatedAt } = useQuery({
    queryKey: ['revenue-class-packages', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoClassPackages as any[];
      const { data } = await supabase
        .from('class_packages')
        .select('id, user_id, package_name, package_size, classes_remaining, classes_used, price, amount_paid, payment_status, payment_date, is_active, created_at, imported, ar_status');
      // duplicate_status may not be in generated types yet — fetch via raw select
      const { data: d2 } = await supabase
        .from('class_packages')
        .select('id, duplicate_status') as any;
      const statusMap = new Map<string, string>();
      (d2 || []).forEach((r: any) => { if (r.duplicate_status) statusMap.set(r.id, r.duplicate_status); });
      return (data || []).map((p: any) => ({ ...p, duplicate_status: statusMap.get(p.id) || null }));
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 30_000,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['revenue-profiles', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoProfiles as any[];
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      return data || [];
    },
  });

  // Latest update across the revenue queries (used for "Updated X ago" badge)
  const lastUpdatedAt = Math.max(stripeUpdatedAt || 0, lessonsUpdatedAt || 0, pkgPayUpdatedAt || 0, pkgUpdatedAt || 0, manualPayUpdatedAt || 0);

  // Realtime: invalidate queries whenever packages, payments, lessons or stripe rows change anywhere
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['revenue-stripe-payments'] });
        queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
        queryClient.invalidateQueries({ queryKey: ['revenue-package-payments'] });
        queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
        queryClient.invalidateQueries({ queryKey: ['revenue-manual-payments'] });
      }, 500);
    };

    const channel = supabase
      .channel('revenue-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_packages' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_payments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stripe_payments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const refetchAllRevenue = () => {
    queryClient.invalidateQueries({ queryKey: ['revenue-stripe-payments'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-package-payments'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-manual-payments'] });
    toast.success(t('money.revenueRefreshed'));
  };

  const pkgToUser = useMemo(() => {
    const m = new Map<string, string>();
    classPackages.forEach((cp: any) => m.set(cp.id, cp.user_id));
    return m;
  }, [classPackages]);

  const profileMap = useMemo(() => {
    const m = new Map<string, { id: string; full_name: string; email: string }>();
    allProfiles.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [allProfiles]);

  const hasMissingRevenue = lessons.some((l: any) => l.revenue === null || l.revenue === undefined);

  // Enrich stripe payments with auto-classification where not admin-overridden
  const enrichedStripePayments = useMemo(() => {
    return stripePayments.map((tx: any) => {
      if (tx.admin_override) return tx;
      const auto = autoClassifyTransaction(tx);
      return {
        ...tx,
        classification: tx.classification === 'unknown' ? auto.classification : tx.classification,
        classification_confidence: tx.classification_confidence === 'low' ? auto.confidence : tx.classification_confidence,
        is_golf_revenue: auto.classification === 'golf' || tx.is_golf_revenue,
      };
    });
  }, [stripePayments]);

  // Build "virtual" transactions from manually-recorded package payments
  // and individual lesson payments so they appear in the Transactions ledger
  // alongside Stripe rows. Marked with `source: 'manual_*'` so the UI can
  // hide Stripe-only actions for these rows.
  const manualTransactions = useMemo(() => {
    const pkgById = new Map<string, any>();
    classPackages.forEach((cp: any) => pkgById.set(cp.id, cp));

    const fromPackagePayments = (packagePayments || []).map((pp: any) => {
      const pkg = pkgById.get(pp.package_id);
      const studentId = pkg?.user_id || null;
      const prof = studentId ? profileMap.get(studentId) : null;
      const productName = pkg
        ? (pkg.package_name || `${pkg.package_size}-Lesson Package`)
        : t('money.manualPackagePayment');
      return {
        id: `pkgpay_${pp.id}`,
        source: 'manual_package',
        amount: Number(pp.amount) || 0,
        currency: 'mxn',
        status: 'succeeded',
        paid_at: pp.payment_date ? new Date(pp.payment_date).toISOString() : pp.created_at,
        created_at: pp.created_at,
        student_id: studentId,
        student_name: prof?.full_name || null,
        student_email: prof?.email || null,
        student_matched: !!studentId,
        product_name: productName,
        purchase_type: 'lesson_package',
        classification: 'golf',
        classification_confidence: 'high',
        is_golf_revenue: true,
        admin_override: true,
        is_archived: false,
        refund_amount: 0,
        stripe_payment_intent_id: null,
        payment_method: pp.payment_method || t('money.cash'),
        notes: pp.notes || null,
      };
    });

    const fromManualLessonPayments = (manualLessonPayments || []).map((lp: any) => {
      const studentId = lp.student_id || null;
      const prof = studentId ? profileMap.get(studentId) : null;
      return {
        id: `pay_${lp.id}`,
        source: 'manual_lesson',
        amount: Number(lp.amount) || 0,
        currency: 'mxn',
        status: 'succeeded',
        paid_at: lp.payment_date ? new Date(lp.payment_date).toISOString() : lp.created_at,
        created_at: lp.created_at,
        student_id: studentId,
        student_name: prof?.full_name || null,
        student_email: prof?.email || null,
        student_matched: !!studentId,
        product_name: localizeDemoText(t, lp.concept) || t('money.individualLesson'),
        purchase_type: 'individual_lesson',
        classification: 'golf',
        classification_confidence: 'high',
        is_golf_revenue: true,
        admin_override: true,
        is_archived: false,
        refund_amount: 0,
        stripe_payment_intent_id: null,
        payment_method: lp.payment_method || t('money.cash'),
        notes: lp.notes || null,
      };
    });

    return [...fromPackagePayments, ...fromManualLessonPayments];
  }, [packagePayments, manualLessonPayments, classPackages, profileMap]);

  // All ledger transactions = Stripe + manual virtual rows
  const allLedgerTransactions = useMemo(
    () => [...enrichedStripePayments, ...manualTransactions],
    [enrichedStripePayments, manualTransactions]
  );

  const filteredLessons = useMemo(() => {
    return lessons.filter((lesson: any) => {
      if (!lesson.lesson_date) return false;
      const lessonDate = parseISO(lesson.lesson_date);
      return lessonDate >= dateRange.start && lessonDate <= dateRange.end;
    });
  }, [lessons, dateRange.start, dateRange.end]);

  const filteredPayments = useMemo(() => {
    return packagePayments.filter((p: any) => {
      if (!p.payment_date) return false;
      const payDate = parseISO(p.payment_date);
      return payDate >= dateRange.start && payDate <= dateRange.end;
    });
  }, [packagePayments, dateRange.start, dateRange.end]);

  const filteredStripeTx = useMemo(() => {
    return enrichedStripePayments.filter((tx: any) => {
      const txDate = tx.paid_at ? new Date(tx.paid_at) : new Date(tx.created_at);
      return txDate >= dateRange.start && txDate <= dateRange.end;
    });
  }, [enrichedStripePayments, dateRange.start, dateRange.end]);

  // KPIs
  const kpis = useMemo(() => {
    if (isDemoModeActive()) {
      // Hardcoded numbers per Demo Mode spec — bypass the live calculation
      // entirely so the dashboard reflects illustrative figures.
      return {
        mtd: DEMO_REVENUE_SUMMARY.mtd,
        last30: DEMO_REVENUE_SUMMARY.last30,
        last90: DEMO_REVENUE_SUMMARY.last90,
        allTime: DEMO_REVENUE_SUMMARY.ytd,
        stripeTotal: DEMO_REVENUE_SUMMARY.mtd,
        golfTotal: DEMO_REVENUE_SUMMARY.mtd,
        txCount: (demoStripePayments || []).length,
        matchedCount: (demoStripePayments || []).filter((sp: any) => sp.student_matched).length,
        unmatchedCount: (demoStripePayments || []).filter((sp: any) => !sp.student_matched).length,
        golfCount: (demoStripePayments || []).length,
        nonGolfCount: 0,
        needsReview: 0,
      };
    }
    const today = new Date();
    const mtdStart = startOfMonth(today);
    const last30Start = subDays(today, 30);
    const last90Start = subDays(today, 90);

    const succeededStripe = enrichedStripePayments.filter((sp: any) => sp.status === 'succeeded' && !sp.is_archived);
    const golfStripe = succeededStripe.filter((sp: any) => sp.is_golf_revenue);

    const compute = (start: Date) =>
      computeRevenueFrom(start, { lessons, packagePayments, stripePayments, manualPayments: manualLessonPayments });


    const nonArchivedTx = enrichedStripePayments.filter((sp: any) => !sp.is_archived);

    return {
      mtd: compute(mtdStart),
      last30: compute(last30Start),
      last90: compute(last90Start),
      allTime: compute(new Date(today.getFullYear(), 0, 1)),
      stripeTotal: succeededStripe.reduce((s: number, sp: any) => s + (Number(sp.amount) || 0) - (Number(sp.refund_amount) || 0), 0),
      golfTotal: golfStripe.reduce((s: number, sp: any) => s + (Number(sp.amount) || 0) - (Number(sp.refund_amount) || 0), 0),
      txCount: nonArchivedTx.length,
      matchedCount: nonArchivedTx.filter((sp: any) => sp.student_matched).length,
      unmatchedCount: nonArchivedTx.filter((sp: any) => !sp.student_matched).length,
      golfCount: nonArchivedTx.filter((sp: any) => sp.classification === 'golf' || (sp.is_golf_revenue && sp.classification !== 'non_golf')).length,
      nonGolfCount: nonArchivedTx.filter((sp: any) => sp.classification === 'non_golf').length,
      needsReview: nonArchivedTx.filter((sp: any) => sp.classification === 'unknown' && !sp.admin_override).length,
    };
  }, [lessons, packagePayments, enrichedStripePayments, stripePayments, manualLessonPayments]);

  // ============= RECEIVABLES (Por Cobrar) =============
  // 1) Individual lessons completed without revenue (no package linked + revenue 0)
  // 2) Packages with outstanding balance (amount_paid < price)
  // 3) Packages with payment_status = 'pending' (full price still due)
  const receivables = useMemo(() => {
    if (isDemoModeActive()) {
      // Build AR rows from demo packages so the table still renders, but
      // anchor the totals to the spec numbers.
      const arPkgs = demoClassPackages
        .filter((cp: any) => Number(cp.price) > 0 && Number(cp.amount_paid) < Number(cp.price))
        .map((cp: any) => ({
          ...cp,
          balance: (Number(cp.price) || 0) - (Number(cp.amount_paid) || 0),
          profile: demoProfiles.find((p) => p.id === cp.user_id),
          kind: 'partial' as const,
          is_draft: cp.ar_status === 'draft',
        }));
      return {
        unpaidLessons: [],
        lessonsCount: 0,
        lessonsTotal: 0,
        packages: arPkgs,
        packagesCount: arPkgs.length,
        packagesTotal: DEMO_PACKAGE_SUMMARY.totalAR,
        grandTotal: DEMO_PACKAGE_SUMMARY.totalAR,
      };
    }
    // Individual lessons that count as receivables:
    // - NOT cancelled
    // - NOT tied to a package (package_id NULL)
    // - NOT imported from CSV (i.e. has been linked into AR)
    // - No payment recorded yet (payment_method NULL)
    // Note: we intentionally include scheduled lessons too — the "Add to AR"
    // modal surfaces them, and once linked they must appear here regardless
    // of completion status.
    const unpaidLessons = lessons.filter((l: any) => {
      return l.status !== 'cancelled'
        && !l.package_id
        && !l.imported
        && !l.payment_method;
    });

    const lessonsTotal = unpaidLessons.reduce((s: number, l: any) => s + (Number(l.revenue) || 0), 0);

    // Packages with partial balance (exclude imported)
    const packagesPartial = classPackages.filter((cp: any) => {
      if (cp.imported) return false;
      const price = Number(cp.price) || 0;
      const paid = Number(cp.amount_paid) || 0;
      return price > 0 && paid > 0 && paid < price;
    }).map((cp: any) => ({
      ...cp,
      balance: (Number(cp.price) || 0) - (Number(cp.amount_paid) || 0),
      profile: profileMap.get(cp.user_id),
      kind: 'partial' as const,
    }));

    // Packages fully pending (no payment yet) — exclude imported
    const packagesPending = classPackages.filter((cp: any) => {
      if (cp.imported) return false;
      const price = Number(cp.price) || 0;
      const paid = Number(cp.amount_paid) || 0;
      // AR truth = dollars owed, not the status string. Anything with price>0 and paid=0 is owed.
      // Also include active_pending packages regardless of is_active so they remain visible.
      return (price > 0 && paid === 0) || cp.ar_status === 'active_pending';
    }).map((cp: any) => ({
      ...cp,
      balance: Number(cp.price) || 0,
      profile: profileMap.get(cp.user_id),
      kind: 'pending' as const,
    }));

    const allPackages = [...packagesPartial, ...packagesPending].sort((a, b) => b.balance - a.balance);
    const packagesTotal = allPackages.reduce((s, p) => s + p.balance, 0);

    if (typeof window !== 'undefined') {
      console.debug('[AR] receivables', {
        lessonsFetched: lessons.length,
        packagesFetched: classPackages.length,
        unpaidLessons: unpaidLessons.length,
        lessonsTotal,
        packagesCount: allPackages.length,
        packagesTotal,
        grandTotal: lessonsTotal + packagesTotal,
      });
    }

    return {
      unpaidLessons: unpaidLessons.map((l: any) => ({
        ...l,
        amount: Number(l.revenue) || 0,
        is_draft: l.ar_status === 'draft',
      })),
      lessonsCount: unpaidLessons.length,
      lessonsTotal,
      packages: allPackages.map((p: any) => ({ ...p, is_draft: p.ar_status === 'draft' })),
      packagesCount: allPackages.length,
      packagesTotal,
      grandTotal: lessonsTotal + packagesTotal,
    };
  }, [lessons, classPackages, profileMap]);
  // ====================================================

  // Revenue by student
  const revenueByStudent = useMemo(() => {
    const studentMap = new Map<string, { id: string; name: string; email: string; revenue: number; lessonCount: number }>();
    
    lessons.forEach((lesson: any) => {
      const studentId = lesson.student_id || 'unknown';
      const profile = lesson.profiles;
      const existing = studentMap.get(studentId) || { id: studentId, name: profile?.full_name || 'Unknown', email: profile?.email || '', revenue: 0, lessonCount: 0 };
      existing.revenue += Number(lesson.revenue) || 0;
      existing.lessonCount += 1;
      studentMap.set(studentId, existing);
    });

    packagePayments.forEach((p: any) => {
      const studentId = pkgToUser.get(p.package_id) || 'unknown';
      const profile = profileMap.get(studentId);
      const existing = studentMap.get(studentId) || { id: studentId, name: profile?.full_name || 'Unknown', email: profile?.email || '', revenue: 0, lessonCount: 0 };
      existing.revenue += Number(p.amount) || 0;
      studentMap.set(studentId, existing);
    });

    enrichedStripePayments.forEach((tx: any) => {
      if (tx.student_id && tx.status === 'succeeded' && !['individual_lesson', 'package'].includes(tx.reporting_category) && tx.is_golf_revenue) {
        const existing = studentMap.get(tx.student_id) || { id: tx.student_id, name: tx.student_name || 'Unknown', email: tx.student_email || '', revenue: 0, lessonCount: 0 };
        existing.revenue += (Number(tx.amount) || 0) - (Number(tx.refund_amount) || 0);
        studentMap.set(tx.student_id, existing);
      }
    });

    return Array.from(studentMap.values()).sort((a, b) => b.revenue - a.revenue);
  }, [lessons, packagePayments, enrichedStripePayments, pkgToUser, profileMap]);

  // Chart data
  const dailyTrendData = useMemo(() => {
    const dayMap = new Map<string, number>();
    filteredLessons.forEach((l: any) => { dayMap.set(l.lesson_date, (dayMap.get(l.lesson_date) || 0) + (Number(l.revenue) || 0)); });
    filteredPayments.forEach((p: any) => { if (p.payment_date) dayMap.set(p.payment_date, (dayMap.get(p.payment_date) || 0) + (Number(p.amount) || 0)); });
    filteredStripeTx.forEach((tx: any) => {
      if (tx.status === 'succeeded' && !['individual_lesson', 'package'].includes(tx.reporting_category) && tx.is_golf_revenue) {
        const d = tx.paid_at ? format(new Date(tx.paid_at), 'yyyy-MM-dd') : format(new Date(tx.created_at), 'yyyy-MM-dd');
        dayMap.set(d, (dayMap.get(d) || 0) + (Number(tx.amount) || 0) - (Number(tx.refund_amount) || 0));
      }
    });
    return Array.from(dayMap.entries()).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLessons, filteredPayments, filteredStripeTx]);

  const weeklyTrendData = useMemo(() => {
    const weekMap = new Map<string, number>();
    const addToWeek = (dateStr: string, amount: number) => {
      const d = parseISO(dateStr);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      weekMap.set(format(ws, 'yyyy-MM-dd'), (weekMap.get(format(ws, 'yyyy-MM-dd')) || 0) + amount);
    };
    filteredLessons.forEach((l: any) => addToWeek(l.lesson_date, Number(l.revenue) || 0));
    filteredPayments.forEach((p: any) => { if (p.payment_date) addToWeek(p.payment_date, Number(p.amount) || 0); });
    return Array.from(weekMap.entries()).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLessons, filteredPayments]);

  const [monthlyYear, setMonthlyYear] = useState<number>(new Date().getFullYear());
  const monthlyTrendData = useMemo(() => {
    const mm = new Map<string, number>();
    const add = (ds: string, a: number) => {
      if (!ds) return;
      const d = parseISO(String(ds).slice(0, 10));
      if (isNaN(d.getTime())) return;
      const k = format(d, 'yyyy-MM');
      mm.set(k, (mm.get(k) || 0) + a);
    };
    lessons.forEach((l: any) => add(l.lesson_date, Number(l.revenue) || 0));
    packagePayments.forEach((p: any) => { if (p.payment_date) add(p.payment_date, Number(p.amount) || 0); });
    return Array.from({ length: 12 }, (_, i) => {
      const k = `${monthlyYear}-${String(i + 1).padStart(2, '0')}`;
      return { date: k, revenue: mm.get(k) || 0 };
    });
  }, [lessons, packagePayments, monthlyYear]);
  const monthlyYearOptions = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()]);
    const addY = (ds: any, amt: number) => { const y = Number(String(ds || '').slice(0, 4)); if (y > 2000 && amt > 0) ys.add(y); };
    lessons.forEach((l: any) => addY(l.lesson_date, Number(l.revenue) || 0));
    packagePayments.forEach((p: any) => addY(p.payment_date, Number(p.amount) || 0));
    return Array.from(ys).sort((a, b) => b - a);
  }, [lessons, packagePayments]);

  const studentChartData = useMemo(() => revenueByStudent.slice(0, 10).map(s => ({ name: s.name.split(' ')[0] || 'Unknown', revenue: s.revenue })), [revenueByStudent]);

  // Students with duplicate-looking packages: same user_id + size + price within 14 days
  const studentsWithDuplicates = useMemo(() => {
    const byUser = new Map<string, any[]>();
    classPackages.forEach((p: any) => {
      if (!p.user_id) return;
      const arr = byUser.get(p.user_id) || [];
      arr.push(p);
      byUser.set(p.user_id, arr);
    });
    const dupSet = new Set<string>();
    byUser.forEach((arr, userId) => {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[i].package_size !== arr[j].package_size) continue;
          if (Number(arr[i].price) !== Number(arr[j].price)) continue;
          const da = new Date(arr[i].created_at).getTime();
          const db = new Date(arr[j].created_at).getTime();
          if (Math.abs(da - db) <= 14 * 24 * 60 * 60 * 1000) {
            // Only flag if neither package has been dismissed
            const statusA = arr[i].duplicate_status;
            const statusB = arr[j].duplicate_status;
            if (statusA !== 'dismissed' && statusB !== 'dismissed') {
              dupSet.add(userId);
              return;
            }
          }
        }
      }
    });
    return dupSet;
  }, [classPackages]);

  // Resolve duplicate status for all packages of a given student
  const handleResolveDuplicate = async (studentId: string, status: 'confirmed' | 'dismissed') => {
    setResolvingDupStudent(studentId);
    try {
      // Find packages for this student that are part of the duplicate cluster
      const studentPkgs = classPackages.filter((p: any) => p.user_id === studentId);
      const ids = studentPkgs.map((p: any) => p.id);
      const { error } = await supabase
        .from('class_packages')
        .update({ duplicate_status: status, duplicate_reviewed_at: new Date().toISOString() } as any)
        .in('id', ids);
      if (error) throw error;
      toast.success(status === 'dismissed' ? t('money.markedNotDuplicates') : t('money.confirmedDuplicates'));
      queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
    } catch (err: any) {
      toast.error(err.message || t('money.failedUpdate'));
    } finally {
      setResolvingDupStudent(null);
    }
  };

  const filteredRevenueByStudent = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return revenueByStudent;
    return revenueByStudent.filter((s) =>
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [revenueByStudent, studentSearch]);

  const getChartData = () => {
    switch (chartView) {
      case 'weekly': return weeklyTrendData;
      case 'monthly': return monthlyTrendData;
      case 'by-student': return studentChartData;
      default: return dailyTrendData;
    }
  };
  const chartData = getChartData();

  const totalFilteredRevenue = filteredLessons.reduce((s: number, l: any) => s + (Number(l.revenue) || 0), 0) 
    + filteredPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  // Single "PDF report" button: hands the page's own data (KPIs, Revenue
  // Trend, Accounts Receivable) to the projection chart's PDF builder.
  const buildPdfExtras = () => {
    const es = language === 'es';
    const periodLabels: Record<DateFilter, [string, string]> = {
      mtd: ['Mes en curso', 'Month to date'],
      last30: ['Últimos 30 días', 'Last 30 days'],
      last90: ['Últimos 90 días', 'Last 90 days'],
      all: ['Todo el historial', 'All time'],
    };
    return {
      kpis: { mtd: kpis.mtd, last30: kpis.last30, last90: kpis.last90, ytd: kpis.allTime },
      trend: {
        periodLabel: periodLabels[dateFilter]?.[es ? 0 : 1] ?? '',
        periodTotal: totalFilteredRevenue,
        monthlyYear,
        monthly: monthlyTrendData.map((m) => ({ month: m.date, revenue: m.revenue })),
        weekly: weeklyTrendData,
        daily: dailyTrendData,
        topStudents: revenueByStudent.filter((r) => r.revenue > 0).map((r) => ({ name: r.id === 'unknown' ? (es ? 'Sin alumno asignado' : 'No student linked') : r.name, revenue: r.revenue, lessons: r.lessonCount })),
      },
      receivables: {
        total: receivables.grandTotal,
        lessonsTotal: receivables.lessonsTotal,
        packagesTotal: receivables.packagesTotal,
        lessons: receivables.unpaidLessons.map((l: any) => ({
          name: l.profiles?.full_name || 'Unknown',
          date: String(l.lesson_date || ''),
          type: l.lesson_type || (es ? 'Clase' : 'Lesson'),
          amount: Number(l.amount) || 0,
        })),
        packages: receivables.packages.map((p: any) => ({
          name: p.profile?.full_name || 'Unknown',
          pkgName: p.package_name || `${p.package_size} ${es ? 'clases' : 'lessons'}`,
          kind: p.kind,
          price: Number(p.price) || 0,
          paid: Number(p.amount_paid) || 0,
          balance: Number(p.balance) || 0,
        })),
      },
    };
  };
  const pdfExtrasRef = useRef(buildPdfExtras);
  pdfExtrasRef.current = buildPdfExtras;
  const handleDownloadPdf = () => downloadRevenuePdfReport(() => pdfExtrasRef.current());

  // Transaction ledger filtering
  const filteredTransactions = useMemo(() => {
    return allLedgerTransactions.filter((tx: any) => {
      // Archived filter
      if (!showArchived && tx.is_archived) return false;
      if (showArchived && !tx.is_archived) return false;
      // Date range
      const txDate = tx.paid_at ? new Date(tx.paid_at) : new Date(tx.created_at);
      if (txDate < dateRange.start || txDate > dateRange.end) return false;
      // Drill-down override
      if (drillDown === 'matched' && !tx.student_matched) return false;
      if (drillDown === 'unmatched' && tx.student_matched) return false;
      // Status
      if (txStatusFilter === 'succeeded' && tx.status !== 'succeeded') return false;
      if (txStatusFilter === 'failed' && tx.status !== 'failed') return false;
      if (txStatusFilter === 'refunded' && !['refunded', 'partially_refunded'].includes(tx.status)) return false;
      // Type
      if (txTypeFilter !== 'all' && tx.purchase_type !== txTypeFilter) return false;
      // Match (only when no drill-down active)
      if (!drillDown) {
        if (txMatchFilter === 'matched' && !tx.student_matched) return false;
        if (txMatchFilter === 'unmatched' && tx.student_matched) return false;
      }
      // Golf filter
      if (golfFilter === 'golf' && tx.classification !== 'golf') return false;
      if (golfFilter === 'non_golf' && tx.classification !== 'non_golf') return false;
      if (golfFilter === 'unknown' && tx.classification !== 'unknown') return false;
      if (golfFilter === 'needs_review' && (tx.classification !== 'unknown' || tx.admin_override)) return false;
      // Search
      if (txSearch) {
        const q = txSearch.toLowerCase();
        return (tx.student_name || '').toLowerCase().includes(q) ||
               (tx.student_email || '').toLowerCase().includes(q) ||
               (tx.product_name || '').toLowerCase().includes(q) ||
               (tx.stripe_payment_intent_id || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allLedgerTransactions, dateRange, txStatusFilter, txTypeFilter, txMatchFilter, txSearch, golfFilter, showArchived, drillDown]);

  function handleStripeDrillDown(type: 'stripe' | 'matched' | 'unmatched') {
    if (drillDown === type) {
      setDrillDown(null); // toggle off
    } else {
      setDrillDown(type);
    }
    // Scroll to transactions
    setTimeout(() => {
      document.getElementById('transactions-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  // Quick classify helper
  async function quickClassify(txId: string, classification: string) {
    const isGolf = classification === 'golf';
    const { error } = await supabase.from('stripe_payments').update({
      classification,
      is_golf_revenue: isGolf,
      admin_override: true,
      classification_confidence: 'high',
    }).eq('id', txId);
    if (error) { toast.error(t('money.failedClassify')); return; }
    toast.success(`Classified as ${classification === 'golf' ? '⛳ Golf' : '🚫 Non-Golf'}`);
    refetchTx();
  }

  async function handleDeleteTransaction() {
    if (!deletingTx) return;
    setIsDeleting(true);
    let error: any = null;
    if (deletingTx.source === 'manual_package') {
      const realId = String(deletingTx.id).replace(/^pkgpay_/, '');
      ({ error } = await supabase.from('package_payments').delete().eq('id', realId));
    } else if (deletingTx.source === 'manual_lesson') {
      const realId = String(deletingTx.id).replace(/^pay_/, '');
      ({ error } = await supabase.from('payments').delete().eq('id', realId));
    } else {
      ({ error } = await supabase.from('stripe_payments').delete().eq('id', deletingTx.id));
    }
    setIsDeleting(false);
    if (error) {
      toast.error(t('money.failedDeleteTx'));
      return;
    }
    toast.success(t('money.txDeleted'));
    setDeletingTx(null);
    refetchAllRevenue();
  }

  async function handleDeleteARItem() {
    if (!deletingAR) return;
    setIsDeletingAR(true);
    try {
      if (deletingAR.kind === 'lesson') {
        const { error } = await supabase.from('lessons').delete().eq('id', deletingAR.id);
        if (error) throw error;
      } else {
        await deletePackageCascade(deletingAR.id);
      }
      toast.success(t('money.removedFromReceivables'));
      setDeletingAR(null);
      refetchAllRevenue();
    } catch (err: any) {
      toast.error(err?.message || t('money.failedDelete'));
    } finally {
      setIsDeletingAR(false);
    }
  }

  function toggleSet(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }

  async function deleteTxById(tx: any) {
    if (tx.source === 'manual_package') {
      const realId = String(tx.id).replace(/^pkgpay_/, '');
      return supabase.from('package_payments').delete().eq('id', realId);
    }
    if (tx.source === 'manual_lesson') {
      const realId = String(tx.id).replace(/^pay_/, '');
      return supabase.from('payments').delete().eq('id', realId);
    }
    return supabase.from('stripe_payments').delete().eq('id', tx.id);
  }

  async function handleBulkDelete() {
    if (!bulkDelete) return;
    setIsBulkDeleting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      if (bulkDelete.kind === 'ar-lesson') {
        const ids = Array.from(selectedARLessons);
        const { error } = await supabase.from('lessons').delete().in('id', ids);
        if (error) { failCount = ids.length; } else { okCount = ids.length; }
        setSelectedARLessons(new Set());
      } else if (bulkDelete.kind === 'ar-package') {
        for (const id of Array.from(selectedARPackages)) {
          try { await deletePackageCascade(id); okCount++; } catch { failCount++; }
        }
        setSelectedARPackages(new Set());
      } else if (bulkDelete.kind === 'tx') {
        const txMap = new Map<string, any>(filteredTransactions.map((t: any) => [t.id, t]));
        for (const id of Array.from(selectedTx)) {
          const tx = txMap.get(id);
          if (!tx) { failCount++; continue; }
          const { error } = await deleteTxById(tx);
          if (error) failCount++; else okCount++;
        }
        setSelectedTx(new Set());
      }
      if (okCount) toast.success(`Deleted ${okCount} item(s)`);
      if (failCount) toast.error(`${failCount} item(s) failed to delete`);
      setBulkDelete(null);
      refetchAllRevenue();
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'succeeded': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'refunded': case 'partially_refunded': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default: return <CreditCard className="h-4 w-4 text-muted-foreground" />;
    }
  }

  function getPurchaseTypeBadge(type: string) {
    switch (type) {
      case 'individual_lesson': return { label: t('money.typeLesson'), variant: 'default' as const };
      case 'lesson_package': return { label: t('money.typePackage'), variant: 'secondary' as const };
      case 'subscription': return { label: t('money.typeSubscription'), variant: 'outline' as const };
      case 'video_analysis': return { label: t('money.typeAnalysis'), variant: 'outline' as const };
      default: return { label: type || t('money.typeOther'), variant: 'outline' as const };
    }
  }

  function getClassificationBadge(tx: any) {
    if (tx.classification === 'golf') return <Badge className="bg-green-600/20 text-green-600 border-green-600/30 text-[10px]">⛳ Golf</Badge>;
    if (tx.classification === 'non_golf') return <Badge variant="secondary" className="text-[10px]">🚫 Non-Golf</Badge>;
    return <Badge variant="outline" className="text-[10px] border-orange-400/50 text-orange-500">❓ Review</Badge>;
  }

  return (
    <div className="app-bg min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link to="/admin">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 icon-container icon-container-warning shrink-0">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-heading font-bold text-foreground truncate">Revenue Dashboard</h1>
                <p className="text-xs text-muted-foreground truncate">Analytics & Transaction Ledger</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <GlobalSearch />
          <LanguageToggle variant="header" />
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadPdf}
            className="border-[#F0C040]/50 text-[#F0C040] hover:bg-[#F0C040]/10 font-semibold"
          >
            <FileDown className="h-4 w-4 mr-1.5" />
            {language === 'es' ? 'Reporte PDF' : 'PDF report'}
          </Button>
          <Button
            size="sm"
            onClick={() => setAddIncomeOpen(true)}
            className="bg-[#F0C040] hover:bg-[#F0C040]/90 text-[#0d1f18] font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('i18nExtras.addIncome')}
          </Button>
          <Select value={dateFilter} onValueChange={(v: DateFilter) => setDateFilter(v)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mtd">{t('money.thisMonth')}</SelectItem>
              <SelectItem value="last30">{t('i18nExtras.last30Days')}</SelectItem>
              <SelectItem value="last90">{t('i18nExtras.last90Days')}</SelectItem>
              <SelectItem value="all">{t('money.allTime')}</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {hasMissingRevenue && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3 text-warning">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">Some lessons have missing revenue data. Stripe transactions below are the verified source.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        {/* Hero MTD card — always shown, independent of date filter, live-updated */}
        <Card
          className="card-elevated cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/50 border-primary/30"
          onClick={() => setBreakdownScope('mtd')}
        >
          <CardContent className="py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 icon-container bg-primary/15 text-primary shrink-0">
                  <Calendar className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('i18nExtras.monthToDate')} · {format(new Date(), 'MMMM yyyy')}
                  </p>
                  <p className="text-4xl sm:text-5xl font-bold text-primary leading-none">{fmtMXN(kpis.mtd)}</p>
                  <p className="text-xs text-muted-foreground pt-1">
                    {lastUpdatedAt > 0 ? `${t('i18nExtras.updatedLessThanAMinute')}` : t('money.live')} · {t('i18nExtras.clickForBreakdown')}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); refetchAllRevenue(); }}
                className="shrink-0"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('i18nExtras.refresh')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Secondary KPI cards */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{t('i18nExtras.compareTo')}</span>
            <Select value={secondaryKpi} onValueChange={(v) => setSecondaryKpi(v as any)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('i18nExtras.hide')}</SelectItem>
                <SelectItem value="last30">{t('i18nExtras.last30Days')}</SelectItem>
                <SelectItem value="last90">{t('i18nExtras.last90Days')}</SelectItem>
                <SelectItem value="ytd">{new Date().getFullYear()} YTD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {secondaryKpi !== 'none' && (() => {
            const cfg = secondaryKpi === 'last30'
              ? { label: t('i18nExtras.last30Days'), value: kpis.last30, scope: 'last30' as const, tone: 'text-info', bg: 'bg-info/10', ring: 'hover:ring-info/50' }
              : secondaryKpi === 'last90'
              ? { label: t('i18nExtras.last90Days'), value: kpis.last90, scope: 'last90' as const, tone: 'text-accent', bg: 'bg-accent/10', ring: 'hover:ring-accent/50' }
              : { label: `${new Date().getFullYear()} YTD`, value: kpis.allTime, scope: 'all' as const, tone: 'text-warning', bg: 'bg-warning/10', ring: 'hover:ring-warning/50' };
            return (
              <Card className={`card-elevated cursor-pointer transition-all hover:ring-2 ${cfg.ring} flex-1`} onClick={() => setBreakdownScope(cfg.scope)}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 icon-container ${cfg.bg} ${cfg.tone}`}><TrendingUp className="h-4 w-4" /></div>
                      <div>
                        <p className="stat-label">{cfg.label}</p>
                        <p className={`text-xl font-bold ${cfg.tone}`}>{fmtMXN(cfg.value)}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t('i18nExtras.clickForBreakdown')}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Drill-down active indicator */}
        {(drillDown || golfFilter !== 'all') && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1.5">
              {drillDown === 'stripe' && '🔍 Showing: All Stripe Verified'}
              {drillDown === 'matched' && '🔍 Showing: Matched Only'}
              {drillDown === 'unmatched' && '🔍 Showing: Unmatched Only'}
              {!drillDown && golfFilter === 'golf' && '🔍 Showing: Golf Only'}
              {!drillDown && golfFilter === 'non_golf' && '🔍 Showing: Non-Golf Only'}
              {!drillDown && golfFilter === 'needs_review' && '🔍 Showing: Needs Review'}
              {!drillDown && golfFilter === 'unknown' && '🔍 Showing: Unknown Classification'}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDrillDown(null); setGolfFilter('all'); }}>
              Clear Filter
            </Button>
          </div>
        )}

        {/* ============= POR COBRAR (Receivables) ============= */}
        <Card className="card-elevated border-warning/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 icon-container bg-warning/15 text-warning">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Accounts Receivable</CardTitle>
                  <CardDescription>{t('money.outstandingBalances')}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('i18nExtras.totalReceivable')}</p>
                  <p className="text-2xl font-bold text-warning">{fmtMXN(receivables.grandTotal)}</p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setAddToARopen(true)}
                  className="gap-1"
                  title={t('money.addToAR')}
                >
                  <Plus className="h-4 w-4" />
                  <span>{t('i18nExtras.addToAR')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refetchAllRevenue}
                  title={t('money.refreshReceivables')}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-card p-4 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-info shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t('i18nExtras.individualLessonsWithoutPayment')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {receivables.lessonsCount} <span className="text-xs text-muted-foreground font-normal">clases</span>
                  </p>
                </div>
                <p className="text-base font-semibold text-warning shrink-0">{fmtMXN(receivables.lessonsTotal)}</p>
              </div>
              <div className="glass-card p-4 flex items-center gap-3">
                <PackageIcon className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t('i18nExtras.packagesWithPendingBalance')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {receivables.packagesCount} <span className="text-xs text-muted-foreground font-normal">paquetes</span>
                  </p>
                </div>
                <p className="text-base font-semibold text-warning shrink-0">{fmtMXN(receivables.packagesTotal)}</p>
              </div>
            </div>

            {/* Lessons detail */}
            {receivables.lessonsCount > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border/50 bg-muted/30 px-4 py-2 text-sm hover:bg-muted/50 transition-colors group">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-info" />
                    <span className="font-medium">Ver clases pendientes ({receivables.lessonsCount})</span>
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  {selectedARLessons.size > 0 && (
                    <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-md bg-muted/40 border border-border/50 flex-wrap">
                      <span className="text-xs font-medium">{selectedARLessons.size} {es ? (selectedARLessons.size === 1 ? 'seleccionada' : 'seleccionadas') : 'selected'}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedARLessons(new Set())}>{es ? 'Limpiar' : 'Clear'}</Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => {
                            const items = receivables.unpaidLessons
                              .filter((l: any) => selectedARLessons.has(l.id))
                              .map((l: any) => ({
                                id: l.id,
                                amount: Number(l.amount) || 0,
                                student_id: l.student_id ?? null,
                                payment_date: l.lesson_date,
                              }));
                            setBulkMarkPaid({ kind: 'lessons', items });
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> {es ? 'Marcar como pagadas' : 'Mark as paid'}
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkDelete({ kind: 'ar-lesson', count: selectedARLessons.size })}>
                          <Trash2 className="h-3.5 w-3.5" /> {es ? 'Eliminar' : 'Delete selected'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="max-h-[280px] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={receivables.unpaidLessons.length > 0 && selectedARLessons.size === receivables.unpaidLessons.length}
                              onCheckedChange={(c) => setSelectedARLessons(c ? new Set(receivables.unpaidLessons.map((l: any) => l.id)) : new Set())}
                            />
                          </TableHead>
                          <TableHead>{t('money.student')}</TableHead>
                          <TableHead>{t('money.type')}</TableHead>
                          <TableHead>{t('money.date')}</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivables.unpaidLessons.map((l: any) => (
                          <TableRow key={l.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedARLessons.has(l.id)}
                                onCheckedChange={() => setSelectedARLessons(s => toggleSet(s, l.id))}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{l.profiles?.full_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{l.profiles?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                <Calendar className="h-3 w-3 mr-1" />
                                Lesson
                              </Badge>
                              {l.is_draft && (
                                <Badge className="ml-1 text-[10px] bg-warning/15 text-warning border-warning/30">
                                  Pendiente
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {l.lesson_date ? format(parseISO(l.lesson_date), 'MMM d, yyyy') : <span className="text-muted-foreground italic">sin fecha</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-warning">{fmtMXNStr(l.amount)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                {l.is_draft ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                                    title={t('money.activate')}
                                    onClick={() => setActivateDraftTarget({
                                      kind: 'lesson',
                                      id: l.id,
                                      label: `${l.profiles?.full_name || t('money.typeLesson')} — ${t('money.pending')}`,
                                      amount: Number(l.amount) || 0,
                                      studentId: l.student_id,
                                    })}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10"
                                    title={t('money.markAsPaid')}
                                    onClick={() => setMarkPaidTarget({
                                      kind: 'lesson',
                                      id: l.id,
                                      label: `${l.profiles?.full_name || t('money.typeLesson')} — ${l.lesson_date ? format(parseISO(l.lesson_date), 'MMM d, yyyy') : t('money.noDate')}`,
                                      amount: Number(l.amount) || 0,
                                      studentId: l.student_id,
                                    })}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                )}
                                {l.student_id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    title={t('money.editCharge')}
                                    onClick={() => setEditARTarget({
                                      kind: 'lesson',
                                      id: l.id,
                                      label: `${l.profiles?.full_name || t('money.typeLesson')} — ${l.lesson_date ? format(parseISO(l.lesson_date), 'MMM d, yyyy') : t('money.noDate')}`,
                                      amount: Number(l.amount) || 0,
                                      currency: l.currency || 'MXN',
                                      studentId: l.student_id,
                                    })}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title={t('money.deleteLesson')}
                                  onClick={() => setDeletingAR({
                                    kind: 'lesson',
                                    id: l.id,
                                    label: `${l.profiles?.full_name || t('money.typeLesson')} — ${l.lesson_date ? format(parseISO(l.lesson_date), 'MMM d, yyyy') : t('money.noDate')}`,
                                    amount: Number(l.amount) || 0,
                                  })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Packages detail */}
            {receivables.packagesCount > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border/50 bg-muted/30 px-4 py-2 text-sm hover:bg-muted/50 transition-colors group">
                  <span className="flex items-center gap-2">
                    <PackageIcon className="h-4 w-4 text-primary" />
                    <span className="font-medium">Ver paquetes pendientes ({receivables.packagesCount})</span>
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  {selectedARPackages.size > 0 && (
                    <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-md bg-muted/40 border border-border/50 flex-wrap">
                      <span className="text-xs font-medium">{selectedARPackages.size} {es ? (selectedARPackages.size === 1 ? 'seleccionado' : 'seleccionados') : 'selected'}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedARPackages(new Set())}>{es ? 'Limpiar' : 'Clear'}</Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => {
                            const items = receivables.packages
                              .filter((p: any) => selectedARPackages.has(p.id))
                              .map((p: any) => ({
                                id: p.id,
                                balance: Number(p.balance) || 0,
                                amount_paid: Number(p.amount_paid) || 0,
                                price: Number(p.price) || 0,
                                payment_date:
                                  p.payment_date ||
                                  (typeof p.created_at === 'string' ? p.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
                              }));
                            setBulkMarkPaid({ kind: 'packages', items });
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> {es ? 'Marcar como pagados' : 'Mark as paid'}
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkDelete({ kind: 'ar-package', count: selectedARPackages.size })}>
                          <Trash2 className="h-3.5 w-3.5" /> {es ? 'Eliminar' : 'Delete selected'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={receivables.packages.length > 0 && selectedARPackages.size === receivables.packages.length}
                              onCheckedChange={(c) => setSelectedARPackages(c ? new Set(receivables.packages.map((p: any) => p.id)) : new Set())}
                            />
                          </TableHead>
                          <TableHead>{t('money.student')}</TableHead>
                          <TableHead>{t('money.package')}</TableHead>
                          <TableHead>{t('money.status')}</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">To be collected</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivables.packages.map((pkg: any) => (
                          <TableRow key={pkg.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedARPackages.has(pkg.id)}
                                onCheckedChange={() => setSelectedARPackages(s => toggleSet(s, pkg.id))}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{pkg.profile?.full_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{pkg.profile?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  <PackageIcon className="h-3 w-3 mr-1" />
                                  {pkg.package_name || `${pkg.package_size} clases`}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">Total: {fmtMXNStr(Number(pkg.price) || 0)}</p>
                            </TableCell>
                            <TableCell>
                              {pkg.kind === 'partial' ? (
                                <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 text-[10px]">Parcial</Badge>
                              ) : pkg.is_draft ? (
                                <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">Pendiente</Badge>
                              ) : pkg.ar_status === 'active_pending' ? (
                                <Badge className="bg-status-scheduled/15 text-status-scheduled border-status-scheduled/30 text-[10px]">Active · Pending Payment</Badge>
                              ) : (
                                <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{fmtMXNStr(Number(pkg.amount_paid) || 0)}</TableCell>
                            <TableCell className="text-right font-semibold text-warning">{fmtMXNStr(pkg.balance)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                {pkg.is_draft ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                                    title={t('money.activate')}
                                    onClick={() => setActivateDraftTarget({
                                      kind: 'package',
                                      id: pkg.id,
                                      label: `${pkg.profile?.full_name || t('money.typePackage')} — ${pkg.package_name || `${pkg.package_size} clases`}`,
                                      price: Number(pkg.price) || 0,
                                      studentId: pkg.user_id,
                                    })}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                ) : pkg.ar_status === 'active_pending' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-primary hover:text-success hover:bg-success/10"
                                    title={t('money.markAsPaid')}
                                    onClick={() => setMarkPaidTarget({
                                      kind: 'package',
                                      id: pkg.id,
                                      label: `${pkg.profile?.full_name || t('money.typePackage')} — ${pkg.package_name || `${pkg.package_size} clases`}`,
                                      balance: Number(pkg.balance) || 0,
                                      price: Number(pkg.price) || 0,
                                      amountPaid: Number(pkg.amount_paid) || 0,
                                      studentId: pkg.user_id,
                                    })}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10"
                                    title={t('money.markAsPaid')}
                                    onClick={() => setMarkPaidTarget({
                                      kind: 'package',
                                      id: pkg.id,
                                      label: `${pkg.profile?.full_name || t('money.typePackage')} — ${pkg.package_name || `${pkg.package_size} clases`}`,
                                      balance: Number(pkg.balance) || 0,
                                      price: Number(pkg.price) || 0,
                                      amountPaid: Number(pkg.amount_paid) || 0,
                                      studentId: pkg.user_id,
                                    })}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                )}
                                {pkg.user_id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    title={t('money.editCharge')}
                                    onClick={() => setEditARTarget({
                                      kind: 'package',
                                      id: pkg.id,
                                      label: `${pkg.profile?.full_name || t('money.typePackage')} — ${pkg.package_name || `${pkg.package_size} clases`}`,
                                      price: Number(pkg.price) || 0,
                                      amountPaid: Number(pkg.amount_paid) || 0,
                                      studentId: pkg.user_id,
                                    })}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title={t('money.deletePackage')}
                                  onClick={() => setDeletingAR({
                                    kind: 'package',
                                    id: pkg.id,
                                    label: `${pkg.profile?.full_name || t('money.typePackage')} — ${pkg.package_name || `${pkg.package_size} clases`}`,
                                    amount: Number(pkg.balance) || 0,
                                  })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {receivables.grandTotal === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                ✅ No lessons or packages pending collection
              </p>
            )}
          </CardContent>
        </Card>
        {/* ============= /POR COBRAR ============= */}

        {chartData.length > 0 && (
          <Card className="card-elevated">
            <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Revenue Trend
                </CardTitle>
                <CardDescription>
                  {chartView === 'daily' && t('money.dailyRevenue')}
                  {chartView === 'weekly' && t('money.weeklyRevenue')}
                  {chartView === 'monthly' && t('money.monthlyRevenue')}
                  {chartView === 'by-student' && t('money.revenueByStudent')}
                  {' '}• Total: {fmtMXN(totalFilteredRevenue)} · <span className="text-primary">Click any point for breakdown</span>
                </CardDescription>
              </div>
              <div className="flex gap-2 w-full sm:w-auto items-center">
              {chartView === 'monthly' && (
                <Select value={String(monthlyYear)} onValueChange={(v) => setMonthlyYear(Number(v))}>
                  <SelectTrigger className="w-[96px] shrink-0 text-foreground"><span className="text-sm font-medium">{monthlyYear}</span></SelectTrigger>
                  <SelectContent>
                    {monthlyYearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={chartView} onValueChange={(v: ChartView) => setChartView(v)}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('money.daily')}</SelectItem>
                  <SelectItem value="weekly">{t('money.weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('money.monthlyOpt')}</SelectItem>
                  <SelectItem value="by-student">{t('money.byStudent')}</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="h-[220px] sm:h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === 'by-student' ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} className="fill-muted-foreground" />
                      <YAxis tickFormatter={(v) => `$${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`} tick={{ fontSize: 10 }} width={48} className="fill-muted-foreground" />
                      <Tooltip cursor={{ fill: 'hsl(var(--primary) / 0.12)' }} formatter={(value: number) => [`$${fmtMXNStr(value)}`, t('money.revenue')]} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar
                        dataKey="revenue"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(payload: any) => {
                          const firstName = payload?.name as string | undefined;
                          if (!firstName) return;
                          const match = revenueByStudent.find(s => (s.name.split(' ')[0] || 'Unknown') === firstName);
                          if (!match) return;
                          setTrendBucket({
                            kind: 'by-student',
                            studentId: match.id,
                            studentName: match.name,
                            rangeStart: '2000-01-01',
                            rangeEnd: '2100-12-31',
                          });
                        }}
                      />
                    </BarChart>
                  ) : (
                    <LineChart
                      data={chartData}
                      onClick={(state: any) => {
                        const label = state?.activeLabel as string | undefined;
                        if (!label) return;
                        if (chartView === 'monthly') setTrendBucket({ kind: 'monthly', bucket: label });
                        else if (chartView === 'weekly') setTrendBucket({ kind: 'weekly', bucket: label });
                        else setTrendBucket({ kind: 'daily', bucket: label });
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tickFormatter={(v) => { try { if (chartView === 'monthly') return format(parseISO(String(v).slice(0, 7) + '-01'), 'MMM yyyy'); return format(parseISO(String(v)), 'MMM d'); } catch { return String(v); } }} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} className="fill-muted-foreground" />
                      <YAxis tickFormatter={(v) => `$${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`} tick={{ fontSize: 10 }} width={48} className="fill-muted-foreground" />
                      <Tooltip formatter={(value: number) => [`$${fmtMXNStr(value)}`, t('money.revenue')]} labelFormatter={(label) => { try { if (chartView === 'monthly') return format(parseISO(String(label).slice(0, 7) + '-01'), 'MMMM yyyy'); if (chartView === 'weekly') return `${t('money.weekOf')} ${format(parseISO(label as string), 'MMM d, yyyy')}`; return format(parseISO(label as string), 'MMM d, yyyy'); } catch { return String(label); } }} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4, cursor: 'pointer' }}
                        activeDot={{ r: 6, cursor: 'pointer' }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {!isDemoModeActive() && <RevenueProjectionChart />}

        {/* Revenue by Student */}
        <div className="grid grid-cols-1 gap-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-info" /> Revenue by Student</CardTitle>
              <CardDescription>
                {filteredRevenueByStudent.length} of {revenueByStudent.length} students • All time
              </CardDescription>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('money.searchStudentPh')}
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile card list */}
              <div className="md:hidden max-h-[400px] overflow-y-auto px-3 pb-3 space-y-2">
                {filteredRevenueByStudent.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">{studentSearch ? 'No matches' : 'No data'}</p>
                ) : (
                  filteredRevenueByStudent.map((student, idx) => (
                    <div key={student.id} className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {idx === 0 && <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Top</Badge>}
                            <p className="font-medium text-sm truncate">{student.name}</p>
                          </div>
                          {studentsWithDuplicates.has(student.id) && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                                <AlertTriangle className="h-3 w-3" />
                                Possible duplicates
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive"
                                disabled={resolvingDupStudent === student.id}
                                onClick={() => handleResolveDuplicate(student.id, 'confirmed')}
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Yes
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[10px] text-success hover:text-success"
                                disabled={resolvingDupStudent === student.id}
                                onClick={() => handleResolveDuplicate(student.id, 'dismissed')}
                              >
                                <XCircle className="h-3 w-3 mr-0.5" /> Not duplicates
                              </Button>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{student.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">{student.lessonCount} lessons</p>
                          <p className="font-semibold text-warning text-sm">{fmtMXNStr(student.revenue)} <span className="opacity-60 text-[10px]">MXN</span></p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 gap-1.5"
                          onClick={() => setPackagesModalStudent({ id: student.id, name: student.name })}
                        >
                          <PackageIcon className="h-3.5 w-3.5" />
                          Packages
                        </Button>
                        <Link to={`/admin/student/${student.id}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full h-9 gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Profile
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <ScrollArea className="h-[300px]">
                  <Table>
                  <TableHeader><TableRow><TableHead>{t('money.student')}</TableHead><TableHead className="text-right">Lessons</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="w-24 text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredRevenueByStudent.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{studentSearch ? 'No matches' : 'No data'}</TableCell></TableRow>
                    ) : (
                      filteredRevenueByStudent.map((student, idx) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {idx === 0 && <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">Top</Badge>}
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium">{student.name}</p>
                                  {studentsWithDuplicates.has(student.id) && (
                                    <>
                                      <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                                        <AlertTriangle className="h-3 w-3" />
                                        Possible duplicates
                                      </Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive"
                                        disabled={resolvingDupStudent === student.id}
                                        onClick={() => handleResolveDuplicate(student.id, 'confirmed')}
                                      >
                                        <CheckCircle className="h-3 w-3 mr-0.5" /> Yes
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 px-1.5 text-[10px] text-success hover:text-success"
                                        disabled={resolvingDupStudent === student.id}
                                        onClick={() => handleResolveDuplicate(student.id, 'dismissed')}
                                      >
                                        <XCircle className="h-3 w-3 mr-0.5" /> Not duplicates
                                      </Button>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-[150px]">{student.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{student.lessonCount}</TableCell>
                          <TableCell className="text-right font-semibold text-warning">{fmtMXNStr(student.revenue)} MXN</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title={t('money.viewPackages')}
                                onClick={() => setPackagesModalStudent({ id: student.id, name: student.name })}
                              >
                                <PackageIcon className="h-4 w-4" />
                              </Button>
                              <Link to={`/admin/student/${student.id}`}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Open profile"><ExternalLink className="h-4 w-4" /></Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <ScrollBar orientation="vertical" />
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* === TRANSACTIONS LEDGER === */}
        <Card className="card-elevated" id="transactions-section">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Transactions
                </CardTitle>
                <CardDescription>{t('money.txInPeriod').replace('{n}', String(filteredTransactions.length))} • {showArchived ? t('money.viewArchived') : t('money.viewActive')}</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)} className="gap-1.5 text-xs">
                  {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showArchived ? t('money.showActive') : t('money.showArchived')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => refetchTx()} className="gap-1.5">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
            </div>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mt-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name, email, product, or reference…" value={txSearch} onChange={e => setTxSearch(e.target.value)} className="pl-9 h-9 text-sm" />
              </div>
              <Select value={txStatusFilter} onValueChange={(v: TxFilter) => setTxStatusFilter(v)}>
                <SelectTrigger className="w-full sm:w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('money.allStatus')}</SelectItem>
                  <SelectItem value="succeeded">{t('money.statusSucceeded')}</SelectItem>
                  <SelectItem value="failed">{t('money.statusFailed')}</SelectItem>
                  <SelectItem value="refunded">{t('money.statusRefunded')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={txTypeFilter} onValueChange={(v: TxTypeFilter) => setTxTypeFilter(v)}>
                <SelectTrigger className="w-full sm:w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('money.allTypes')}</SelectItem>
                  <SelectItem value="individual_lesson">{t('money.typeLesson')}</SelectItem>
                  <SelectItem value="lesson_package">{t('money.typePackage')}</SelectItem>
                  <SelectItem value="subscription">{t('money.typeSubscription')}</SelectItem>
                  <SelectItem value="video_analysis">{t('money.typeAnalysis')}</SelectItem>
                  <SelectItem value="one_time">{t('money.typeOther')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={golfFilter} onValueChange={(v: GolfFilter) => { setGolfFilter(v); setDrillDown(null); }}>
                <SelectTrigger className="w-full sm:w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('money.allClass')}</SelectItem>
                  <SelectItem value="golf">⛳ Golf</SelectItem>
                  <SelectItem value="non_golf">🚫 Non-Golf</SelectItem>
                  <SelectItem value="unknown">❓ Unknown</SelectItem>
                  <SelectItem value="needs_review">⚠️ Needs Review</SelectItem>
                </SelectContent>
              </Select>
              {!drillDown && (
                <Select value={txMatchFilter} onValueChange={(v: any) => setTxMatchFilter(v)}>
                  <SelectTrigger className="w-full sm:w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="matched">{t('money.matched')}</SelectItem>
                    <SelectItem value="unmatched">{t('money.unmatched')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile transaction cards */}
            <div className="md:hidden max-h-[600px] overflow-y-auto px-3 py-2 space-y-2">
              {loadingTx ? (
                <p className="text-center text-muted-foreground py-8 text-sm">Loading transactions…</p>
              ) : filteredTransactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No transactions found</p>
              ) : (
                filteredTransactions.map((tx: any) => {
                  const ptBadge = getPurchaseTypeBadge(tx.purchase_type);
                  const txDate = tx.paid_at ? new Date(tx.paid_at) : new Date(tx.created_at);
                  const isManual = tx.source === 'manual_package' || tx.source === 'manual_lesson';
                  return (
                    <div key={tx.id} className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {getStatusIcon(tx.status)}
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{format(txDate, 'MMM d, yyyy')}</p>
                            <p className="text-[10px] text-muted-foreground">{format(txDate, 'h:mm a')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-sm">{fmtMXNStr(tx.amount)} <span className="opacity-60 text-[10px]">{(tx.currency || 'mxn').toUpperCase()}</span></p>
                          {tx.refund_amount > 0 && (
                            <p className="text-[10px] text-destructive">-{fmtMXNStr(tx.refund_amount)} refund</p>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {tx.student_id ? (
                          <Link to={`/admin/student/${tx.student_id}`} className="hover:underline">
                            <p className="text-sm font-medium truncate">{tx.student_name || 'Unknown'}</p>
                          </Link>
                        ) : (
                          <p className="text-sm font-medium truncate">{tx.student_name || tx.student_email || '—'}</p>
                        )}
                        {tx.student_email && <p className="text-[11px] text-muted-foreground truncate">{tx.student_email}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{localizeDemoText(t, tx.product_name) || '—'}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={ptBadge.variant} className="text-[10px]">{ptBadge.label}</Badge>
                        {getClassificationBadge(tx)}
                        <Badge variant={tx.status === 'succeeded' ? 'default' : 'destructive'} className="text-[10px]">{tx.status}</Badge>
                        {!tx.student_matched && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">Unmatched</span>
                        )}
                        {isManual && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Manual</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-border/50 flex-wrap">
                        {!isManual && tx.classification === 'unknown' && !tx.admin_override && (
                          <>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={() => quickClassify(tx.id, 'golf')}>⛳ Golf</Button>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={() => quickClassify(tx.id, 'non_golf')}>🚫 Non-Golf</Button>
                          </>
                        )}
                        {!isManual && (
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={() => setEditingTx(tx)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                        {tx.stripe_payment_intent_id && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { navigator.clipboard.writeText(tx.stripe_payment_intent_id); toast.success(t('money.stripeRefCopied')); }} title={t('money.copyStripeRef')}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => setDeletingTx(tx)}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop ledger table */}
            <div className="hidden md:block max-h-[600px] overflow-y-auto overflow-x-auto">
              {selectedTx.size > 0 && (
                <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30">
                  <span className="text-xs font-medium">{selectedTx.size} transaction(s) selected</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedTx(new Set())}>Clear</Button>
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkDelete({ kind: 'tx', count: selectedTx.size })}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete selected
                    </Button>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={filteredTransactions.length > 0 && selectedTx.size === filteredTransactions.length}
                        onCheckedChange={(c) => setSelectedTx(c ? new Set(filteredTransactions.map((t: any) => t.id)) : new Set())}
                      />
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{t('money.date')}</TableHead>
                    <TableHead>{t('money.student')}</TableHead>
                    <TableHead>{t('money.product')}</TableHead>
                    <TableHead>{t('money.type')}</TableHead>
                    <TableHead>{t('money.klass')}</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>{t('money.status')}</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTx ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading transactions…</TableCell></TableRow>
                  ) : filteredTransactions.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No transactions found</TableCell></TableRow>
                  ) : (
                    filteredTransactions.map((tx: any) => {
                      const ptBadge = getPurchaseTypeBadge(tx.purchase_type);
                      const txDate = tx.paid_at ? new Date(tx.paid_at) : new Date(tx.created_at);
                      const isManual = tx.source === 'manual_package' || tx.source === 'manual_lesson';
                      return (
                        <TableRow key={tx.id} className="group">
                          <TableCell>
                            <Checkbox
                              checked={selectedTx.has(tx.id)}
                              onCheckedChange={() => setSelectedTx(s => toggleSet(s, tx.id))}
                            />
                          </TableCell>
                          <TableCell>{getStatusIcon(tx.status)}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{format(txDate, 'MMM d, yyyy')}</p>
                              <p className="text-xs text-muted-foreground">{format(txDate, 'h:mm a')}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {tx.student_id ? (
                                <Link to={`/admin/student/${tx.student_id}`} className="hover:underline">
                                  <p className="text-sm font-medium">{tx.student_name || 'Unknown'}</p>
                                </Link>
                              ) : (
                                <p className="text-sm font-medium">{tx.student_name || tx.student_email || '—'}</p>
                              )}
                              {!tx.student_matched && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">Unmatched</span>
                              )}
                              {isManual && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary" title={tx.payment_method ? `Paid via ${tx.payment_method}` : 'Manually recorded'}>
                                  Manual
                                </span>
                              )}
                            </div>
                            {tx.student_email && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.student_email}</p>}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{localizeDemoText(t, tx.product_name) || '—'}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={ptBadge.variant} className="text-xs">{ptBadge.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {getClassificationBadge(tx)}
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-semibold">{fmtMXNStr(tx.amount)}</p>
                            <p className="text-[10px] text-muted-foreground">{(tx.currency || 'mxn').toUpperCase()}</p>
                            {tx.refund_amount > 0 && (
                              <p className="text-xs text-destructive">-{fmtMXNStr(tx.refund_amount)} refund</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={tx.status === 'succeeded' ? 'default' : 'destructive'} className="text-xs">
                              {tx.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Quick classify buttons for unclassified */}
                              {!isManual && tx.classification === 'unknown' && !tx.admin_override && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Mark as Golf" onClick={() => quickClassify(tx.id, 'golf')}>
                                    <span className="text-xs">⛳</span>
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Mark as Non-Golf" onClick={() => quickClassify(tx.id, 'non_golf')}>
                                    <span className="text-xs">🚫</span>
                                  </Button>
                                </>
                              )}
                              {!isManual && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingTx(tx)} title="Edit transaction">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {tx.stripe_payment_intent_id && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => { navigator.clipboard.writeText(tx.stripe_payment_intent_id); toast.success(t('money.stripeRefCopied')); }}
                                  title={t('money.copyStripeRef')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeletingTx(tx)}
                                title={t('money.deleteTransaction')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <SocialFooter />

      {/* Edit Modal */}
      <TransactionEditModal
        open={!!editingTx}
        onOpenChange={(open) => { if (!open) setEditingTx(null); }}
        transaction={editingTx}
        onSaved={() => refetchTx()}
      />

      {/* Per-student packages quick modal */}
      <StudentPackagesQuickModal
        open={!!packagesModalStudent}
        onOpenChange={(o) => { if (!o) setPackagesModalStudent(null); }}
        studentId={packagesModalStudent?.id ?? null}
        studentName={packagesModalStudent?.name}
      />

      {/* AR Delete Confirmation */}
      <AlertDialog open={!!deletingAR} onOpenChange={(open) => { if (!open && !isDeletingAR) setDeletingAR(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('money.removeFromARTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{' '}
              <span className="font-semibold text-foreground">{deletingAR?.label}</span>
              {deletingAR?.amount ? <> ({fmtMXNStr(deletingAR.amount)})</> : null}.
              <br /><br />
              <span className="text-xs">
                {deletingAR?.kind === 'package'
                  ? 'The package, its payments and shared-member links will be removed. Lessons attached to it will be detached (kept) and become individual lessons.'
                  : t('money.lessonWillBeRemoved')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAR}>{t('money.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteARItem(); }}
              disabled={isDeletingAR}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAR ? t('money.deleting') : t('money.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={!!bulkDelete} onOpenChange={(open) => { if (!open && !isBulkDeleting) setBulkDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDelete?.count} item(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDelete?.kind === 'tx' && 'This permanently removes the selected transactions from the revenue ledger. Stripe payments are not refunded.'}
              {bulkDelete?.kind === 'ar-lesson' && 'This permanently removes the selected unpaid lesson records.'}
              {bulkDelete?.kind === 'ar-package' && 'This permanently removes the selected packages and their payments. Attached lessons are detached and kept as individual lessons.'}
              <br /><br />
              <span className="text-xs">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>{t('money.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? t('money.deleting') : t('money.deleteN').replace('{n}', String(bulkDelete?.count ?? ''))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTx} onOpenChange={(open) => { if (!open && !isDeleting) setDeletingTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('money.deleteThisTxTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-semibold text-foreground">{deletingTx?.product_name || 'this transaction'}</span>
              {deletingTx?.student_name ? <> for <span className="font-semibold text-foreground">{deletingTx.student_name}</span></> : null}
              {' '}({fmtMXNStr(deletingTx?.amount || 0)}) from the revenue ledger. This cannot be undone.
              <br /><br />
              <span className="text-xs">
                {deletingTx?.source === 'manual_package'
                  ? t('money.deletesManualPackage')
                  : deletingTx?.source === 'manual_lesson'
                  ? t('money.deletesManualLesson')
                  : 'Note: This does not refund or modify the actual Stripe payment — it only removes the local record.'}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('money.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteTransaction(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('money.deleting') : t('money.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RevenueBreakdownModal
        open={!!breakdownScope || !!trendBucket}
        onClose={() => { setBreakdownScope(null); setTrendBucket(null); }}
        scope={breakdownScope}
        trendBucket={trendBucket}
        enrichedStripePayments={enrichedStripePayments}
        packagePayments={packagePayments}
        manualPayments={manualLessonPayments}
        lessons={lessons}
        classPackages={classPackages}
        profileMap={profileMap}
        onIncomeAdded={refetchAllRevenue}
      />
      <LinkToARModal
        open={addToARopen}
        onOpenChange={setAddToARopen}
        excludePackageIds={new Set(receivables.packages.map((p: any) => p.id))}
        excludeLessonIds={new Set(receivables.unpaidLessons.map((l: any) => l.id))}
        onLinked={() => {
          refetchAllRevenue();
        }}
      />
      <ActivateDraftModal
        target={activateDraftTarget}
        onOpenChange={(o) => { if (!o) setActivateDraftTarget(null); }}
        onActivated={(next) => {
          const t = activateDraftTarget;
          refetchAllRevenue();
          if (t && next?.markPaid) {
            if (t.kind === 'lesson') {
              setMarkPaidTarget({
                kind: 'lesson',
                id: t.id,
                label: t.label,
                amount: t.amount,
                studentId: t.studentId ?? null,
              });
            } else {
              setMarkPaidTarget({
                kind: 'package',
                id: t.id,
                label: t.label,
                balance: t.price,
                price: t.price,
                amountPaid: 0,
                studentId: t.studentId ?? null,
              });
            }
          }
          setActivateDraftTarget(null);
        }}
      />
      <MarkARPaidModal
        target={markPaidTarget}
        onOpenChange={(o) => { if (!o) setMarkPaidTarget(null); }}
        onMarked={() => { refetchAllRevenue(); }}
      />
      <EditARModal
        target={editARTarget}
        onOpenChange={(o) => { if (!o) setEditARTarget(null); }}
        onSaved={() => { refetchAllRevenue(); }}
      />
      <BulkMarkARPaidModal
        target={bulkMarkPaid}
        onOpenChange={(o) => { if (!o) setBulkMarkPaid(null); }}
        onDone={() => {
          setSelectedARLessons(new Set());
          setSelectedARPackages(new Set());
          refetchAllRevenue();
        }}
      />
      <AddRevenueEntryModal
        open={addIncomeOpen}
        onOpenChange={setAddIncomeOpen}
        onAdded={() => refetchAllRevenue()}
      />
    </div>
  );
}
