import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fmtMXNStr } from '@/lib/formatCurrency';

export type EditARTarget =
  | {
      kind: 'lesson';
      id: string;
      label: string;
      amount: number;
      currency?: string;
      studentId?: string | null;
    }
  | {
      kind: 'package';
      id: string;
      label: string;
      price: number;
      amountPaid: number;
      studentId?: string | null;
    };

const METHODS = ['Cash', 'Transfer', 'Card', 'Stripe', 'Other'];
type PayStatus = 'pending' | 'partial' | 'paid';

interface Props {
  target: EditARTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditARModal({ target, onOpenChange, onSaved }: Props) {
  // lesson state
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [status, setStatus] = useState<PayStatus>('pending');
  const [partialAmount, setPartialAmount] = useState('');
  // package state
  const [price, setPrice] = useState('');
  const [addPayment, setAddPayment] = useState('');

  const [method, setMethod] = useState('Transfer');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    if (target.kind === 'lesson') {
      setAmount(String(target.amount || ''));
      setCurrency(target.currency || 'MXN');
      setStatus('pending');
      setPartialAmount('');
    } else {
      setPrice(String(target.price || ''));
      setAddPayment('');
    }
    setMethod('Transfer');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      if (target.kind === 'lesson') {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt < 0) throw new Error('Monto inválido');

        const update: Record<string, any> = { revenue: amt, currency };
        if (status === 'paid') {
          update.payment_method = method;
        } else {
          update.payment_method = null;
        }

        const { error } = await supabase.from('lessons').update(update).eq('id', target.id);
        if (error) throw error;

        // For partial: log a payment for the amount received, keep lesson in AR
        if (status === 'partial') {
          const partial = Number(partialAmount);
          if (!Number.isFinite(partial) || partial <= 0) throw new Error('Monto parcial inválido');
          if (partial >= amt) throw new Error('El parcial debe ser menor al total — usa "Pagado"');
          if (target.studentId) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('assigned_coach_id')
              .eq('id', target.studentId)
              .maybeSingle();
            const coachId = (prof as any)?.assigned_coach_id;
            if (coachId) {
              await supabase.from('payments').insert({
                student_id: target.studentId,
                coach_id: coachId,
                payment_date: date,
                amount: partial,
                payment_method: method,
                concept: 'Individual Lesson — parcial',
                notes: notes || null,
              });
            }
          }
        }

        // For paid: optional payments bookkeeping
        if (status === 'paid' && target.studentId) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('assigned_coach_id')
            .eq('id', target.studentId)
            .maybeSingle();
          const coachId = (prof as any)?.assigned_coach_id;
          if (coachId) {
            await supabase.from('payments').insert({
              student_id: target.studentId,
              coach_id: coachId,
              payment_date: date,
              amount: amt,
              payment_method: method,
              concept: 'Individual Lesson',
              notes: notes || null,
            });
          }
        }
      } else {
        // package
        const newPrice = Number(price);
        if (!Number.isFinite(newPrice) || newPrice < 0) throw new Error('Precio inválido');

        const extra = Number(addPayment) || 0;
        if (extra < 0) throw new Error('Pago inválido');

        const newPaid = Number(target.amountPaid) + extra;
        const newStatus =
          newPaid <= 0 ? 'pending' : newPaid >= newPrice ? 'paid' : 'partial';

        const update: Record<string, any> = {
          price: newPrice,
          amount_paid: newPaid,
          payment_status: newStatus,
        };
        if (extra > 0) update.payment_date = date;

        const { error } = await supabase
          .from('class_packages')
          .update(update)
          .eq('id', target.id);
        if (error) throw error;

        if (extra > 0) {
          await supabase.from('package_payments').insert({
            package_id: target.id,
            amount: extra,
            payment_date: date,
            payment_method: method,
            notes: notes || null,
          });
        }
      }

      toast.success('Actualizado');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const open = !!target;
  const isLesson = target?.kind === 'lesson';
  const pkgBalance =
    target?.kind === 'package'
      ? Math.max(0, (Number(price) || 0) - (Number(target.amountPaid) + (Number(addPayment) || 0)))
      : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar cobro
          </DialogTitle>
          {target && <DialogDescription className="text-sm">{target.label}</DialogDescription>}
        </DialogHeader>

        {isLesson && target?.kind === 'lesson' && (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Monto total</Label>
                <Input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PayStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente (sigue en AR)</SelectItem>
                  <SelectItem value="partial">Parcial (sigue en AR con saldo)</SelectItem>
                  <SelectItem value="paid">Pagado (sale de AR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {status === 'partial' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Monto recibido</Label>
                <Input type="number" min="0" step="1" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} />
                {Number(partialAmount) > 0 && Number(amount) > 0 && (
                  <p className="text-[11px] text-warning">
                    Saldo restante: {fmtMXNStr(Math.max(0, Number(amount) - Number(partialAmount)))}
                  </p>
                )}
              </div>
            )}

            {(status === 'paid' || status === 'partial') && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Método de pago</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Fecha de pago</Label>
                  <DateField value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Notas (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
                </div>
              </>
            )}
          </div>
        )}

        {!isLesson && target?.kind === 'package' && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Precio total del paquete (MXN)</Label>
              <Input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Cobrado: {fmtMXNStr(target.amountPaid)} · Saldo actual: {fmtMXNStr(pkgBalance)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Registrar pago recibido (opcional)</Label>
              <Input type="number" min="0" step="1" value={addPayment} onChange={(e) => setAddPayment(e.target.value)} placeholder="0" />
            </div>

            {Number(addPayment) > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Método</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Fecha</Label>
                  <DateField value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Notas (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
                </div>
              </>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full mt-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}