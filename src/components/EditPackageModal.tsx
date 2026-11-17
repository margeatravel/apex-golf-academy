import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fmtMXN } from '@/lib/formatCurrency';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SharedStudentsSelect } from '@/components/SharedStudentsSelect';
import { Users, Star } from 'lucide-react';
import { useStudentsList } from '@/components/SearchableStudentSelect';
import { useLanguage } from '@/contexts/LanguageContext';
import { StartsOnField } from '@/components/recurring/StartsOnField';

interface EditPackageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: any;
  onSaved: () => void;
}

const PACKAGE_SIZES = [5, 10, 20, 30, 40] as const;
type PaymentMode = 'paid' | 'partial' | 'pending';

export function EditPackageModal({ open, onOpenChange, pkg, onSaved }: EditPackageModalProps) {
  const { t } = useLanguage();
  const [packageSize, setPackageSize] = useState(pkg?.package_size || 0);
  const [price, setPrice] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pending');
  // Lessons linked to this package (all members) — drives the computed counts.
  const [pkgLessons, setPkgLessons] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  // Full member list (includes the primary contact). Source of truth.
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [primaryContactId, setPrimaryContactId] = useState<string>('');
  const [initialOwnerId, setInitialOwnerId] = useState<string>('');
  const [initialMembers, setInitialMembers] = useState<string[]>([]);
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(undefined);
  const [linkedSlots, setLinkedSlots] = useState<{ id: string; student_id: string; starts_on: string | null }[]>([]);
  const [startsOn, setStartsOn] = useState('');
  const [initialStartsOn, setInitialStartsOn] = useState('');
  const { toast } = useToast();
  const { data: studentsList = [] } = useStudentsList();

  useEffect(() => {
    if (pkg && open) {
      const pkgPrice = Number(pkg.price) || 0;
      const pkgPaid = Number(pkg.amount_paid) || 0;
      const pkgPending = Math.max(0, pkgPrice - pkgPaid);

      setPackageSize(pkg.package_size || 0);
      setPrice(pkgPrice > 0 ? String(pkgPrice) : '');
      setPkgLessons([]);
      (async () => {
        const { data } = await supabase
          .from('lessons')
          .select('id, package_id, status, lesson_date, lesson_type')
          .eq('package_id', pkg.id);
        setPkgLessons((data as any[]) ?? []);
      })();

      if (pkgPaid <= 0) {
        setPaymentMode('pending');
        setAmountPaid('');
      } else if (pkgPending <= 0) {
        setPaymentMode('paid');
        setAmountPaid(String(pkgPaid));
      } else {
        setPaymentMode('partial');
        setAmountPaid(String(pkgPaid));
      }

      // Initialize payment date from existing package
      setPaymentDate(pkg.payment_date ? new Date(pkg.payment_date + 'T00:00:00') : undefined);

      // Linked recurring slots → "Starting from"
      setLinkedSlots([]);
      setStartsOn('');
      setInitialStartsOn('');
      (async () => {
        const { data } = await supabase
          .from('recurring_lesson_slots')
          .select('id, student_id, starts_on')
          .eq('package_id', pkg.id)
          .eq('is_active', true);
        const rows = ((data as any[]) ?? []);
        setLinkedSlots(rows);
        const dates = rows.map((r) => (r.starts_on ? String(r.starts_on).substring(0, 10) : '')).filter(Boolean).sort();
        const d = dates[0] || '';
        setStartsOn(d);
        setInitialStartsOn(d);
      })();

      // Load existing shared members (owner is implicit, members table holds the rest)
      (async () => {
        const { data: members } = await supabase
          .from('package_members' as any)
          .select('student_id')
          .eq('package_id', pkg.id);
        const shared = ((members || []) as any[])
          .map((m: any) => m.student_id)
          .filter((id: string) => id !== pkg.user_id);
        const full = [pkg.user_id, ...shared];
        setMemberIds(full);
        setPrimaryContactId(pkg.user_id);
        setInitialOwnerId(pkg.user_id);
        setInitialMembers(shared);
      })();
    }
  }, [pkg, open]);

  // Derived: "other members" view that the SharedStudentsSelect manages (excludes primary)
  const otherMembers = memberIds.filter((id) => id !== primaryContactId);
  const handleOtherMembersChange = (next: string[]) => {
    // Keep primary as a member; replace the rest
    setMemberIds([primaryContactId, ...next.filter((id) => id !== primaryContactId)]);
  };
  const studentLabel = (id: string) => {
    const s = studentsList.find((x: any) => x.id === id);
    return s?.full_name || s?.email || 'Student';
  };

  const priceNum = parseFloat(price) || 0;
  const paidNum = paymentMode === 'paid' ? priceNum : paymentMode === 'partial' ? (parseFloat(amountPaid) || 0) : 0;
  const pendingNum = Math.max(0, priceNum - paidNum);
  const computedStatus = paidNum <= 0 ? 'pending' : pendingNum <= 0 ? 'paid' : 'partial';

  // Single source of truth — never read classes_used / classes_remaining.
  const counts = computePackageCounts(
    { id: pkg?.id, package_size: packageSize, classes_used: pkg?.classes_used, classes_remaining: pkg?.classes_remaining },
    pkgLessons,
  );
  const classesUsed = counts.used;
  const classesRemaining = counts.remaining;

  const handleSave = async () => {
    if (!pkg?.id) return;
    setSaving(true);
    try {
      // Keep the legacy columns in sync with the computed values (write-only).
      const remaining = classesRemaining;
      const previousPaid = Number(pkg.amount_paid) || 0;
      const paymentDelta = paidNum - previousPaid;
      const effectiveDate = paymentDate ?? (paidNum > 0 ? new Date() : null);
      const dateStr = effectiveDate ? format(effectiveDate, 'yyyy-MM-dd') : null;

      const { error } = await supabase.from('class_packages').update({
        package_size: packageSize,
        package_name: packageSize > 0 ? `${packageSize}-Lesson Package` : pkg.package_name,
        price: priceNum,
        amount_paid: paidNum,
        payment_status: computedStatus,
        classes_used: classesUsed,
        classes_remaining: remaining,
        is_active: remaining > 0,
        payment_date: paidNum > 0 ? dateStr : null,
      }).eq('id', pkg.id);

      if (error) throw error;

      // If money was added (paid increased), record it as a package_payment so Revenue picks it up on the chosen date
      if (paymentDelta > 0 && dateStr) {
        // Dedup check: avoid inserting a duplicate if one already exists for same package/amount/date
        const { data: existing } = await supabase.from('package_payments')
          .select('id')
          .eq('package_id', pkg.id)
          .eq('amount', paymentDelta)
          .eq('payment_date', dateStr)
          .limit(1);

        if (!existing || existing.length === 0) {
          const { error: payErr } = await supabase.from('package_payments').insert({
            package_id: pkg.id,
            amount: paymentDelta,
            payment_date: dateStr,
            payment_method: 'Cash',
            notes: 'Recorded via package edit',
          });
          if (payErr) {
            console.error('Failed to insert package_payment row', payErr);
          }
        }
      }

      // Date-only edit (no new money, package still paid): sync the date on the
      // existing package_payments row(s) so Revenue reflects the new date.
      if (paymentDelta === 0 && paidNum > 0 && dateStr) {
        const { data: existingRows } = await supabase
          .from('package_payments')
          .select('id, payment_date, amount, created_at')
          .eq('package_id', pkg.id)
          .order('created_at', { ascending: false });

        if (!existingRows || existingRows.length === 0) {
          // Legacy package paid before package_payments existed — anchor a row now
          const { error: insErr } = await supabase.from('package_payments').insert({
            package_id: pkg.id,
            amount: paidNum,
            payment_date: dateStr,
            payment_method: 'Cash',
            notes: 'Backfilled via package date edit',
          });
          if (insErr) console.error('Failed to backfill package_payment row', insErr);
        } else {
          // Update the most recent payment's date so Revenue shows the new date
          const target = existingRows[0];
          if (target.payment_date !== dateStr) {
            const { error: updErr } = await supabase
              .from('package_payments')
              .update({ payment_date: dateStr })
              .eq('id', target.id);
            if (updErr) console.error('Failed to update package_payment date', updErr);
          }
        }
      }

      // Status flipped to pending: drop ghost package_payments so Revenue is consistent
      if (paidNum === 0) {
        const { error: delErr } = await supabase
          .from('package_payments')
          .delete()
          .eq('package_id', pkg.id);
        if (delErr) console.error('Failed to clear package_payments on pending flip', delErr);
      }

      // Primary-contact transfer: if user changed who the package belongs to, swap class_packages.user_id
      if (primaryContactId && primaryContactId !== initialOwnerId) {
        const { error: ownerErr } = await supabase
          .from('class_packages')
          .update({ user_id: primaryContactId })
          .eq('id', pkg.id);
        if (ownerErr) throw ownerErr;

        // Re-attribute lessons of this package that still pointed at the previous primary
        await supabase
          .from('lessons')
          .update({ student_id: primaryContactId })
          .eq('package_id', pkg.id)
          .eq('student_id', initialOwnerId);
      }

      // Sync package_members: rows are everyone EXCEPT the current primary contact (owner is implicit)
      const desiredMembers = memberIds.filter((id) => id !== primaryContactId);

      // Anyone currently in package_members (including the old owner if they were never there, and the new owner if they were)
      const { data: currentRows } = await supabase
        .from('package_members' as any)
        .select('student_id')
        .eq('package_id', pkg.id);
      const currentMemberSet = new Set(((currentRows || []) as any[]).map((r: any) => r.student_id));

      // The new primary should NOT be in package_members
      if (currentMemberSet.has(primaryContactId)) {
        await supabase
          .from('package_members' as any)
          .delete()
          .eq('package_id', pkg.id)
          .eq('student_id', primaryContactId);
        currentMemberSet.delete(primaryContactId);
      }

      const toAdd = desiredMembers.filter((id) => !currentMemberSet.has(id));
      const toRemove = Array.from(currentMemberSet).filter((id) => !desiredMembers.includes(id));

      if (toAdd.length > 0) {
        await supabase.from('package_members' as any).insert(
          toAdd.map((student_id) => ({ package_id: pkg.id, student_id }))
        );
      }
      if (toRemove.length > 0) {
        await supabase
          .from('package_members' as any)
          .delete()
          .eq('package_id', pkg.id)
          .in('student_id', toRemove);
      }

      // "Starting from" change on linked recurring slots.
      if (linkedSlots.length > 0 && startsOn && startsOn !== initialStartsOn) {
        const ids = linkedSlots.map((s) => s.id);
        await supabase.from('recurring_lesson_slots').update({ starts_on: startsOn } as any).in('id', ids);
        // Only auto-generated, still-scheduled lessons before the new date go away.
        await supabase
          .from('lessons')
          .delete()
          .in('recurring_slot_id', ids)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .lt('lesson_date', startsOn);
        const studentIds = Array.from(new Set(linkedSlots.map((s) => s.student_id).filter(Boolean)));
        for (const sid of studentIds) {
          await supabase.functions.invoke('generate-recurring-lessons', { body: { student_id: sid } });
        }
      }

      toast({ title: 'Package updated', description: 'Changes saved successfully.' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSizeChange = (size: number) => setPackageSize(size);

  const modeButtons: { mode: PaymentMode; label: string; emoji: string; color: string; border: string }[] = [
    { mode: 'paid', label: 'Paid', emoji: '✅', color: 'rgba(74,124,89,0.3)', border: '#4a7c59' },
    { mode: 'partial', label: 'Parcial', emoji: '🔶', color: 'rgba(234,179,8,0.2)', border: '#eab308' },
    { mode: 'pending', label: 'Pending', emoji: '⏳', color: 'rgba(239,68,68,0.2)', border: '#ef4444' },
  ];

  const handlePaymentModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === 'paid') {
      setAmountPaid(price);
      if (!paymentDate) setPaymentDate(new Date());
    } else if (mode === 'partial') {
      if (!paymentDate) setPaymentDate(new Date());
    } else {
      // pending → clear date
      setPaymentDate(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Edit Package</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Package Size */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Package Size</Label>
            <div className="grid grid-cols-5 gap-2">
              {PACKAGE_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => handleSizeChange(size)}
                  className="relative flex flex-col items-center py-3 rounded-xl text-center transition-all"
                  style={{
                    background: packageSize === size ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                    border: packageSize === size ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {packageSize === size && (
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

          {/* Lessons Used / Remaining */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Lessons Used</Label>
              <Input
                type="number" min="0"
                value={classesUsed}
                disabled
                className="bg-white/5 border-white/10 text-[#F5F0E8] opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Remaining</Label>
              <Input
                type="number" min="0"
                value={classesRemaining}
                disabled
                className="bg-white/5 border-white/10 text-[#F5F0E8] opacity-60"
              />
            </div>
          </div>

          {/* Members — unified editor (owner is just a primary contact label) */}
          <div className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Label className="text-[#F5F0E8]/80 text-sm flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Members
            </Label>

            {/* Primary contact picker (must be one of the members) */}
            <div className="space-y-1">
              <Label className="text-[#F5F0E8]/60 text-[11px] flex items-center gap-1">
                <Star className="h-3 w-3" style={{ color: '#F0C040' }} /> Primary contact (used for billing & lesson history)
              </Label>
              <Select value={primaryContactId} onValueChange={setPrimaryContactId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8] text-sm">
                  <SelectValue placeholder="Pick primary contact" />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1f18] border-white/10 text-[#F5F0E8] z-[60]">
                  {memberIds.map((id) => (
                    <SelectItem key={id} value={id}>{studentLabel(id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Other members */}
            <div className="space-y-1">
              <Label className="text-[#F5F0E8]/60 text-[11px]">Other members sharing this package</Label>
              <SharedStudentsSelect
                value={otherMembers}
                onValueChange={handleOtherMembersChange}
                excludeId={primaryContactId}
                placeholder={t('ui.packages.editSharedPh')}
              />
            </div>

            <p className="text-[10px] text-[#E8D5B0]/70 leading-snug">
              Lessons are deducted from the same package regardless of who takes them. To remove the current primary contact, switch primary to someone else first, then deselect them from the list.
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Label className="text-[#F5F0E8]/80 text-sm">Package Status</Label>
            <span className="text-sm" style={{ color: (classesRemaining > 0) ? '#4a7c59' : '#F5F0E8', opacity: (classesRemaining > 0) ? 1 : 0.7 }}>
              {(classesRemaining > 0) ? 'Active' : 'Completed'}
            </span>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Package Total (MXN) — actual sold price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
              <Input
                type="number" min="0" step="1"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#E8D5B0', opacity: 0.4 }}>MXN</span>
            </div>
          </div>

          {/* Payment Mode */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Payment Status</Label>
            <div className="grid grid-cols-3 gap-2">
              {modeButtons.map(b => (
                <button
                  key={b.mode}
                  onClick={() => handlePaymentModeChange(b.mode)}
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

          {/* Partial amount */}
          {paymentMode === 'partial' && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Amount Paid (MXN)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
                <Input
                  type="number" min="0" step="1"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7"
                />
              </div>
            </div>
          )}

          {/* Payment Date — visible when there's any payment */}
          {(paymentMode === 'paid' || paymentMode === 'partial') && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-white/5 border-white/10 text-[#F5F0E8] hover:bg-white/10 hover:text-[#F5F0E8]',
                      !paymentDate && 'text-[#F5F0E8]/50'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, 'PPP') : <span>Select date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={setPaymentDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[10px] text-[#F5F0E8]/50">
                Used for revenue reporting. Defaults to today when marking Paid.
              </p>
            </div>
          )}

          {linkedSlots.length > 0 && (
            <StartsOnField
              value={startsOn}
              onChange={setStartsOn}
              labelClassName="text-[#F5F0E8]/70 text-sm"
            />
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
                <span style={{ color: '#F5F0E8', opacity: 0.8 }}>Pending</span>
                <span style={{ color: pendingNum > 0 ? '#ef4444' : '#4a7c59' }}>{fmtMXN(pendingNum)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}
            className="border-white/10 text-[#F5F0E8] hover:bg-white/10">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
