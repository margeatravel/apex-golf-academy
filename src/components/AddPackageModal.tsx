import { useState, useEffect } from 'react';
import { FamilyTargetSelect } from '@/components/family/FamilyTargetSelect';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { SharedStudentsSelect } from '@/components/SharedStudentsSelect';
import { Users } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AddPackageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPackageAdded?: () => void;
  preselectedStudentId?: string;
}

const PACKAGE_SIZES = [5, 10, 20, 30, 40] as const;

type PaymentMode = 'paid' | 'partial' | 'pending';

export function AddPackageModal({ open, onOpenChange, onPackageAdded, preselectedStudentId }: AddPackageModalProps) {
  const { t } = useLanguage();
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [numLessons, setNumLessons] = useState<number>(10);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pending');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentDate, setPaymentDate] = useState<Date>();
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Destination: the student, or one of their linked family members.
  const selectedStudentId = preselectedStudentId || studentId;
  const [familyTargetId, setFamilyTargetId] = useState('');
  const uploadTargetId = familyTargetId || selectedStudentId;

  useEffect(() => {
    setFamilyTargetId('');
  }, [selectedStudentId]);



  const priceNum = parseFloat(price) || 0;
  const paidNum = paymentMode === 'paid' ? priceNum : paymentMode === 'partial' ? (parseFloat(amountPaid) || 0) : 0;
  const remaining = Math.max(0, priceNum - paidNum);

  const computedStatus = paidNum <= 0 ? 'pending' : remaining <= 0 ? 'paid' : 'partial';

  const resetForm = () => {
    setStudentId(preselectedStudentId || '');
    setNumLessons(10);
    setPrice('');
    setDescription('');
    setNotes('');
    setPaymentMode('pending');
    setAmountPaid('');
    setPaymentDate(undefined);
    setPaymentNote('');
    setPaymentMethod('Cash');
    setSharedWith([]);
    setFamilyTargetId('');
  };

  const handleSave = async () => {
    const targetStudentId = uploadTargetId;
    if (!targetStudentId) { toast.error('Please select a student'); return; }
    if (!price || priceNum <= 0) { toast.error('Please enter a valid price'); return; }
    if (paymentMode === 'partial' && paidNum > priceNum) { toast.error('Amount paid cannot exceed package price'); return; }

    setSaving(true);
    try {
      const packageName = `${numLessons}-Lesson Package`;
      const { data: pkg, error } = await supabase.from('class_packages').insert({
        user_id: targetStudentId,
        package_size: numLessons,
        classes_remaining: numLessons,
        classes_used: 0,
        is_active: true,
        package_name: packageName,
        price: priceNum,
        amount_paid: paidNum,
        payment_status: computedStatus,
        payment_date: paidNum > 0 && paymentDate ? format(paymentDate, 'yyyy-MM-dd') : null,
      } as any).select('id').single();

      if (error) throw error;

      // Insert package_members rows: owner + any shared students
      if (pkg) {
        const memberRows = [
          { package_id: pkg.id, student_id: targetStudentId },
          ...sharedWith
            .filter((id) => id !== targetStudentId)
            .map((id) => ({ package_id: pkg.id, student_id: id })),
        ];
        await supabase.from('package_members' as any).insert(memberRows);
      }

      // If there's a payment, create a payment record
      if (paidNum > 0 && pkg) {
        try {
          const { error: payErr } = await supabase.from('package_payments' as any).insert({
            package_id: pkg.id,
            amount: paidNum,
            payment_date: paymentDate ? format(paymentDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
            payment_method: paymentMethod,
            notes: paymentNote || null,
          });
          if (payErr) throw payErr;
        } catch (payErr: any) {
          // The class_packages trigger will auto-create a ledger row if this fails,
          // but warn the coach so they can verify or add a custom note manually.
          console.warn('Failed to insert explicit package_payments row:', payErr);
          toast.warning('Package created, but payment record had an issue — please verify the revenue ledger.');
        }
      }

      // Notify student via email (non-blocking)
      try {
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', targetStudentId)
          .maybeSingle();
        if (studentProfile?.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: studentProfile.email,
              studentName: studentProfile.full_name || 'there',
              notificationType: 'package_added',
              packageSize: numLessons,
              lessonsRemaining: numLessons,
            },
          });
          console.log('Package added email sent to', studentProfile.email);
        }
      } catch (emailErr) {
        console.warn('Failed to send package added email:', emailErr);
      }

      // Notify all admins (in-app) — non-blocking
      try {
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', targetStudentId)
          .maybeSingle();
        const studentName = studentProfile?.full_name || 'A student';

        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          const rows = admins.map((a: any) => ({
            user_id: a.user_id,
            type: 'package_added',
            title: '📦 Package added',
            message: `${numLessons}-lesson package added to ${studentName}${priceNum > 0 ? ` (${fmtMXNStr(priceNum)})` : ''}`,
            link: `/admin/student/${targetStudentId}`,
            metadata: { package_id: pkg?.id, student_id: targetStudentId, student_name: studentName, package_size: numLessons, amount: priceNum > 0 ? fmtMXNStr(priceNum) : undefined, source: 'manual' },
          }));
          await supabase.from('notifications').insert(rows);
        }

        // Email admin@apexgolf.com.mx — package purchased (non-blocking)
        try {
          await supabase.functions.invoke('notify-admin', {
            body: {
              eventType: 'package_purchased',
              studentName,
              studentEmail: studentProfile?.email,
              packageName: `${numLessons}-lesson package`,
              amount: priceNum > 0 ? priceNum : undefined,
              currency: 'MXN',
              packageId: pkg?.id,
            },
          });
        } catch (e) {
          console.warn('notify-admin (package_purchased) failed:', e);
        }
      } catch (notifErr) {
        console.warn('Failed to create admin notifications:', notifErr);
      }

      toast.success('Package created successfully');
      onPackageAdded?.();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create package');
    } finally {
      setSaving(false);
    }
  };

  const targetStudentId = preselectedStudentId || studentId;

  const modeButtons: { mode: PaymentMode; label: string; emoji: string; color: string; border: string }[] = [
    { mode: 'paid', label: 'Paid', emoji: '✅', color: 'rgba(74,124,89,0.3)', border: '#4a7c59' },
    { mode: 'partial', label: 'Partial payment', emoji: '🔶', color: 'rgba(234,179,8,0.2)', border: '#eab308' },
    { mode: 'pending', label: 'Unpaid', emoji: '⏳', color: 'rgba(239,68,68,0.2)', border: '#ef4444' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Create Package</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Student Selector */}
          {!preselectedStudentId && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Student *</Label>
              <SearchableStudentSelect value={studentId} onValueChange={setStudentId} />
            </div>
          )}

          {/* Family destination — only when the student has linked family */}
          {selectedStudentId && (
            <FamilyTargetSelect
              studentId={selectedStudentId}
              value={uploadTargetId}
              onChange={(id) => setFamilyTargetId(id)}
            />
          )}

          {/* Package Size Cards */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Package Size *</Label>
            <div className="grid grid-cols-5 gap-2">
              {PACKAGE_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setNumLessons(size)}
                  className="relative flex flex-col items-center py-3 rounded-xl text-center transition-all"
                  style={{
                    background: numLessons === size ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                    border: numLessons === size ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {numLessons === size && (
                    <div className="absolute top-1 right-1 h-4 w-4 rounded-full flex items-center justify-center" style={{ background: '#4a7c59' }}>
                      <Check className="h-2.5 w-2.5" style={{ color: '#F5F0E8' }} />
                    </div>
                  )}
                  <span className="text-xl font-bold" style={{ color: '#E8D5B0' }}>{size}</span>
                  <span className="text-[10px] mt-0.5" style={{ color: '#F5F0E8', opacity: 0.5 }}>lessons</span>
                </button>
              ))}
            </div>
          </div>

          {/* Shared with — multi-student selector */}
          {targetStudentId && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Shared with (optional)
              </Label>
              <SharedStudentsSelect
                value={sharedWith}
                onValueChange={setSharedWith}
                excludeId={targetStudentId}
                placeholder={t('ui.packages.addSharedPh')}
              />
              {sharedWith.length > 0 && (
                <p className="text-[10px] text-[#E8D5B0]/70">
                  Lessons will be deducted from the same package regardless of who takes them.
                </p>
              )}
            </div>
          )}


          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Package Price (MXN) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
              <Input
                type="number" min="0" step="1"
                value={price} onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#E8D5B0', opacity: 0.4 }}>MXN</span>
            </div>
          </div>

          {/* Payment Mode */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Payment Status *</Label>
            <div className="grid grid-cols-3 gap-2">
              {modeButtons.map(b => (
                <button
                  key={b.mode}
                  onClick={() => { setPaymentMode(b.mode); if (b.mode === 'paid') setAmountPaid(''); }}
                  className="py-2 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: paymentMode === b.mode ? b.color : 'transparent',
                    border: paymentMode === b.mode ? `1px solid ${b.border}` : '1px solid rgba(255,255,255,0.2)',
                    color: '#F5F0E8',
                  }}
                >
                  {b.emoji} {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Partial payment amount */}
          {paymentMode === 'partial' && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Amount Paid (MXN)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
                <Input
                  type="number" min="0" step="1"
                  value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7"
                />
              </div>
              {priceNum > 0 && paidNum > 0 && (
                <p className="text-xs mt-1" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                  Pending: {fmtMXN(remaining)}
                </p>
              )}
            </div>
          )}

          {/* Payment date (if paying something) */}
          {paymentMode !== 'pending' && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(
                    'w-full justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
                    !paymentDate && 'text-[#F5F0E8]/40'
                  )}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                  <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Payment method */}
          {paymentMode !== 'pending' && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1f18] border-white/10">
                  {['Cash', 'Transfer', 'Card', 'Other'].map(m => (
                    <SelectItem key={m} value={m} className="text-[#F5F0E8]">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Balance summary */}
          {priceNum > 0 && (
            <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: '#F5F0E8', opacity: 0.6 }}>{t('ui.packages.packageTotal')}</span>
                <span style={{ color: '#E8D5B0' }}>{fmtMXN(priceNum)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: '#F5F0E8', opacity: 0.6 }}>Paid</span>
                <span style={{ color: '#4a7c59' }}>{fmtMXN(paidNum)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span style={{ color: '#F5F0E8', opacity: 0.8 }}>{t('ui.packages.pending')}</span>
                <span style={{ color: remaining > 0 ? '#ef4444' : '#4a7c59' }}>{fmtMXN(remaining)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Notes</Label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={t('ui.packages.internalNotesPh')}
              className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 min-h-[60px]"
            />
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || !targetStudentId || !price || priceNum <= 0}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving...' : `Create ${numLessons}-Lesson Package`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
