import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fmtMXNStr } from '@/lib/formatCurrency';

export type MarkPaidTarget =
  | { kind: 'lesson'; id: string; label: string; amount: number; studentId?: string | null }
  | { kind: 'package'; id: string; label: string; balance: number; price: number; amountPaid: number; studentId?: string | null };

const METHODS = ['Cash', 'Transfer', 'Card', 'Stripe', 'Other'];

interface Props {
  target: MarkPaidTarget | null;
  onOpenChange: (open: boolean) => void;
  onMarked: () => void;
}

export function MarkARPaidModal({ target, onOpenChange, onMarked }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Transfer');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const defaultAmt = target.kind === 'lesson' ? target.amount : target.balance;
    setAmount(String(defaultAmt));
    setMethod('Transfer');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      if (target.kind === 'lesson') {
        const { error } = await supabase
          .from('lessons')
          .update({ revenue: amt, payment_method: method })
          .eq('id', target.id);
        if (error) throw error;

        // Optional bookkeeping in payments table
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
              amount: amt,
              payment_method: method,
              concept: 'Individual Lesson',
              notes: notes || null,
            });
          }
        }
      } else {
        const newPaid = Number(target.amountPaid) + amt;
        const newStatus = newPaid >= Number(target.price) ? 'paid' : 'partial';
        const { error } = await supabase
          .from('class_packages')
          .update({
            amount_paid: newPaid,
            payment_status: newStatus,
            payment_date: date,
          })
          .eq('id', target.id);
        if (error) throw error;

        await supabase.from('package_payments').insert({
          package_id: target.id,
          amount: amt,
          payment_date: date,
          payment_method: method,
          notes: notes || null,
        });
      }
      toast.success('Payment recorded');
      onMarked();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const open = !!target;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Mark as Paid
          </DialogTitle>
          {target && (
            <DialogDescription className="text-sm">
              {target.label}
              {target.kind === 'package' && (
                <> — balance {fmtMXNStr(target.balance)} of {fmtMXNStr(target.price)}</>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Amount received (MXN)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {target?.kind === 'package' && Number(amount) < target.balance && Number(amount) > 0 && (
              <p className="text-[11px] text-warning">Partial payment — remaining balance: {fmtMXNStr(target.balance - Number(amount))}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Payment date</Label>
            <DateField value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference, confirmation #, etc."
              className="min-h-[60px]"
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {saving ? 'Saving…' : 'Confirm payment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
