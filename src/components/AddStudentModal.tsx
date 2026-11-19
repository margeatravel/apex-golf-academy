import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Upload, Calendar as CalendarIcon, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { STUDENTS_QUERY_KEY } from '@/components/SearchableStudentSelect';
import { HourPicker } from '@/components/HourPicker';
import { PaymentBlock } from '@/components/AddLessonModal';
import { findSlotConflicts } from '@/lib/lessonSlotConflicts';
import { getTodayInAppTimezone } from '@/lib/formatLessonDateTime';

// Same catalogue the existing lesson-creation form uses (AddLessonModal).
const LESSON_TYPES = ['Range', 'Playing Lesson'] as const;

interface AddStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStudentCreated?: (newId: string) => void;
}

type IntakeType = 'none' | 'individual' | 'package';

const PACKAGE_SIZES = [
  { value: '5', label: '5 clases' },
  { value: '10', label: '10 clases' },
  { value: '20', label: '20 clases' },
  { value: '30', label: '30 clases' },
  { value: '40', label: '40 clases' },
];

export function AddStudentModal({ open, onOpenChange, onStudentCreated }: AddStudentModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Student info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Intake type
  const [intakeType, setIntakeType] = useState<IntakeType>('none');

  // Individual class fields
  const [classDate, setClassDate] = useState('');
  const [classTime, setClassTime] = useState('');
  const [classDuration, setClassDuration] = useState('60');
  const [classLessonType, setClassLessonType] = useState<typeof LESSON_TYPES[number]>('Range');
  const [classAmount, setClassAmount] = useState('');
  const [classCurrency, setClassCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [classPaymentMode, setClassPaymentMode] = useState<'pending' | 'partial' | 'paid'>('pending');
  const [classAmountPaid, setClassAmountPaid] = useState('');
  const [classNotes, setClassNotes] = useState('');


  // Package fields
  const [packageSize, setPackageSize] = useState('10');
  const [packageAmount, setPackageAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [packageNotes, setPackageNotes] = useState('');

  // Media
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName(''); setPhone(''); setEmail('');
    setIntakeType('none');
    setClassDate(''); setClassTime(''); setClassDuration('60');
    setClassLessonType('Range'); setClassAmount(''); setClassNotes('');
    setClassCurrency('MXN'); setClassPaymentMode('pending'); setClassAmountPaid('');
    setPackageSize('10'); setPackageAmount(''); setPaymentDate(''); setPackageNotes('');
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Ingresa el nombre del estudiante'); return; }

    // Availability check against the same four sources the Coach calendar merges.
    if (intakeType === 'individual') {
      const dateStr = classDate || getTodayInAppTimezone();
      const timeStr = classTime || '12:00';
      const { data: { session: s0 } } = await supabase.auth.getSession();
      const conflicts = await findSlotConflicts({
        dateStr,
        time: timeStr,
        durationMinutes: parseInt(classDuration, 10) || 60,
        lessonType: classLessonType,
        coachId: s0?.user?.id ?? null,
      });
      if (conflicts.length > 0) {
        toast.error('Horario no disponible', { description: conflicts.map(c => c.label).join(' · ') });
        return;
      }

      // Partial payment validation — same rule as EditARModal: the partial
      // amount must be greater than 0 and less than the lesson price.
      if (classPaymentMode === 'partial') {
        const price = parseFloat(classAmount) || 0;
        const paid = parseFloat(classAmountPaid) || 0;
        if (price <= 0) { toast.error('Ingresa el monto de la clase para un pago parcial'); return; }
        if (paid <= 0) { toast.error('Monto parcial inválido'); return; }
        if (paid >= price) { toast.error('El parcial debe ser menor al total — usa "Paid"'); return; }
      }
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No auth session');

      // 1. Create student via edge function with an explicit auth header.
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null }),
      });

      const result = await response.json().catch(() => null) as { id?: string; email?: string; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || `Error creating student (${response.status})`);
      if (!result?.id) throw new Error('No student ID returned');

      const newId = result.id;
      const coachId = session.user.id;

      // 2. Create lesson or package if selected
      if (intakeType === 'individual') {
        const price = parseFloat(classAmount) || 0;
        const paid = classPaymentMode === 'paid' ? price
          : classPaymentMode === 'partial' ? (parseFloat(classAmountPaid) || 0)
          : 0;
        const saldo = Math.max(0, price - paid);
        const date = classDate || getTodayInAppTimezone();
        const time = classTime || '12:00';
        const duration = parseInt(classDuration, 10) || 60;
        const isFuture = date > getTodayInAppTimezone();

        // Same fields the existing single-lesson flow (AddLessonModal) writes,
        // so useCalendarWeek / useCalendarMonth pick it up with no special case.
        // Revenue recognition mirrors isLessonRecognizedRevenue: a lesson with
        // no package_id, not imported and without payment_method stays in AR.
        // - paid:    payment_method set → counts as revenue, never in AR.
        // - pending: payment_method null → full price stays in AR, no revenue.
        // - partial: lesson keeps the unpaid balance (saldo) in AR; the
        //   collected amount is logged in `payments` (manual lesson revenue),
        //   exactly like the EditARModal partial flow.
        const fmtAmt = `$${price.toLocaleString()} ${classCurrency}`;
        const payLabel = price <= 0 ? null
          : classPaymentMode === 'paid' ? `✅ Paid — ${fmtAmt}`
          : classPaymentMode === 'partial' ? `🔶 Partial — $${paid.toLocaleString()} of ${fmtAmt}`
          : `⏳ Pending — ${fmtAmt} owed`;
        const notesWithPayment = [classNotes.trim(), payLabel].filter(Boolean).join('\n') || null;

        await supabase.from('lessons').insert({
          student_id: newId,
          lesson_date: date,
          lesson_time: time,
          lesson_type: classLessonType,
          duration_minutes: duration,
          status: (isFuture ? 'scheduled' : 'completed') as any,
          revenue: classPaymentMode === 'partial' ? saldo : price,
          currency: classCurrency,
          payment_method: classPaymentMode === 'paid' ? 'Cash' : null,
          package_id: null,
          coach_notes: notesWithPayment,
        } as any);

        // Partial: log the collected amount as a manual lesson payment so it
        // counts as revenue while the saldo stays in Accounts Receivable.
        if (classPaymentMode === 'partial' && paid > 0) {
          await supabase.from('payments').insert({
            student_id: newId,
            coach_id: coachId,
            payment_date: date,
            amount: paid,
            payment_method: 'Cash',
            concept: 'Individual Lesson — parcial',
            notes: classNotes.trim() || null,
          });
        }
      } else if (intakeType === 'package') {
        const size = parseInt(packageSize);
        const amount = parseFloat(packageAmount) || 0;
        const pDate = paymentDate || new Date().toISOString().split('T')[0];

        await supabase.from('class_packages').insert({
          user_id: newId,
          package_size: size,
          classes_remaining: size,
          classes_used: 0,
          package_name: `Package ${size} lecciones`,
          price: amount,
          amount_paid: amount,
          payment_status: amount > 0 ? 'paid' : 'pending',
          payment_date: pDate,
          is_active: true,
        });

        // Notify student via email about the new package (non-blocking)
        if (email.trim()) {
          try {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: email.trim(),
                studentName: name.trim(),
                notificationType: 'package_added',
                packageSize: size,
                lessonsRemaining: size,
              },
            });
            console.log('Package added email sent to', email.trim());
          } catch (emailErr) {
            console.warn('Failed to send package added email:', emailErr);
          }
        }

        // Notify admin@margeagolfacademy.com — package purchased (non-blocking)
        try {
          await supabase.functions.invoke('notify-admin', {
            body: {
              eventType: 'package_purchased',
              studentName: name.trim(),
              studentEmail: email.trim() || undefined,
              packageName: `Package ${size} lecciones`,
              amount: amount > 0 ? amount : undefined,
              currency: 'MXN',
            },
          });
        } catch (e) {
          console.warn('notify-admin (package_purchased / new student) failed:', e);
        }
      }

      // 3. Upload media if provided
      if (mediaFile) {
        try {
          const ext = mediaFile.name.split('.').pop();
          const path = `${newId}/${Date.now()}.${ext}`;
          const isVideo = mediaFile.type.startsWith('video/');

          await supabase.storage.from('golf-media').upload(path, mediaFile, {
            cacheControl: '3600', upsert: false, contentType: mediaFile.type,
          });
          const { data: urlData } = supabase.storage.from('golf-media').getPublicUrl(path);

          await supabase.from('student_media').insert({
            student_id: newId,
            coach_id: coachId,
            file_url: urlData.publicUrl,
            file_type: isVideo ? 'video' : 'image',
            title: `Intake - ${name.trim()}`,
            is_general: true,
          });
        } catch (mediaErr) {
          console.error('Media upload failed but student created:', mediaErr);
        }
      }

      // 4. Invalidate caches
      queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['all-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-quick-lesson'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-fab'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-package'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-month'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-manual-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-revenue'] });

      toast.success(`Student "${name.trim()}" agregado`);
      onStudentCreated?.(newId);
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Error al agregar estudiante');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = "bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Add Student</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Student name" className={inputStyle} />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+52 ..." type="tel" className={inputStyle} />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Email (opcional)</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" type="email" className={inputStyle} />
          </div>

          {/* Intake Type Selection */}
          <div className="space-y-2 pt-2">
            <Label className="text-[#F5F0E8]/70 text-sm">What did they buy?</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'none' as IntakeType, label: 'Solo registro', icon: null },
                { val: 'individual' as IntakeType, label: 'Clase individual', icon: CalendarIcon },
                { val: 'package' as IntakeType, label: 'Paquete', icon: Package },
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setIntakeType(opt.val)}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-xs font-medium transition-all ${
                    intakeType === opt.val
                      ? 'border-[#4a7c59] bg-[#4a7c59]/20 text-[#F5F0E8]'
                      : 'border-white/10 bg-white/5 text-[#F5F0E8]/60 hover:bg-white/10'
                  }`}
                >
                  {opt.icon && <opt.icon className="h-4 w-4" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Individual Lesson Fields */}
          {intakeType === 'individual' && (
            <div className="space-y-3 p-3 rounded-lg border border-white/10 bg-white/5">
              <p className="text-xs font-medium text-[#E8D5B0]">Individual Lesson</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left text-xs h-9 bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
                          !classDate && 'text-[#F5F0E8]/40',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {classDate ? format(parse(classDate, 'yyyy-MM-dd', new Date()), 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                      <Calendar
                        mode="single"
                        selected={classDate ? parse(classDate, 'yyyy-MM-dd', new Date()) : undefined}
                        onSelect={(d) => d && setClassDate(format(d, 'yyyy-MM-dd'))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Time</Label>
                  <HourPicker value={classTime} onChange={setClassTime} size="sm" placeholder="Pick hour" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Duración (min)</Label>
                  <Input
                    type="number"
                    min={15}
                    step={15}
                    value={classDuration}
                    onChange={e => setClassDuration(e.target.value)}
                    className={inputStyle + " text-xs"}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Tipo de clase</Label>
                  <Select value={classLessonType} onValueChange={(v) => setClassLessonType(v as typeof LESSON_TYPES[number])}>
                    <SelectTrigger className={inputStyle + " text-xs"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1f18] border-white/10">
                      {LESSON_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="text-[#F5F0E8]">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Same payment control the Add Lesson flow uses (Pending / Partial / Paid) */}
              <PaymentBlock
                price={classAmount} setPrice={setClassAmount}
                currency={classCurrency} setCurrency={setClassCurrency}
                paymentMode={classPaymentMode} setPaymentMode={setClassPaymentMode}
                amountPaid={classAmountPaid} setAmountPaid={setClassAmountPaid}
              />
              <div className="space-y-1">
                <Label className="text-[#F5F0E8]/70 text-xs">Notas (opcional)</Label>
                <Input value={classNotes} onChange={e => setClassNotes(e.target.value)} placeholder="Notas de la clase" className={inputStyle + " text-xs"} />
              </div>
            </div>
          )}

          {/* Package Fields */}
          {intakeType === 'package' && (
            <div className="space-y-3 p-3 rounded-lg border border-white/10 bg-white/5">
              <p className="text-xs font-medium text-[#E8D5B0]">Package</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Size</Label>
                  <Select value={packageSize} onValueChange={setPackageSize}>
                    <SelectTrigger className={inputStyle + " text-xs"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1f18] border-white/10">
                      {PACKAGE_SIZES.map(p => (
                        <SelectItem key={p.value} value={p.value} className="text-[#F5F0E8]">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Monto pagado</Label>
                  <Input type="number" value={packageAmount} onChange={e => setPackageAmount(e.target.value)} placeholder="$0" className={inputStyle + " text-xs"} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#F5F0E8]/70 text-xs">Payment Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left text-xs h-9 bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
                          !paymentDate && 'text-[#F5F0E8]/40',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {paymentDate ? format(parse(paymentDate, 'yyyy-MM-dd', new Date()), 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                      <Calendar
                        mode="single"
                        selected={paymentDate ? parse(paymentDate, 'yyyy-MM-dd', new Date()) : undefined}
                        onSelect={(d) => d && setPaymentDate(format(d, 'yyyy-MM-dd'))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[#F5F0E8]/70 text-xs">Notas (opcional)</Label>
                <Input value={packageNotes} onChange={e => setPackageNotes(e.target.value)} placeholder="Notas del paquete" className={inputStyle + " text-xs"} />
              </div>
            </div>
          )}

          {/* Optional Media Upload */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Photo or video (optional)</Label>
            <div
              className="rounded-lg px-3 py-2.5 flex items-center gap-3 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 text-[#F5F0E8]/50 shrink-0" />
              <span className={`text-sm truncate ${mediaFile ? 'text-[#F5F0E8]' : 'text-[#F5F0E8]/30'}`}>
                {mediaFile ? mediaFile.name : 'Subir foto o video'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) setMediaFile(f); }}
              className="hidden"
            />
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving...' : 'Add Student'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
