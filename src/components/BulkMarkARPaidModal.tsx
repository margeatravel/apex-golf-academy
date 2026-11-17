import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fmtMXNStr } from '@/lib/formatCurrency';
import { useLanguage } from '@/contexts/LanguageContext';

export type BulkMarkPaidTarget =
  | { kind: 'lessons'; items: { id: string; amount: number; student_id?: string | null; payment_date: string }[] }
  | { kind: 'packages'; items: { id: string; balance: number; amount_paid: number; price: number; payment_date: string }[] };

const METHODS_EN = ['Cash', 'Transfer', 'Card', 'Stripe', 'Other'];
const METHODS_ES = ['Efectivo', 'Transferencia', 'Tarjeta', 'Stripe', 'Otro'];
// Stored values are always EN (canonical) for DB consistency
const METHOD_VALUES = METHODS_EN;

interface Props {
  target: BulkMarkPaidTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function BulkMarkARPaidModal({ target, onOpenChange, onDone }: Props) {
  const { language } = useLanguage();
  const es = language === 'es';
  const [method, setMethod] = useState('Transfer');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setMethod('Transfer');
    setNotes('');
  }, [target]);

  if (!target) return null;

  const count = target.items.length;
  const total =
    target.kind === 'lessons'
      ? target.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
      : target.items.reduce((s, i) => s + (Number(i.balance) || 0), 0);

  const handleSave = async () => {
    if (!target || count === 0) return;
    setSaving(true);
    try {
      if (target.kind === 'lessons') {
        const ids = target.items.map(i => i.id);
        const { error } = await supabase
          .from('lessons')
          .update({ payment_method: method })
          .in('id', ids);
        if (error) throw error;

        // Bookkeeping: insert payments for items with student_id + assigned_coach
        const withStudent = target.items.filter(i => i.student_id);
        if (withStudent.length > 0) {
          const studentIds = Array.from(new Set(withStudent.map(i => i.student_id as string)));
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, assigned_coach_id')
            .in('id', studentIds);
          const coachMap = new Map<string, string | null>(
            (profs || []).map((p: any) => [p.id, p.assigned_coach_id ?? null])
          );
          const rows = withStudent
            .map(i => {
              const coachId = coachMap.get(i.student_id as string);
              if (!coachId) return null;
              return {
                student_id: i.student_id as string,
                coach_id: coachId,
                payment_date: i.payment_date,
                amount: Number(i.amount) || 0,
                payment_method: method,
                concept: 'Individual Lesson',
                notes: notes || null,
              };
            })
            .filter((r): r is NonNullable<typeof r> => !!r && r.amount > 0);
          if (rows.length > 0) {
            await supabase.from('payments').insert(rows);
          }
        }
      } else {
        // Packages: settle remaining balance for each
        for (const pkg of target.items) {
          const remaining = Number(pkg.balance) || 0;
          if (remaining > 0) {
            await supabase.from('package_payments').insert({
              package_id: pkg.id,
              amount: remaining,
              payment_date: pkg.payment_date,
              payment_method: method,
              notes: notes || null,
            });
          }
          await supabase
            .from('class_packages')
            .update({
              amount_paid: Number(pkg.price) || 0,
              payment_status: 'paid',
              payment_date: pkg.payment_date,
            })
            .eq('id', pkg.id);
        }
      }
      toast.success(es ? `${count} pagos registrados` : `${count} payments recorded`);
      onDone();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || (es ? 'Error al registrar pagos' : 'Failed to record payments'));
    } finally {
      setSaving(false);
    }
  };

  const summary = target.kind === 'lessons'
    ? (es
        ? `Marcar ${count} ${count === 1 ? 'clase' : 'clases'} por ${fmtMXNStr(total)} como pagadas`
        : `Mark ${count} ${count === 1 ? 'lesson' : 'lessons'} totaling ${fmtMXNStr(total)} as paid`)
    : (es
        ? `Saldar ${count} ${count === 1 ? 'paquete' : 'paquetes'} por ${fmtMXNStr(total)}`
        : `Settle ${count} ${count === 1 ? 'package' : 'packages'} totaling ${fmtMXNStr(total)}`);

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            {es ? 'Marcar como pagadas' : 'Mark as paid'}
          </DialogTitle>
          <DialogDescription className="text-sm">{summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-sm">{es ? 'Método de pago' : 'Payment method'}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHOD_VALUES.map((m, idx) => (
                  <SelectItem key={m} value={m}>{es ? METHODS_ES[idx] : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {target.kind === 'lessons'
              ? (es
                  ? 'Se usará la fecha original de cada clase como fecha de pago.'
                  : "Each lesson's original date will be used as the payment date.")
              : (es
                  ? 'Se usará la fecha original de cada paquete como fecha de pago.'
                  : "Each package's original date will be used as the payment date.")}
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">{es ? 'Notas (opcional)' : 'Notes (optional)'}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={es ? 'Referencia, # de confirmación, etc.' : 'Reference, confirmation #, etc.'}
              className="min-h-[60px]"
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full bg-success text-success-foreground hover:bg-success/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Confirmar pagos' : 'Confirm payments')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}