import { useState, useEffect } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CalendarIcon, Loader2, Plus, X, History, CalendarPlus, Package } from 'lucide-react';
import { HourPicker } from '@/components/HourPicker';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { useAssignedStudentIds } from '@/hooks/useAssignedStudentIds';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LessonDateRows,
  makeRow,
  LESSON_TYPES as LESSON_TYPES_SHARED,
  type DateRow,
} from '@/components/LessonDateRows';
import { durationForLessonType } from '@/lib/lessonTypeDuration';
import { fetchLinkablePackages } from '@/lib/recurringSlotPackages';
import { syncPersistedPackageCounters } from '@/lib/syncPackageCounters';



interface AddLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If omitted, a student picker is rendered inside the modal. */
  studentId?: string;
  onLessonAdded?: () => void;
  studentName?: string;
}

const LESSON_TYPES = LESSON_TYPES_SHARED;
type TimingMode = 'past' | 'single';
type PaymentMode = 'pending' | 'partial' | 'paid' | 'courtesy';
type Currency = 'MXN' | 'USD';

/** Single label format for package options: "10-Lesson Package — 10 restantes". */
const pkgLabel = (pkg: any) =>
  `${pkg.package_name || `${pkg.package_size}-Lesson Package`} — ${pkg.classes_remaining} restantes`;


export function AddLessonModal({ open, onOpenChange, studentId, onLessonAdded, studentName }: AddLessonModalProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<TimingMode>('past');
  const [pickedStudentId, setPickedStudentId] = useState<string>('');
  const effectiveStudentId = studentId || pickedStudentId;
  const showStudentPicker = !studentId;
  const { isOwner, studentIds } = useAssignedStudentIds();

  const [rows, setRows] = useState<DateRow[]>([makeRow()]);
  const [bulkType, setBulkType] = useState<typeof LESSON_TYPES[number]>('Range');
  const [bulkNotes, setBulkNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [activePackages, setActivePackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('none');

  // Payment fields — used only in Single Lesson mode.
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('MXN');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pending');
  const [amountPaid, setAmountPaid] = useState('');

  // Fetch active packages for the effective student.
  // SOURCE OF TRUTH: fetchLinkablePackages -> computePackageCounts, the same
  // computation the student detail (Packages tab) uses. The persisted
  // class_packages.classes_remaining column is NEVER read for display, since it
  // can lag behind lessons created with a package_id.
  useEffect(() => {
    if (!effectiveStudentId || !open) { setActivePackages([]); setSelectedPackageId('none'); return; }
    let cancelled = false;
    (async () => {
      const linkable = await fetchLinkablePackages(effectiveStudentId);
      if (cancelled) return;
      const enriched = linkable.map((p) => ({
        ...p,
        // pkgLabel keeps its format; the number comes from the runtime count.
        classes_remaining: p.remaining,
        classes_used: p.used,
        _isShared: !!p.__shared,
      }));
      setActivePackages(enriched);
      // With exactly one eligible package there is nothing to "auto"-pick
      // between: preselect it and hide the sentinel (see the Select below).
      setSelectedPackageId(enriched.length === 1 ? enriched[0].id : 'none');
    })();
    return () => { cancelled = true; };
  }, [effectiveStudentId, open]);


  // Ensure Add to Package mode always preselects the single eligible package
  // when the user toggles modes after the modal is already open.
  useEffect(() => {
    if (mode === 'past' && activePackages.length === 1 && selectedPackageId === 'none') {
      setSelectedPackageId(activePackages[0].id);
    }
  }, [mode, activePackages, selectedPackageId]);

  const resetForm = () => {
    setRows([makeRow()]);
    setBulkType('Range');
    setBulkNotes('');
    setSelectedPackageId('none');
    setPrice('');
    setCurrency('MXN');
    setPaymentMode('pending');
    setAmountPaid('');
    setPickedStudentId('');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const addRow = () => setRows(prev => [...prev, makeRow(bulkType)]);
  const removeRow = (id: string) => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateRowDate = (id: string, d: Date | undefined) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, date: d } : r));
  const updateRowType = (id: string, t: typeof LESSON_TYPES[number]) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, lessonType: t } : r));
  const updateRowTime = (id: string, t: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, time: t } : r));

  const isCourtesy = paymentMode === 'courtesy';
  const priceNum = isCourtesy ? 0 : (parseFloat(price) || 0);
  const paidNum =
    paymentMode === 'paid' ? priceNum :
    paymentMode === 'partial' ? (parseFloat(amountPaid) || 0) : 0;

  const paymentLabel = (): string | null => {
    if (isCourtesy) return '🎁 Cortesía';
    if (priceNum <= 0) return null;
    const amt = `$${priceNum.toLocaleString()} ${currency}`;
    if (paymentMode === 'paid') return `✅ Paid — ${amt}`;
    if (paymentMode === 'partial' && paidNum > 0)
      return `🔶 Partial — $${paidNum.toLocaleString()} of ${amt}`;
    return `⏳ Pending — ${amt} owed`;
  };

  const isPackageMode = mode === 'past';
  const validCount = rows.filter(r => r.date).length;

  // Unified save. Differences by mode:
  //  - Add to Package: writes package_id, revenue=0, no payment fields;
  //    past dates auto-complete, future stay scheduled.
  //  - Single Lesson: no package_id, always status='scheduled',
  //    revenue/currency/payment_method from PaymentBlock.
  const handleSave = async () => {
    if (!effectiveStudentId) { toast.error('Pick a student'); return; }
    const validRows = rows.filter(r => r.date);
    if (validRows.length === 0) { toast.error('Add at least one date'); return; }
    setSaving(true);
    try {
      const packageIdToWrite = isPackageMode
        ? (selectedPackageId && selectedPackageId !== 'none' ? selectedPackageId : null)
        : null;

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const perLessonRevenue = isPackageMode ? 0 : priceNum;
      const perLessonPaymentMethod = isPackageMode
        ? null
        : (isCourtesy ? 'Courtesy' : paymentMode === 'pending' ? null : 'Cash');
      const lbl = isPackageMode ? null : paymentLabel();
      const notesWithPayment = [bulkNotes, lbl].filter(Boolean).join('\n') || null;

      // Minute-range conflict check (upcoming dates only); nothing is saved on clash.
      for (const r of validRows) {
        const d = format(r.date!, 'yyyy-MM-dd');
        if (d < todayStr) continue;
        const c = await findSlotConflicts({
          dateStr: d,
          time: (r.time || '12:00').slice(0, 5),
          durationMinutes: durationForLessonType(r.lessonType),
          lessonType: r.lessonType,
          studentId: effectiveStudentId,
        });
        if (c.length > 0) throw new Error(`${d}: choca con ${c.map((x) => x.label).join(', ')}. No se guardó.`);
      }

      const inserts = validRows.map(r => ({
        student_id: effectiveStudentId,
        lesson_date: format(r.date!, 'yyyy-MM-dd'),
        lesson_time: r.time || '12:00',
        lesson_type: r.lessonType,
        duration_minutes: durationForLessonType(r.lessonType),
        coach_notes: notesWithPayment,
        status: (isPackageMode
          ? (format(r.date!, 'yyyy-MM-dd') > todayStr ? 'scheduled' : 'completed')
          : 'scheduled') as any,
        revenue: perLessonRevenue,
        currency,
        payment_method: perLessonPaymentMethod,
        package_id: packageIdToWrite,
      } as any));

      const { error } = await supabase.from('lessons').insert(inserts);
      if (error) throw error;

      // The DB trigger `lessons_status_change_handler` handles completion
      // side-effects (points + package deduction) on INSERT. Reconcile the
      // persisted counters afterwards so class_packages can never drift from
      // the runtime count (same formula: computePackageCounts).
      if (packageIdToWrite) {
        await syncPersistedPackageCounters(packageIdToWrite);
      }


      const count = validRows.length;
      toast.success(
        studentName
          ? `${count} lesson${count > 1 ? 's' : ''} added to ${studentName}`
          : `${count} lesson${count > 1 ? 's' : ''} added`
      );
      onLessonAdded?.();
      handleOpenChange(false);
    } catch (err: any) {
      console.error('[AddLessonModal] Failed to add lessons:', err);
      toast.error(err?.message || 'Failed to add lessons');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Add Lesson</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* Student picker — only when the caller didn't pre-select a student */}
          {showStudentPicker && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Student</Label>
              <SearchableStudentSelect
                value={pickedStudentId}
                onValueChange={setPickedStudentId}
                variant="dark"
                restrictToIds={isOwner ? undefined : (studentIds ?? [])}
              />
            </div>
          )}

          {/* Timing mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'past' as TimingMode, label: 'Add to Package', icon: History, desc: 'Log or pre-book' },
              { key: 'single' as TimingMode, label: 'Single Lesson', icon: CalendarPlus, desc: 'Schedule upcoming' },
            ]).map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                style={{
                  background: mode === m.key ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                  border: mode === m.key ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <m.icon className="h-5 w-5" style={{ color: mode === m.key ? '#4a7c59' : '#F5F0E8', opacity: mode === m.key ? 1 : 0.5 }} />
                <span className="text-sm font-medium" style={{ color: '#F5F0E8' }}>{m.label}</span>
                <span className="text-[10px]" style={{ color: '#F5F0E8', opacity: 0.5 }}>{m.desc}</span>
              </button>
            ))}
          </div>

          {/* Shared Lesson Type selector */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Lesson Type (all rows)</Label>
            <div className="grid grid-cols-2 gap-2">
              {LESSON_TYPES.map(t => (
                <button key={t} onClick={() => {
                  setBulkType(t);
                  setRows(prev => prev.map(r => ({ ...r, lessonType: t })));
                }}
                  className="py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: bulkType === t ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                    border: bulkType === t ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                    color: '#F5F0E8',
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Package deduction — Add to Package mode only */}
          {isPackageMode && activePackages.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Deduct from Package
              </Label>
              <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                  <SelectValue placeholder={t('ui.addLesson.autoOldest')} />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1f18] border-white/10">
                  {/* "Auto" only makes sense when there are 2+ packages to pick between;
                      with a single package it looked like a duplicate of the real row. */}
                  {activePackages.length > 1 && (
                    <SelectItem value="none" className="text-[#F5F0E8]">
                      {activePackages[0]
                        ? `Auto — ${pkgLabel(activePackages[0])}`
                        : t('ui.addLesson.autoOldest')}
                    </SelectItem>
                  )}
                  {activePackages.map(pkg => (
                    <SelectItem key={pkg.id} value={pkg.id} className="text-[#F5F0E8]">
                      {pkgLabel(pkg)}
                      {pkg._isShared ? ' · 👥 Shared' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date rows (both modes support "Add Another Date") — shared component */}
          <LessonDateRows
            rows={rows}
            onChange={setRows}
            label="Lesson Dates"
            defaultType={bulkType}
          >
            {isPackageMode && rows.some(r => r.lessonType === 'Playing Lesson') && (
              <div className="rounded-md border border-[#E8D5B0]/30 bg-[#E8D5B0]/10 px-2.5 py-1.5">
                <p className="text-[10px] text-[#E8D5B0]">
                  ⛳ Cada <span className="font-semibold">Playing Lesson</span> descontará <span className="font-semibold">2 clases</span> del paquete.
                </p>
              </div>
            )}
          </LessonDateRows>


          {/* Shared notes */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Coach Notes (optional, applies to all)</Label>
            <Textarea value={bulkNotes} onChange={e => setBulkNotes(e.target.value)}
              placeholder={t('ui.addLesson.notesPh')}
              className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 min-h-[60px]" />
          </div>

          {/* Payment block — Single Lesson mode only. Hidden entirely in Add to Package. */}
          {!isPackageMode && (
            <PaymentBlock
              price={price} setPrice={setPrice}
              currency={currency} setCurrency={setCurrency}
              paymentMode={paymentMode} setPaymentMode={setPaymentMode}
              amountPaid={amountPaid} setAmountPaid={setAmountPaid} allowCourtesy
              perLesson
            />
          )}

          <Button onClick={handleSave} disabled={saving || validCount === 0 || !effectiveStudentId}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving
              ? 'Saving…'
              : isPackageMode
                ? `Add ${validCount} Lesson${validCount !== 1 ? 's' : ''}`
                : `Schedule ${validCount} Lesson${validCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// PaymentBlock — Amount + currency + payment mode (Pending / Partial / Paid).
// Exported so other lesson-creation flows (e.g. AddStudentModal) reuse the
// exact same control instead of duplicating it.
// ───────────────────────────────────────────────────────────────────────────
export function PaymentBlock(props: {
  price: string;
  setPrice: (v: string) => void;
  currency: 'MXN' | 'USD';
  setCurrency: (v: 'MXN' | 'USD') => void;
  paymentMode: 'pending' | 'partial' | 'paid' | 'courtesy';
  setPaymentMode: (v: any) => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  perLesson?: boolean;
  allowCourtesy?: boolean;
}) {
  const { t } = useLanguage();
  const { price, setPrice, currency, setCurrency, paymentMode, setPaymentMode, amountPaid, setAmountPaid, perLesson, allowCourtesy } = props;
  const isCourtesy = paymentMode === 'courtesy';
  const priceNum = parseFloat(price) || 0;
  const paidNum = paymentMode === 'partial' ? (parseFloat(amountPaid) || 0) : (paymentMode === 'paid' ? priceNum : 0);
  const remaining = Math.max(0, priceNum - paidNum);
  const opts = [
    { key: 'pending' as const, label: 'Pending', desc: 'Owed' },
    { key: 'partial' as const, label: 'Partial', desc: 'Some paid' },
    { key: 'paid' as const, label: 'Paid', desc: 'Full' },
    ...(allowCourtesy ? [{ key: 'courtesy' as const, label: 'Cortesía', desc: 'Sin cobro' }] : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      {!isCourtesy && (<>
      <div className="flex items-center justify-between">
        <Label className="text-[#F5F0E8]/70 text-sm">
          Amount {perLesson && <span className="text-[10px] text-[#F5F0E8]/40">(per lesson)</span>}
        </Label>
        <div className="flex gap-1">
          {(['MXN', 'USD'] as const).map(c => (
            <button key={c} type="button" onClick={() => setCurrency(c)}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{
                background: currency === c ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                border: currency === c ? '1px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                color: '#F5F0E8',
              }}>{c}</button>
          ))}
        </div>
      </div>
      <Input
        type="number" min="0" step="1" inputMode="numeric"
        value={price} onChange={e => setPrice(e.target.value)}
        placeholder={t('ui.addLesson.amountPh')}
        className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
      />
      </>)}

      <div className={`grid gap-1.5 ${allowCourtesy ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {opts.map(opt => (
          <button key={opt.key} type="button" onClick={() => setPaymentMode(opt.key)}
            className="py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: paymentMode === opt.key ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
              border: paymentMode === opt.key ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
              color: '#F5F0E8',
            }}>
            <div>{opt.label}</div>
            <div className="text-[9px] opacity-60">{opt.desc}</div>
          </button>
        ))}
      </div>
      {isCourtesy && (
        <p className="text-[10px] text-[#E8D5B0]/80 px-1">🎁 Clase de cortesía: sin cobro ni pago registrado.</p>
      )}

      {paymentMode === 'partial' && (
        <div className="space-y-1.5">
          <Label className="text-[#F5F0E8]/70 text-xs">Amount paid</Label>
          <Input
            type="number" min="0" step="1" inputMode="numeric"
            value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
            placeholder="0"
            className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
          />
          {priceNum > 0 && (
            <p className="text-[10px] text-[#F5F0E8]/50">
              Remaining: <span className="text-[#E8D5B0] font-semibold">${remaining.toLocaleString()} {currency}</span>
            </p>
          )}
        </div>
      )}

      {paymentMode === 'pending' && priceNum > 0 && (
        <p className="text-[10px] text-[#E8D5B0]/80 px-1">
          ⏳ Will appear in <strong>{t('ui.addLesson.accountsReceivable')}</strong> for ${priceNum.toLocaleString()} {currency}.
        </p>
      )}
    </div>
  );
}
