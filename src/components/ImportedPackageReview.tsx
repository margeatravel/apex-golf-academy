import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { fmtMXN } from '@/lib/formatCurrency';
import { Package, CheckCircle, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

const STRIPE_REF: Record<number, number> = { 5: 7500, 10: 14850, 20: 26500, 30: 34650 };

export function ImportedPackageReview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['bulk-packages-review'],
    queryFn: async () => {
      // Fetch packages and profiles separately since there's no FK relationship
      const { data: pkgs, error } = await supabase
        .from('class_packages')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!pkgs || pkgs.length === 0) return [];

      // Get unique user_ids and fetch their profiles
      const userIds = [...new Set(pkgs.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return pkgs.map((pkg: any) => ({ ...pkg, profiles: profileMap.get(pkg.user_id) || null }));
    },
  });

  const fixablePackages = useMemo(() => {
    return packages.filter((pkg: any) => {
      const price = Number(pkg.price) || 0;
      const paid = Number(pkg.amount_paid) || 0;
      // Show as mismatched if price and paid differ and paid > 0
      if (paid <= 0) return false;
      if (price === paid) return false;
      return true;
    });
  }, [packages]);

  const displayPackages = showAll ? packages : fixablePackages;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === displayPackages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayPackages.map((p: any) => p.id)));
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bulk-packages-review'] });
    queryClient.invalidateQueries({ queryKey: ['bulk-packages-fix'] });
  };

  const handleBulkFix = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    try {
      let fixed = 0;
      for (const pkgId of selected) {
        const pkg = packages.find((p: any) => p.id === pkgId);
        if (!pkg) continue;
        const paid = Number(pkg.amount_paid) || 0;
        if (paid <= 0) continue;
        const { error } = await supabase
          .from('class_packages')
          .update({ price: paid, payment_status: 'paid' })
          .eq('id', pkgId);
        if (error) throw error;
        fixed++;
      }
      toast({ title: 'Packages corrected', description: `${fixed} package(s) updated: price set to paid amount, pending zeroed.` });
      setSelected(new Set());
      invalidate();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    try {
      let count = 0;
      for (const pkgId of selected) {
        const pkg = packages.find((p: any) => p.id === pkgId);
        if (!pkg) continue;
        const paid = Number(pkg.amount_paid) || Number(pkg.price) || 0;
        const { error } = await supabase
          .from('class_packages')
          .update({ payment_status: 'paid', amount_paid: paid, price: paid })
          .eq('id', pkgId);
        if (error) throw error;
        count++;
      }
      toast({ title: 'Marked as paid', description: `${count} package(s) marked paid with $0 pending.` });
      setSelected(new Set());
      invalidate();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase
        .from('class_packages')
        .delete()
        .in('id', ids);
      if (error) throw error;
      toast({ title: 'Deleted', description: `${ids.length} package(s) deleted.` });
      setSelected(new Set());
      invalidate();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="card-elevated overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Imported Package Review
        </CardTitle>
        <CardDescription>
          Review and bulk-correct imported packages. Select rows and apply corrections.
        </CardDescription>
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant={showAll ? 'outline' : 'default'}
            size="sm"
            onClick={() => { setShowAll(false); setSelected(new Set()); }}
          >
            Mismatched Only ({fixablePackages.length})
          </Button>
          <Button
            variant={showAll ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setShowAll(true); setSelected(new Set()); }}
          >
            All Packages ({packages.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : displayPackages.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {showAll ? 'No packages found.' : 'All packages look correct — no mismatched pricing found.'}
            </p>
          </div>
        ) : (
          <>
            {/* Bulk action bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selected.size === displayPackages.length && displayPackages.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selected.size} of {displayPackages.length} selected
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleBulkFix}
                  disabled={selected.size === 0 || isSubmitting}
                  size="sm"
                  className="gap-1.5 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                >
                  {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                  Use Paid as Total
                </Button>
                <Button
                  onClick={handleMarkPaid}
                  disabled={selected.size === 0 || isSubmitting}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Mark Paid
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={selected.size === 0 || isSubmitting}
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete ({selected.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selected.size} package(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {selected.size} selected package(s). This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="font-semibold">Student</TableHead>
                    <TableHead className="font-semibold">Package</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                    <TableHead className="font-semibold text-right">Current Total</TableHead>
                    <TableHead className="font-semibold text-right">Paid</TableHead>
                    <TableHead className="font-semibold text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPackages.map((pkg: any) => {
                    const price = Number(pkg.price) || 0;
                    const paid = Number(pkg.amount_paid) || 0;
                    const pending = Math.max(0, price - paid);
                    const profile = pkg.profiles;
                    const isMismatched = fixablePackages.some((f: any) => f.id === pkg.id);
                    return (
                      <TableRow key={pkg.id} className={`${selected.has(pkg.id) ? 'bg-primary/5' : ''} ${isMismatched ? 'border-l-2 border-l-warning' : ''}`}>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {pkg.payment_date ? format(new Date(pkg.payment_date + 'T12:00:00'), 'MMM dd, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={
                            pkg.payment_status === 'paid'
                              ? 'bg-success/15 text-success border-success/25'
                              : 'bg-warning/15 text-warning border-warning/25'
                          }>
                            {pkg.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right text-sm ${isMismatched ? 'text-destructive line-through' : ''}`}>
                          {fmtMXN(price)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-success">
                          {fmtMXN(paid)}
                        </TableCell>
                        <TableCell className={`text-right text-sm ${pending > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {fmtMXN(pending)}
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
  );
}
