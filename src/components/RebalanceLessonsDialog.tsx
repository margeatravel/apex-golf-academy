import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  planStudentRebalance, applyRebalancePlan, type RebalancePlan,
} from '@/lib/rebalanceStudentLessons';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  onDone?: () => void;
}

export function RebalanceLessonsDialog({ open, onOpenChange, studentId, onDone }: Props) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    setLoading(true);
    setPlan(null);
    planStudentRebalance(studentId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch((e: any) =>
        toast({ title: 'No se pudo calcular', description: e?.message, variant: 'destructive' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, studentId, toast]);

  const run = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const { moved, deleted } = await applyRebalancePlan(plan);
      toast({
        title: 'Rebalanceo aplicado',
        description: `${moved} clase(s) re-vinculada(s), ${deleted} eliminada(s).`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${day} ${months[m - 1]} ${String(y).slice(2)}`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Rebalancear clases</AlertDialogTitle>
          <AlertDialogDescription>
            Las clases futuras agendadas se reparten en orden cronológico entre los paquetes
            activos, no pausados y no archivados. Las que no caben se eliminan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
          </div>
        )}

        {plan && !loading && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              {plan.packages.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Clases restantes: {p.capacity}{!p.counts && ' · no cuenta'}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs">
                    Agendadas: <span className="text-muted-foreground">{p.before}</span>
                    {' → '}
                    <span className="font-semibold">{p.after}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="font-medium">
                Se eliminarán {plan.deletions.length} clase(s)
              </p>
              {plan.deletions.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {plan.deletions.map((d) => (
                    <li key={d.id}>
                      {fmt(d.lesson_date)}{d.lesson_time ? ` · ${String(d.lesson_time).slice(0, 5)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); run(); }}
            disabled={applying || loading || !plan}
          >
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aplicar rebalanceo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
