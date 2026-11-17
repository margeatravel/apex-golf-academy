import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  coachId: string;
  onPaymentAdded: () => void;
}

const PAYMENT_METHODS = ['Cash', 'Transfer', 'Card', 'Stripe', 'Other'];
const CONCEPTS = ['Lesson Package', 'Individual Lesson', 'Membership', 'Other'];

export function AddPaymentModal({ open, onOpenChange, studentId, coachId, onPaymentAdded }: AddPaymentModalProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [concept, setConcept] = useState('Individual Lesson');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!date || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid date and amount');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('payments' as any).insert({
        student_id: studentId,
        coach_id: coachId,
        payment_date: format(date, 'yyyy-MM-dd'),
        amount: parsedAmount,
        payment_method: paymentMethod,
        concept,
        notes: notes || null,
      });

      if (error) throw error;

      toast.success('Payment recorded successfully');
      onPaymentAdded();
      onOpenChange(false);
      setAmount('');
      setNotes('');
      setDate(new Date());
      setPaymentMethod('Cash');
      setConcept('Individual Lesson');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Add Payment Manually</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
                    !date && 'text-[#F5F0E8]/40'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Amount (USD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F5F0E8]/50">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-7 bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1f18] border-white/10">
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m} value={m} className="text-[#F5F0E8]">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Concept */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Concept</Label>
            <Select value={concept} onValueChange={setConcept}>
              <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1f18] border-white/10">
                {CONCEPTS.map(c => (
                  <SelectItem key={c} value={c} className="text-[#F5F0E8]">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional details..."
              className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 min-h-[70px]"
            />
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || !amount}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving...' : 'Record Payment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
