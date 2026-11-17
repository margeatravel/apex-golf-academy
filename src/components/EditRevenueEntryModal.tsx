import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface RevenueEntry {
  id: string;
  date: string;
  label: string;
  type: string;
  amount: number;
  source: 'lesson' | 'payment' | 'package';
  rawId: string; // actual DB row id
  paymentMethod?: string;
  notes?: string;
}

interface EditRevenueEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RevenueEntry | null;
  onSaved: () => void;
}

export function EditRevenueEntryModal({ open, onOpenChange, entry, onSaved }: EditRevenueEntryModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (entry && open) {
      setAmount(String(entry.amount));
      setDate(entry.date);
      setPaymentMethod(entry.paymentMethod || entry.type || 'Cash');
      setNotes(entry.notes || '');
    }
  }, [entry, open]);

  if (!entry) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const amountNum = Number(amount) || 0;
      if (!Number.isFinite(amountNum) || amountNum < 0) throw new Error('Amount must be empty, 0, or a positive value');
      if (entry.source !== 'lesson' && amountNum <= 0) throw new Error('Amount must be greater than 0');

      if (entry.source === 'package') {
        const { error } = await supabase.from('package_payments').update({
          amount: amountNum,
          payment_date: date,
          payment_method: paymentMethod,
          notes: notes || null,
        }).eq('id', entry.rawId);
        if (error) throw error;
      } else if (entry.source === 'payment') {
        const { error } = await supabase.from('payments').update({
          amount: amountNum,
          payment_date: date,
          payment_method: paymentMethod,
          notes: notes || null,
          concept: entry.label || 'Payment',
        }).eq('id', entry.rawId);
        if (error) throw error;
      } else if (entry.source === 'lesson') {
        const { error } = await supabase.from('lessons').update({
          revenue: amountNum,
        }).eq('id', entry.rawId);
        if (error) throw error;
      }

      toast({ title: 'Updated', description: 'Revenue entry updated successfully.' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {entry.source === 'lesson' ? 'Lesson Revenue' : 'Payment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Amount (MXN)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0} />
          </div>
          <div>
            <Label>Date</Label>
            <DateField value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {entry.source !== 'lesson' && (
            <>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                    <SelectItem value="Stripe">Stripe</SelectItem>
                    <SelectItem value="Import">Import</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}