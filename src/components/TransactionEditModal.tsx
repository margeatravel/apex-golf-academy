import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fmtMXNStr } from '@/lib/formatCurrency';
import { Trash2, Archive, Save, Tag, User, FileText, CreditCard, Calendar as CalendarIcon } from 'lucide-react';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';

interface TransactionEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: any;
  onSaved: () => void;
}

export function TransactionEditModal({ open, onOpenChange, transaction, onSaved }: TransactionEditModalProps) {
  const [productName, setProductName] = useState('');
  const [purchaseType, setPurchaseType] = useState('');
  const [reportingCategory, setReportingCategory] = useState('');
  const [classification, setClassification] = useState('unknown');
  const [isGolfRevenue, setIsGolfRevenue] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [paidAt, setPaidAt] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setProductName(transaction.product_name || '');
      setPurchaseType(transaction.purchase_type || 'unknown');
      setReportingCategory(transaction.reporting_category || 'uncategorized');
      setClassification(transaction.classification || 'unknown');
      setIsGolfRevenue(transaction.is_golf_revenue ?? true);
      setStudentId(transaction.student_id || '');
      setAdminNotes(transaction.admin_notes || '');
      // Initialize date field from paid_at, fallback to created_at.
      // datetime-local expects "YYYY-MM-DDTHH:mm" in local time.
      const src = transaction.paid_at || transaction.created_at;
      if (src) {
        const d = new Date(src);
        const pad = (n: number) => String(n).padStart(2, '0');
        setPaidAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      } else {
        setPaidAt('');
      }
    }
  }, [transaction]);

  if (!transaction) return null;

  const txDate = paidAt
    ? new Date(paidAt)
    : transaction.paid_at
      ? new Date(transaction.paid_at)
      : new Date(transaction.created_at);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('stripe_payments').update({
      product_name: productName || null,
      purchase_type: purchaseType,
      reporting_category: reportingCategory,
      classification,
      is_golf_revenue: isGolfRevenue,
      admin_override: true,
      admin_notes: adminNotes || null,
      student_id: studentId || null,
      student_matched: !!studentId,
      paid_at: paidAt ? new Date(paidAt).toISOString() : null,
    }).eq('id', transaction.id);
    setSaving(false);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Transaction updated');
    onSaved();
    onOpenChange(false);
  };

  const handleArchive = async () => {
    const { error } = await supabase.from('stripe_payments').update({ is_archived: true }).eq('id', transaction.id);
    if (error) { toast.error('Failed to archive'); return; }
    toast.success('Transaction archived');
    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('stripe_payments').delete().eq('id', transaction.id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Transaction deleted');
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Edit Transaction
          </DialogTitle>
          <DialogDescription>
            {format(txDate, 'MMM d, yyyy h:mm a')} • {fmtMXNStr(transaction.amount)} {(transaction.currency || 'mxn').toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        {/* Read-only info */}
        <div className="space-y-1 text-sm bg-muted/50 rounded-lg p-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Stripe Ref</span><span className="font-mono text-xs">{transaction.stripe_payment_intent_id || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={transaction.status === 'succeeded' ? 'default' : 'destructive'} className="text-xs">{transaction.status}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{transaction.source}</span></div>
          {transaction.student_email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-xs">{transaction.student_email}</span></div>}
        </div>

        <div className="space-y-4">
          {/* Golf Classification */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Classification</label>
            <div className="grid grid-cols-3 gap-2">
              {(['golf', 'non_golf', 'unknown'] as const).map(c => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={classification === c ? 'default' : 'outline'}
                  className={classification === c ? (c === 'golf' ? 'bg-green-600 hover:bg-green-700' : c === 'non_golf' ? 'bg-muted-foreground hover:bg-muted-foreground/80' : '') : ''}
                  onClick={() => {
                    setClassification(c);
                    setIsGolfRevenue(c === 'golf' || c === 'unknown');
                  }}
                >
                  {c === 'golf' ? '⛳ Golf' : c === 'non_golf' ? '🚫 Non-Golf' : '❓ Unknown'}
                </Button>
              ))}
            </div>
          </div>

          {/* Student match */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Student</label>
            <SearchableStudentSelect value={studentId} onValueChange={setStudentId} />
          </div>

          {/* Product name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Product Name</label>
            <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Individual Lesson" />
          </div>

          {/* Purchase type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Purchase Type</label>
            <Select value={purchaseType} onValueChange={setPurchaseType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual_lesson">Individual Lesson</SelectItem>
                <SelectItem value="lesson_package">Lesson Package</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="video_analysis">Video Analysis</SelectItem>
                <SelectItem value="one_time">One-Time</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reporting Category</label>
            <Select value={reportingCategory} onValueChange={setReportingCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual_lesson">Individual Lesson</SelectItem>
                <SelectItem value="package">Package</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="video_analysis">Video Analysis</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Admin notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Admin Notes</label>
            <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Notes about this transaction…" rows={2} />
          </div>

          {/* Date paid */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Date Paid</label>
            <Input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">When this payment was actually received. Updates the date shown in the revenue ledger.</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <div className="flex gap-2 mr-auto">
            <Button variant="outline" size="sm" onClick={handleArchive} className="gap-1.5 text-orange-600 hover:text-orange-700">
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove the record. Consider archiving instead to preserve audit history.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
