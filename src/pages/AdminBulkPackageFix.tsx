import { useState, useMemo } from 'react';
import { useCoachPreview } from '@/contexts/CoachPreviewContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { fmtMXN } from '@/lib/formatCurrency';
import { Package, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const STRIPE_REF: Record<number, number> = { 5: 7500, 10: 14850, 20: 26500, 30: 34650 };

export default function AdminBulkPackageFix() {
  const previewCoachId = useCoachPreview()?.coachId ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all packages with student names
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['bulk-packages-fix', previewCoachId ?? 'all'],
    queryFn: async () => {
      let pq = supabase
        .from('class_packages')
        .select('*, profiles:user_id(full_name, email)')
        .order('created_at', { ascending: false });
      // Coach preview only: packages of students assigned to the previewed coach.
      if (previewCoachId) {
        const { data: assigned } = await supabase.from('profiles').select('id').eq('assigned_coach_id', previewCoachId);
        const ids = (assigned || []).map((r: any) => r.id);
        if (ids.length === 0) return [] as any[];
        pq = pq.in('user_id', ids);
      }
      const { data } = await pq;
      return (data || []) as any[];
    },
  });

  // Only show packages where price differs from amount_paid and amount_paid > 0
  // (i.e. imported packages that got standard pricing but were sold for a different amount)
  const fixablePackages = useMemo(() => {
    return packages.filter((pkg: any) => {
      const price = Number(pkg.price) || 0;
      const paid = Number(pkg.amount_paid) || 0;
      // Must have some paid amount and price must differ from paid
      if (paid <= 0) return false;
      if (price === paid) return false;
      // Check if price matches a standard Stripe reference — likely auto-assigned
      const refPrice = STRIPE_REF[pkg.package_size] || 0;
      return price === refPrice && paid !== refPrice;
    });
  }, [packages]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === fixablePackages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(fixablePackages.map((p: any) => p.id)));
    }
  };

  const handleBulkFix = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    try {
      let fixed = 0;
      for (const pkgId of selected) {
        const pkg = fixablePackages.find((p: any) => p.id === pkgId);
        if (!pkg) continue;
        const paid = Number(pkg.amount_paid) || 0;
        const { error } = await supabase
          .from('class_packages')
          .update({
            price: paid,
            payment_status: 'paid',
          })
          .eq('id', pkgId);
        if (error) throw error;
        fixed++;
      }
      toast({ title: 'Packages corrected', description: `${fixed} package(s) updated: price set to paid amount, pending balance zeroed.` });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['bulk-packages-fix'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.bulkPackageFixTitle" subtitleKey="admin.bulkPackageFixSub" backTo="/admin" />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Imported Packages with Mismatched Pricing
            </CardTitle>
            <CardDescription>
              These packages have a standard Stripe price but the actual paid amount is different.
              Select the ones to correct: their total will be set to the paid amount, and pending balance will become $0.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : fixablePackages.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-success mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">All packages look correct — no mismatched pricing found.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selected.size === fixablePackages.length && fixablePackages.length > 0}
                      onCheckedChange={toggleAll}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selected.size} of {fixablePackages.length} selected
                    </span>
                  </div>
                  <Button
                    onClick={handleBulkFix}
                    disabled={selected.size === 0 || isSubmitting}
                    className="gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                    Use Paid Amount as Total ({selected.size})
                  </Button>
                </div>

                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead className="text-right">Current Total</TableHead>
                        <TableHead className="text-right">Paid Amount</TableHead>
                        <TableHead className="text-right">Current Pending</TableHead>
                        <TableHead className="text-right">Corrected Total</TableHead>
                        <TableHead className="text-right">Corrected Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fixablePackages.map((pkg: any) => {
                        const price = Number(pkg.price) || 0;
                        const paid = Number(pkg.amount_paid) || 0;
                        const pending = Math.max(0, price - paid);
                        const profile = pkg.profiles;
                        return (
                          <TableRow key={pkg.id} className={selected.has(pkg.id) ? 'bg-primary/5' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={selected.has(pkg.id)}
                                onCheckedChange={() => toggleSelect(pkg.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium truncate">{profile?.full_name || 'No name'}</p>
                                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {pkg.package_name || `${pkg.package_size}-Lesson`}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm text-destructive line-through">
                              {fmtMXN(price)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-success">
                              {fmtMXN(paid)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-destructive">
                              {fmtMXN(pending)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold text-success">
                              {fmtMXN(paid)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold text-success">
                              {fmtMXN(0)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <SocialFooter />
    </div>
  );
}
