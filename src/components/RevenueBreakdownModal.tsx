import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO, startOfMonth, subDays, addDays, endOfMonth } from 'date-fns';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { AddRevenueEntryModal } from '@/components/AddRevenueEntryModal';
import { isLessonRecognizedRevenue, filterRecognizedManualPayments, parseRevenueDate, classifyManualPayment } from '@/lib/revenueCalc';

export type BreakdownScope = 'mtd' | 'last30' | 'last90' | 'all';

const SCOPE_LABELS: Record<BreakdownScope, string> = {
  mtd: 'Month to Date',
  last30: 'Last 30 Days',
  last90: 'Last 90 Days',
  all: 'All Time',
};

function getRangeStart(scope: BreakdownScope): Date {
  const today = new Date();
  switch (scope) {
    case 'mtd': return startOfMonth(today);
    case 'last30': return subDays(today, 30);
    case 'last90': return subDays(today, 90);
    case 'all': return new Date('2000-01-01');
  }
}

export type TrendBucket =
  | { kind: 'daily'; bucket: string }      // yyyy-MM-dd
  | { kind: 'weekly'; bucket: string }     // yyyy-MM-dd (Sunday start)
  | { kind: 'monthly'; bucket: string }    // yyyy-MM
  | { kind: 'by-student'; studentId: string; studentName: string; rangeStart: string; rangeEnd: string }; // ISO dates

function getTrendWindow(tb: TrendBucket): { start: Date; end: Date; label: string } {
  if (tb.kind === 'daily') {
    const d = parseISO(tb.bucket);
    const start = new Date(d); start.setHours(0,0,0,0);
    const end = new Date(d); end.setHours(23,59,59,999);
    return { start, end, label: format(d, 'EEEE, MMM d, yyyy') };
  }
  if (tb.kind === 'weekly') {
    const start = parseISO(tb.bucket); start.setHours(0,0,0,0);
    const end = addDays(start, 6); end.setHours(23,59,59,999);
    return { start, end, label: `Week of ${format(start, 'MMM d, yyyy')}` };
  }
  if (tb.kind === 'monthly') {
    const start = parseISO(tb.bucket + '-01');
    const end = endOfMonth(start); end.setHours(23,59,59,999);
    return { start, end, label: format(start, 'MMMM yyyy') };
  }
  // by-student
  const start = parseISO(tb.rangeStart); start.setHours(0,0,0,0);
  const end = parseISO(tb.rangeEnd); end.setHours(23,59,59,999);
  return { start, end, label: tb.studentName };
}

interface Props {
  open: boolean;
  onClose: () => void;
  scope: BreakdownScope | null;
  trendBucket?: TrendBucket | null;
  enrichedStripePayments: any[];
  packagePayments: any[];
  manualPayments?: any[];
  lessons: any[];
  classPackages: any[];
  profileMap: Map<string, { id: string; full_name: string; email: string }>;
  onIncomeAdded?: () => void;
}

export function RevenueBreakdownModal({
  open,
  onClose,
  scope,
  trendBucket,
  enrichedStripePayments,
  packagePayments,
  manualPayments = [],
  lessons,
  classPackages,
  profileMap,
  onIncomeAdded,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const data = useMemo(() => {
    if (!scope && !trendBucket) return null;
    const today = new Date();
    let start: Date;
    let end: Date = today;
    let studentFilter: string | null = null;
    if (trendBucket) {
      const w = getTrendWindow(trendBucket);
      start = w.start; end = w.end;
      if (trendBucket.kind === 'by-student') studentFilter = trendBucket.studentId;
    } else {
      start = getRangeStart(scope!);
    }

    // Map package_id -> user_id for student attribution
    const pkgToUser = new Map<string, string>();
    classPackages.forEach((cp: any) => pkgToUser.set(cp.id, cp.user_id));

    // Stripe rows: golf, succeeded, not archived, not legacy reporting categories (matches kpi `stripeOnly`)
    const stripeRows = enrichedStripePayments
      .filter((sp: any) => sp.status === 'succeeded' && !sp.is_archived && sp.is_golf_revenue)
      .filter((sp: any) => !['individual_lesson', 'package'].includes(sp.reporting_category))
      .filter((sp: any) => {
        const d = sp.paid_at ? new Date(sp.paid_at) : new Date(sp.created_at);
        return d >= start && d <= end;
      })
      .filter((sp: any) => !studentFilter || sp.student_id === studentFilter)
      .map((sp: any) => ({
        id: sp.id,
        date: sp.paid_at || sp.created_at,
        student_id: sp.student_id,
        student_name: sp.student_name || 'Unknown',
        student_email: sp.student_email,
        product_name: sp.product_name || sp.purchase_type || '—',
        amount: Number(sp.amount) || 0,
        refund_amount: Number(sp.refund_amount) || 0,
        net: (Number(sp.amount) || 0) - (Number(sp.refund_amount) || 0),
        refund_status: sp.refund_status,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Package payment rows
    const packageRows = packagePayments
      .filter((p: any) => {
        const d = parseRevenueDate(p.payment_date);
        return !!d && d >= start && d <= end;
      })
      .map((p: any) => {
        const userId = pkgToUser.get(p.package_id);
        const profile = userId ? profileMap.get(userId) : undefined;
        const pkg = classPackages.find((cp: any) => cp.id === p.package_id);
        return {
          id: p.id,
          date: p.payment_date,
          student_id: userId,
          student_name: profile?.full_name || 'Unknown',
          student_email: profile?.email,
          package_name: pkg?.package_name || `${pkg?.package_size || '?'}-lesson package`,
          package_size: pkg?.package_size,
          amount: Number(p.amount) || 0,
        };
      })
      .filter((r: any) => !studentFilter || r.student_id === studentFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Lesson revenue rows (legacy per-lesson revenue)
    const lessonRows = lessons
      .filter((l: any) => {
        if (!l.lesson_date) return false;
        // Unpaid lessons live in Accounts Receivable, never in revenue.
        if (!isLessonRecognizedRevenue(l)) return false;
        const rev = Number(l.revenue) || 0;
        if (rev <= 0) return false;
        const d = parseRevenueDate(l.lesson_date);
        return !!d && d >= start && d <= end;
      })
      .filter((l: any) => !studentFilter || l.student_id === studentFilter)
      .map((l: any) => ({
        id: l.id,
        date: l.lesson_date,
        student_id: l.student_id,
        student_name: l.profiles?.full_name || 'Unknown',
        student_email: l.profiles?.email,
        lesson_type: l.lesson_type || 'Lesson',
        amount: Number(l.revenue) || 0,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Manual payments (payments table) — recognized on their payment_date,
    // deduped against lessons already counted above (same helper as the KPI).
    // They are never a separate bucket: every manual payment belongs either to
    // a lesson (Lesson Revenue) or to a package (Package Payments).
    const countedLessons = lessons.filter((l: any) => {
      if (!l.lesson_date) return false;
      if (!isLessonRecognizedRevenue(l)) return false;
      const rev = Number(l.revenue) || 0;
      if (rev <= 0) return false;
      const d = parseRevenueDate(l.lesson_date);
      return !!d && d >= start && d <= end;
    });
    const manualRows = filterRecognizedManualPayments(
      (manualPayments || []).filter((p: any) => {
        const d = parseRevenueDate(p.payment_date);
        return !!d && d >= start && d <= end;
      }),
      countedLessons,
    ).filter((p: any) => !studentFilter || p.student_id === studentFilter);

    const manualLessonRows = manualRows
      .filter((p: any) => classifyManualPayment(p) === 'lesson')
      .map((p: any) => {
        const profile = p.student_id ? profileMap.get(p.student_id) : undefined;
        return {
          id: `manual-${p.id}`,
          date: p.payment_date,
          student_id: p.student_id,
          student_name: profile?.full_name || 'Unknown',
          student_email: profile?.email,
          lesson_type: p.concept || 'Lesson',
          amount: Number(p.amount) || 0,
        };
      });

    const manualPackageRows = manualRows
      .filter((p: any) => classifyManualPayment(p) === 'package')
      .map((p: any) => {
        const profile = p.student_id ? profileMap.get(p.student_id) : undefined;
        return {
          id: `manual-${p.id}`,
          date: p.payment_date,
          student_id: p.student_id,
          student_name: profile?.full_name || 'Unknown',
          student_email: profile?.email,
          package_name: p.concept || 'Package',
          amount: Number(p.amount) || 0,
        };
      });

    const lessonRowsAll = [...lessonRows, ...manualLessonRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const packageRowsAll = [...packageRows, ...manualPackageRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const stripeTotal = stripeRows.reduce((s, r) => s + r.net, 0);
    const packageTotal = packageRowsAll.reduce((s, r) => s + r.amount, 0);
    const lessonTotal = lessonRowsAll.reduce((s, r) => s + r.amount, 0);
    const grandTotal = stripeTotal + packageTotal + lessonTotal;

    return {
      stripeRows,
      packageRows: packageRowsAll,
      lessonRows: lessonRowsAll,
      stripeTotal,
      packageTotal,
      lessonTotal,
      grandTotal,
    };
  }, [scope, trendBucket, enrichedStripePayments, packagePayments, manualPayments, lessons, classPackages, profileMap]);


  const exportCsv = () => {
    if (!data) return;
    const tag = scope ?? (trendBucket ? trendBucket.kind : 'export');
    const rows: string[] = ['Source,Date,Student,Email,Description,Amount (MXN)'];
    data.stripeRows.forEach(r => rows.push([
      'Stripe',
      format(new Date(r.date), 'yyyy-MM-dd'),
      `"${r.student_name}"`,
      r.student_email || '',
      `"${r.product_name}"`,
      r.net.toString(),
    ].join(',')));
    data.packageRows.forEach(r => rows.push([
      'Package',
      r.date,
      `"${r.student_name}"`,
      r.student_email || '',
      `"${r.package_name}"`,
      r.amount.toString(),
    ].join(',')));
    data.lessonRows.forEach(r => rows.push([
      'Lesson',
      r.date,
      `"${r.student_name}"`,
      r.student_email || '',
      `"${r.lesson_type}"`,
      r.amount.toString(),
    ].join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-${tag}-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if ((!scope && !trendBucket) || !data) return null;
  const headerLabel = trendBucket ? getTrendWindow(trendBucket).label : SCOPE_LABELS[scope!];

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{headerLabel}</DialogTitle>
              <p className="text-3xl font-bold text-primary mt-2">{fmtMXN(data.grandTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.stripeRows.length + data.packageRows.length + data.lessonRows.length} transactions
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <Button size="sm" onClick={() => setShowAdd(true)} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
                <Plus className="h-4 w-4 mr-2" />
                Add income
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">All ({data.stripeRows.length + data.packageRows.length + data.lessonRows.length})</TabsTrigger>
            <TabsTrigger value="stripe">Stripe ({data.stripeRows.length})</TabsTrigger>
            <TabsTrigger value="packages">Packages ({data.packageRows.length})</TabsTrigger>
            <TabsTrigger value="lessons">Lessons ({data.lessonRows.length})</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-3 min-h-0">
            <TabsContent value="all" className="space-y-6 mt-0">
              {data.stripeRows.length > 0 && (
                <Section title="Stripe Payments" total={data.stripeTotal}>
                  <StripeTable rows={data.stripeRows} />
                </Section>
              )}
              {data.packageRows.length > 0 && (
                <Section title="Package Payments" total={data.packageTotal}>
                  <PackageTable rows={data.packageRows} />
                </Section>
              )}
              {data.lessonRows.length > 0 && (
                <Section title="Lesson Revenue" total={data.lessonTotal}>
                  <LessonTable rows={data.lessonRows} />
                </Section>
              )}
              {data.grandTotal === 0 && (
                <p className="text-center text-muted-foreground py-12">No transactions in this period.</p>
              )}
            </TabsContent>
            <TabsContent value="stripe" className="mt-0">
              <Section title="Stripe Payments" total={data.stripeTotal}>
                <StripeTable rows={data.stripeRows} />
              </Section>
            </TabsContent>
            <TabsContent value="packages" className="mt-0">
              <Section title="Package Payments" total={data.packageTotal}>
                <PackageTable rows={data.packageRows} />
              </Section>
            </TabsContent>
            <TabsContent value="lessons" className="mt-0">
              <Section title="Lesson Revenue" total={data.lessonTotal}>
                <LessonTable rows={data.lessonRows} />
              </Section>
            </TabsContent>
          </div>

          <div className="border-t pt-3 mt-2 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Grand Total</span>
            <span className="font-bold text-base text-primary">{fmtMXN(data.grandTotal)}</span>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
      <AddRevenueEntryModal
        open={showAdd}
        onOpenChange={setShowAdd}
        onAdded={() => onIncomeAdded?.()}
      />
    </>
  );
}

function Section({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-sm font-medium text-muted-foreground">{fmtMXN(total)}</span>
      </div>
      {children}
    </div>
  );
}

function StudentLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span>{name}</span>;
  return (
    <Link to={`/admin/student/${id}`} className="text-primary hover:underline inline-flex items-center gap-1">
      {name}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function StripeTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4">No Stripe payments.</p>;
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-xs">{format(new Date(r.date), 'MMM d, yyyy')}</TableCell>
            <TableCell><StudentLink id={r.student_id} name={r.student_name} /></TableCell>
            <TableCell className="text-xs">
              {r.product_name}
              {r.refund_amount > 0 && <Badge variant="destructive" className="ml-2 text-[10px]">Refund {fmtMXNStr(r.refund_amount)}</Badge>}
            </TableCell>
            <TableCell className="text-right font-medium">{fmtMXN(r.net)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function PackageTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4">No package payments.</p>;
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Package</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-xs">{format(parseISO(r.date), 'MMM d, yyyy')}</TableCell>
            <TableCell><StudentLink id={r.student_id} name={r.student_name} /></TableCell>
            <TableCell className="text-xs">{r.package_name}</TableCell>
            <TableCell className="text-right font-medium">{fmtMXN(r.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function LessonTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4">No lesson revenue.</p>;
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Lesson Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-xs">{format(parseISO(r.date), 'MMM d, yyyy')}</TableCell>
            <TableCell><StudentLink id={r.student_id} name={r.student_name} /></TableCell>
            <TableCell className="text-xs">{r.lesson_type}</TableCell>
            <TableCell className="text-right font-medium">{fmtMXN(r.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

