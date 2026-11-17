import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fmtMXN } from '@/lib/formatCurrency';
import { toast } from 'sonner';

export type ActivateDraftTarget =
  | { kind: 'lesson'; id: string; label: string; amount: number; studentId?: string | null }
  | { kind: 'package'; id: string; label: string; price: number; studentId?: string | null };

interface Props {
  target: ActivateDraftTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Called after activation finishes. Optionally returns a "mark paid" target so the parent can open MarkARPaidModal. */
  onActivated: (next?: { markPaid: boolean }) => void;
}

export function ActivateDraftModal({ target, onOpenChange, onActivated }: Props) {
  const [saving, setSaving] = useState(false);
  const open = !!target;

  const amount = target
    ? target.kind === 'lesson'
      ? target.amount
      : target.price
    : 0;

  const activate = async (markPaid: boolean) => {
    if (!target) return;
    setSaving(true);
    try {
      if (target.kind === 'lesson') {
        const { error } = await supabase
          .from('lessons')
          .update({ ar_status: 'active' } as any)
          .eq('id', target.id);
        if (error) throw error;
        toast.success(markPaid ? 'Activated — choose payment' : 'Activated as unpaid');
        onActivated({ markPaid });
        onOpenChange(false);
      } else {
        if (markPaid) {
          const { error } = await supabase
            .from('class_packages')
            .update({ ar_status: 'active', is_active: true } as any)
            .eq('id', target.id);
          if (error) throw error;
          toast.success('Activated — choose payment');
          onActivated({ markPaid: true });
          onOpenChange(false);
        } else {
          const { error } = await supabase
            .from('class_packages')
            .update({ is_active: true, payment_status: 'pending', ar_status: 'active_pending', imported: false } as any)
            .eq('id', target.id);
          if (error) throw error;
          if (target.studentId) {
            try {
              await supabase.functions.invoke('generate-recurring-lessons', {
                body: { student_id: target.studentId },
              });
            } catch (e) {
              console.error('generate-recurring-lessons call failed:', e);
            }
          }
          toast.success('Activated — pending payment');
          onActivated({ markPaid: false });
          onOpenChange(false);
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Could not activate draft', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Activar pendiente</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{target?.label}</span>
            {amount > 0 && <> · <span className="text-warning font-semibold">{fmtMXN(amount)}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
            disabled={saving}
            onClick={() => activate(false)}
          >
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Activate (Pending Payment)</p>
              <p className="text-xs text-muted-foreground">Activate package and schedule recurring lessons</p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
            disabled={saving}
            onClick={() => activate(true)}
          >
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Activate + Mark Paid</p>
              <p className="text-xs text-muted-foreground">Total o parcial · pide método y fecha</p>
            </div>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}