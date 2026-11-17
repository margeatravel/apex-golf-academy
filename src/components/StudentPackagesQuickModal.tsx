import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fmtMXNStr } from '@/lib/formatCurrency';
import { toast } from 'sonner';
import { getPackageAttachments, deletePackageCascade } from '@/lib/deletePackage';
import { getCurrentPackageId } from '@/lib/packageStatus';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string | null;
  studentName?: string;
}

/**
 * Lists every class_package for a student with its attached lesson count
 * and a guarded delete button. Used from the Revenue-by-Student panel so
 * admins can remove duplicates without leaving the Revenue page.
 */
export function StudentPackagesQuickModal({ open, onOpenChange, studentId, studentName }: Props) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<{ lessons: number; payments: number; members: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: packages = [], isLoading, refetch } = useQuery({
    queryKey: ['student-quick-packages', studentId],
    enabled: open && !!studentId,
    queryFn: async () => {
      const [pkgRes, lessonRes, memberRes] = await Promise.all([
        supabase
          .from('class_packages')
          .select('*')
          .eq('user_id', studentId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('lessons')
          .select('package_id')
          .eq('student_id', studentId!)
          .not('package_id', 'is', null),
        supabase
          .from('package_members')
          .select('package_id')
          .eq('student_id', studentId!),
      ]);
      const own = pkgRes.data || [];
      const ownIds = new Set(own.map((p: any) => p.id));
      const extraIds = Array.from(new Set([
        ...(memberRes.data || []).map((m: any) => m.package_id),
        ...(lessonRes.data || []).map((l: any) => l.package_id),
      ].filter((id) => id && !ownIds.has(id))));
      let extra: any[] = [];
      if (extraIds.length) {
        const { data } = await supabase.from('class_packages').select('*').in('id', extraIds);
        extra = data || [];
      }
      const all = [...own, ...extra].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      const lessonCounts = new Map<string, number>();
      (lessonRes.data || []).forEach((l: any) => {
        if (!l.package_id) return;
        lessonCounts.set(l.package_id, (lessonCounts.get(l.package_id) || 0) + 1);
      });
      return all.map((p: any) => ({
        ...p,
        attached_lesson_count: lessonCounts.get(p.id) || 0,
      }));
    },
  });

  // Flag packages that look like duplicates: same size + same price + within 14 days
  const duplicateIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < packages.length; i++) {
      for (let j = i + 1; j < packages.length; j++) {
        const a = packages[i];
        const b = packages[j];
        if (a.package_size !== b.package_size) continue;
        if (Number(a.price) !== Number(b.price)) continue;
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        if (Math.abs(da - db) <= 14 * 24 * 60 * 60 * 1000) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [packages]);

  const currentPackageId = useMemo(() => getCurrentPackageId(packages as any), [packages]);

  const startDelete = async (pkgId: string) => {
    setPendingDeleteId(pkgId);
    setPendingAttachments(null);
    try {
      const counts = await getPackageAttachments(pkgId);
      setPendingAttachments(counts);
    } catch {
      setPendingAttachments({ lessons: 0, payments: 0, members: 0 });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deletePackageCascade(pendingDeleteId);
      toast.success('Package deleted');
      setPendingDeleteId(null);
      setPendingAttachments(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-package-payments'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-package-payments', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
      queryClient.invalidateQueries({ queryKey: ['bulk-packages-fix'] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete package');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setPendingDeleteId(null);
      setPendingAttachments(null);
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl p-4 sm:p-6 max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{studentName || 'Student'} — packages</DialogTitle>
            <DialogDescription>
              Review every package on this student's account. Use the trash icon to remove a duplicate — you'll always confirm before anything is deleted.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : packages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No packages on this account.</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {packages.map((pkg: any) => {
                const isDup = duplicateIds.has(pkg.id);
                return (
                  <div
                    key={pkg.id}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3 ${isDup ? 'border-warning/40 bg-warning/5' : 'border-border'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {pkg.package_name || `${pkg.package_size}-Lesson Package`}
                        </span>
                        {currentPackageId === pkg.id && (
                          <Badge className="bg-[#F0C040]/15 text-[#F0C040] border-[#F0C040]/30 text-[10px]">
                            ⭐ In use
                          </Badge>
                        )}
                        {isDup && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            Possible duplicate
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Size: {pkg.package_size}</span>
                        <span>Total: {fmtMXNStr(Number(pkg.price) || 0)} MXN</span>
                        <span>Paid: {fmtMXNStr(Number(pkg.amount_paid) || 0)} MXN</span>
                        <span>Used: {pkg.classes_used}/{pkg.package_size}</span>
                        <span>Lessons attached: {pkg.attached_lesson_count}</span>
                        {pkg.payment_date && (
                          <span>Paid on: {format(new Date(pkg.payment_date + 'T12:00:00'), 'dd MMM yyyy')}</span>
                        )}
                        <span>Created: {format(new Date(pkg.created_at), 'dd MMM yyyy')}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto h-9 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => startDelete(pkg.id)}
                      title={t('ui.packages.deleteTip')}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sm:hidden">Delete</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(o) => { if (!o && !isDeleting) { setPendingDeleteId(null); setPendingAttachments(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ui.packages.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{t('ui.packages.deleteDesc')}</p>
                {pendingAttachments === null ? (
                  <p className="text-xs text-muted-foreground">Checking attached items…</p>
                ) : (
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                    <li>
                      <span className="text-foreground font-medium">{pendingAttachments.lessons}</span> lesson(s) attached — will be detached (kept) but no longer linked to this package.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">{pendingAttachments.payments}</span> payment record(s) — will be deleted.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">{pendingAttachments.members}</span> shared member(s) — will be removed.
                    </li>
                  </ul>
                )}
                <p className="text-xs text-destructive">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || pendingAttachments === null}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}