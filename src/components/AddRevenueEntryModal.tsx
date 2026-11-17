import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Plus, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { useAuth } from '@/contexts/AuthContext';
import { AddPackageModal } from '@/components/AddPackageModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
  defaultDate?: string; // yyyy-MM-dd
}

const LESSON_TYPES = ['Range', 'Playing Lesson'] as const;
const PAYMENT_METHODS = ['Cash', 'Transfer', 'Card', 'Stripe', 'Other'];
const CONCEPTS = ['Individual Lesson', 'Lesson Package', 'Membership', 'Other'];

export function AddRevenueEntryModal({ open, onOpenChange, onAdded, defaultDate }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = defaultDate || format(new Date(), 'yyyy-MM-dd');

  const [tab, setTab] = useState<'lesson' | 'package' | 'other'>('lesson');
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving] = useState(false);

  // Lesson tab
  const [lessonMode, setLessonMode] = useState<'existing' | 'new'>('existing');
  const [existingLessonId, setExistingLessonId] = useState('');
  const [lessonAmount, setLessonAmount] = useState('');
  const [lessonAmountTouched, setLessonAmountTouched] = useState(false);
  const [onlyZeroRevenue, setOnlyZeroRevenue] = useState(false);
  const [lessonDate, setLessonDate] = useState(today);
  const [lessonTime, setLessonTime] = useState('10:00');
  const [lessonType, setLessonType] = useState<typeof LESSON_TYPES[number]>('Range');
  const [lessonDuration, setLessonDuration] = useState(60);
  const [lessonStatus, setLessonStatus] = useState<'scheduled' | 'completed'>('completed');
  const [lessonStatusTouched, setLessonStatusTouched] = useState(false);
  const [lessonPackageId, setLessonPackageId] = useState<string>('none');
  const [lessonPaymentMethod, setLessonPaymentMethod] = useState('Cash');

  // Package tab
  const [packageId, setPackageId] = useState('');
  const [pkgAmount, setPkgAmount] = useState('');
  const [pkgDate, setPkgDate] = useState(today);
  const [pkgMethod, setPkgMethod] = useState('Cash');
  const [pkgNotes, setPkgNotes] = useState('');
  const [showAddPackage, setShowAddPackage] = useState(false);

  // Other tab
  const [otherAmount, setOtherAmount] = useState('');
  const [otherDate, setOtherDate] = useState(today);
  const [otherMethod, setOtherMethod] = useState('Cash');
  const [otherConcept, setOtherConcept] = useState('Individual Lesson');
  const [otherNotes, setOtherNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setStudentId('');
      setExistingLessonId('');
      setLessonAmount('');
      setLessonAmountTouched(false);
      setOnlyZeroRevenue(false);
      setPackageId('');
      setPkgAmount('');
      setPkgNotes('');
      setOtherAmount('');
      setOtherNotes('');
      setLessonMode('existing');
      setTab('lesson');
      setLessonStatus('completed');
      setLessonStatusTouched(false);
      setLessonPackageId('none');
      setLessonPaymentMethod('Cash');
    }
  }, [open]);

  // Auto-default lesson status by date unless user manually picked one
  useEffect(() => {
    if (lessonStatusTouched) return;
    setLessonStatus(lessonDate >= today ? 'scheduled' : 'completed');
  }, [lessonDate, today, lessonStatusTouched]);

  // Fetch student's recent lessons (for "existing lesson" mode)
  const { data: studentLessons = [] } = useQuery({
    queryKey: ['add-rev-lessons', studentId],
    enabled: !!studentId && tab === 'lesson' && lessonMode === 'existing',
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type, revenue, status')
        .eq('student_id', studentId)
        .lte('lesson_date', today)
        .order('lesson_date', { ascending: false })
        .limit(60);
      return (data || []) as any[];
    },
  });

  // Fetch student's packages (for "package payment" mode)
  const { data: studentPackages = [], refetch: refetchPackages } = useQuery({
    queryKey: ['add-rev-packages', studentId],
    enabled: !!studentId && (tab === 'package' || (tab === 'lesson' && lessonMode === 'new')),
    queryFn: async () => {
      const { data } = await supabase
        .from('class_packages')
        .select('id, package_name, package_size, price, amount_paid, payment_status, is_active, created_at')
        .eq('user_id', studentId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  const sortedLessons = useMemo(
    () =>
      [...studentLessons].sort((a, b) => {
        // Show zero-revenue first within same date
        if (a.lesson_date === b.lesson_date) return (Number(a.revenue) || 0) - (Number(b.revenue) || 0);
        return a.lesson_date < b.lesson_date ? 1 : -1;
      }),
    [studentLessons]
  );

  const filteredLessons = useMemo(
    () => (onlyZeroRevenue ? sortedLessons.filter((l: any) => !Number(l.revenue)) : sortedLessons),
    [sortedLessons, onlyZeroRevenue]
  );

  const selectedLesson = useMemo(
    () => sortedLessons.find((l: any) => l.id === existingLessonId) || null,
    [sortedLessons, existingLessonId]
  );

  // Pre-fill amount from chosen lesson, unless user has typed manually
  useEffect(() => {
    if (lessonMode !== 'existing') return;
    if (lessonAmountTouched) return;
    if (!selectedLesson) {
      setLessonAmount('');
      return;
    }
    const cur = Number(selectedLesson.revenue) || 0;
    setLessonAmount(cur > 0 ? String(cur) : '');
  }, [selectedLesson, lessonMode, lessonAmountTouched]);

  // Reset selection when student changes
  useEffect(() => {
    setExistingLessonId('');
    setLessonAmountTouched(false);
  }, [studentId]);

  const refetchAll = () => {
    qc.invalidateQueries();
    onAdded?.();
  };

  const handleLessonSave = async () => {
    if (!studentId) return toast.error('Pick a student');
    const amt = parseFloat(lessonAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');

    setSaving(true);
    try {
      if (lessonMode === 'existing') {
        if (!existingLessonId) throw new Error('Pick a lesson');
        const { error } = await supabase
          .from('lessons')
          .update({ revenue: amt })
          .eq('id', existingLessonId);
        if (error) throw error;
        const lbl = selectedLesson
          ? `${selectedLesson.lesson_date} · ${selectedLesson.lesson_type}`
          : 'lesson';
        toast.success(`Linked $${amt.toLocaleString()} MXN to ${lbl}`);
      } else {
        if (!lessonDate || !lessonTime) throw new Error('Date and time required');
        const startAt = new Date(`${lessonDate}T${lessonTime}:00`);
        const endAt = new Date(startAt.getTime() + lessonDuration * 60_000);
        const isFuture = lessonDate >= today;
        const insertRow: any = {
          student_id: studentId,
          lesson_date: lessonDate,
          lesson_time: lessonTime,
          lesson_type: lessonType,
          duration_minutes: lessonDuration,
          status: lessonStatus,
          revenue: amt,
          // Only mark as imported when back-dating; future scheduled lessons
          // should behave like any other booked lesson on the calendar.
          imported: !isFuture && lessonStatus === 'completed',
          lesson_start_at: startAt.toISOString(),
          lesson_end_at: endAt.toISOString(),
          payment_method: lessonPaymentMethod,
          coach_notes: `Payment: ${lessonPaymentMethod}`,
          package_id: lessonPackageId === 'none' ? null : lessonPackageId,
          currency: 'MXN',
        };
        const { error } = await supabase.from('lessons').insert(insertRow);
        if (error) throw error;
        toast.success('Lesson + revenue recorded');
      }
      refetchAll();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePackageSave = async () => {
    if (!studentId) return toast.error('Pick a student');
    if (!packageId) return toast.error('Pick a package');
    const amt = parseFloat(pkgAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');

    setSaving(true);
    try {
      const { error: payErr } = await supabase.from('package_payments').insert({
        package_id: packageId,
        amount: amt,
        payment_date: pkgDate,
        payment_method: pkgMethod,
        notes: pkgNotes || null,
      } as any);
      if (payErr) throw payErr;

      // Recompute amount_paid + payment_status on the package
      const pkg = studentPackages.find((p: any) => p.id === packageId);
      if (pkg) {
        const newPaid = (Number(pkg.amount_paid) || 0) + amt;
        const price = Number(pkg.price) || 0;
        const status = newPaid <= 0 ? 'pending' : newPaid >= price ? 'paid' : 'partial';
        await supabase
          .from('class_packages')
          .update({ amount_paid: newPaid, payment_status: status, payment_date: pkgDate })
          .eq('id', packageId);
      }
      toast.success('Package payment recorded');
      refetchAll();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleOtherSave = async () => {
    if (!studentId) return toast.error('Pick a student');
    const amt = parseFloat(otherAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (!user?.id) return toast.error('Not signed in');

    setSaving(true);
    try {
      const { error } = await supabase.from('payments').insert({
        student_id: studentId,
        coach_id: user.id,
        payment_date: otherDate,
        amount: amt,
        payment_method: otherMethod,
        concept: otherConcept,
        notes: otherNotes || null,
      } as any);
      if (error) throw error;
      toast.success('Payment recorded');
      refetchAll();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Add income</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Student</Label>
              <SearchableStudentSelect value={studentId} onValueChange={setStudentId} />
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-3 w-full bg-white/5">
                <TabsTrigger value="lesson">Lesson</TabsTrigger>
                <TabsTrigger value="package">Package payment</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>

              {/* LESSON */}
              <TabsContent value="lesson" className="space-y-3 mt-3">
                <RadioGroup value={lessonMode} onValueChange={(v) => setLessonMode(v as any)} className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="existing" /> Existing lesson
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="new" /> New lesson
                  </label>
                </RadioGroup>

                {lessonMode === 'existing' ? (
                  <div className="space-y-2">
                    {!studentId && (
                      <p className="text-xs text-[#F5F0E8]/50">Pick a student to load past lessons.</p>
                    )}
                    {studentId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#F5F0E8]/60">
                          {filteredLessons.length} of {sortedLessons.length} lessons
                        </span>
                        <label className="flex items-center gap-2 cursor-pointer text-[#F5F0E8]/70">
                          Only without revenue
                          <Switch checked={onlyZeroRevenue} onCheckedChange={setOnlyZeroRevenue} />
                        </label>
                      </div>
                    )}
                    {studentId && selectedLesson && (
                      <div className="rounded border border-[#F0C040]/40 bg-[#F0C040]/10 px-3 py-2 text-xs">
                        <div className="text-[#F5F0E8]/60 uppercase tracking-wide text-[10px]">Selected lesson</div>
                        <div className="font-medium text-[#F5F0E8]">
                          {selectedLesson.lesson_date} · {String(selectedLesson.lesson_time).slice(0, 5)} · {selectedLesson.lesson_type}
                          <span className="text-[#F5F0E8]/40 ml-1">#{String(selectedLesson.id).slice(0, 8)}</span>
                        </div>
                        <div className="text-[#F5F0E8]/70">
                          Current revenue:{' '}
                          {Number(selectedLesson.revenue) > 0
                            ? `$${Number(selectedLesson.revenue).toLocaleString()} MXN`
                            : 'none'}
                        </div>
                      </div>
                    )}
                    {studentId && filteredLessons.length === 0 && (
                      <p className="text-xs text-[#F5F0E8]/50">
                        {sortedLessons.length === 0 ? 'No past lessons found for this student.' : 'No lessons match this filter.'}
                      </p>
                    )}
                    {studentId && filteredLessons.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded border border-white/10 divide-y divide-white/5">
                        {filteredLessons.map((l: any) => {
                          const isZero = !Number(l.revenue);
                          const selected = existingLessonId === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setExistingLessonId(l.id)}
                              className={`w-full flex items-center justify-between text-left px-3 py-2 text-xs hover:bg-white/5 ${
                                selected ? 'bg-[#F0C040]/10 ring-1 ring-[#F0C040]/40' : ''
                              }`}
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                {selected && <Check className="h-3.5 w-3.5 text-[#F0C040] mt-0.5 shrink-0" />}
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {l.lesson_date} · {String(l.lesson_time).slice(0, 5)} · {l.lesson_type}
                                  </div>
                                  <div className="text-[#F5F0E8]/50">
                                    Status: {l.status} · <span className="text-[#F5F0E8]/40">#{String(l.id).slice(0, 8)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className={`text-right ${isZero ? 'text-[#F0C040]' : 'text-[#F5F0E8]/70'}`}>
                                {isZero ? 'No revenue' : `$${Number(l.revenue).toLocaleString()}`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Amount (MXN)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={lessonAmount}
                        onChange={(e) => { setLessonAmount(e.target.value); setLessonAmountTouched(true); }}
                        className="bg-white/5 border-white/10 text-[#F5F0E8]"
                        placeholder="0"
                      />
                      {selectedLesson && (
                        <p className="text-[11px] text-[#F5F0E8]/50">
                          {Number(selectedLesson.revenue) > 0
                            ? `Replacing current revenue of $${Number(selectedLesson.revenue).toLocaleString()} MXN on this lesson.`
                            : 'This lesson has no income yet — the amount above will be set on it.'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Date</Label>
                      <DateField value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Time</Label>
                      <Input type="time" value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Type</Label>
                      <Select value={lessonType} onValueChange={(v) => setLessonType(v as any)}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1f18] border-white/10">
                          {LESSON_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Duration (min)</Label>
                      <Input type="number" min="15" step="15" value={lessonDuration} onChange={(e) => setLessonDuration(parseInt(e.target.value) || 60)} className="bg-white/5 border-white/10 text-[#F5F0E8]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Status</Label>
                      <Select value={lessonStatus} onValueChange={(v) => { setLessonStatus(v as any); setLessonStatusTouched(true); }}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1f18] border-white/10">
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-[#F5F0E8]/50">
                        {lessonStatus === 'completed'
                          ? 'Completed: consumes a package slot (if linked) and awards SC points.'
                          : 'Scheduled: shows on calendar; no package deduction yet.'}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Payment method</Label>
                      <Select value={lessonPaymentMethod} onValueChange={setLessonPaymentMethod}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1f18] border-white/10">
                          {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Attach to package (optional)</Label>
                      <Select
                        value={lessonPackageId}
                        onValueChange={setLessonPackageId}
                        disabled={!studentId}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                          <SelectValue placeholder={studentId ? 'None' : 'Pick a student first'} />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d1f18] border-white/10">
                          <SelectItem value="none">None (standalone lesson)</SelectItem>
                          {studentPackages.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.package_name || `${p.package_size}-Lesson`} · {p.payment_status} · {p.is_active ? 'active' : 'inactive'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {studentId && studentPackages.length === 0 && (
                        <p className="text-[10px] text-[#F5F0E8]/50">No packages exist for this student.</p>
                      )}
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-[#F5F0E8]/70 text-sm">Amount (MXN)</Label>
                      <Input type="number" min="0" value={lessonAmount} onChange={(e) => setLessonAmount(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" placeholder="0" />
                    </div>
                  </div>
                )}

                <Button onClick={handleLessonSave} disabled={saving} className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {lessonMode === 'existing' ? 'Set revenue on lesson' : 'Save income'}
                </Button>
              </TabsContent>

              {/* PACKAGE */}
              <TabsContent value="package" className="space-y-3 mt-3">
                {!studentId ? (
                  <p className="text-xs text-[#F5F0E8]/50">Pick a student to load packages.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-[#F5F0E8]/70 text-sm">Package</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddPackage(true)}
                        className="text-[#F0C040] hover:text-[#F0C040]/80 h-auto py-1 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" /> New package
                      </Button>
                    </div>
                    {studentPackages.length === 0 ? (
                      <p className="text-xs text-[#F5F0E8]/50">No packages for this student yet — create one above.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto rounded border border-white/10 divide-y divide-white/5">
                        {studentPackages.map((p: any) => {
                          const selected = packageId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPackageId(p.id)}
                              className={`w-full flex items-center justify-between text-left px-3 py-2 text-xs hover:bg-white/5 ${
                                selected ? 'bg-[#F0C040]/10 ring-1 ring-[#F0C040]/40' : ''
                              }`}
                            >
                              <div>
                                <div className="font-medium">{p.package_name || `${p.package_size}-Lesson Package`}</div>
                                <div className="text-[#F5F0E8]/50">
                                  Paid ${Number(p.amount_paid || 0).toLocaleString()} / ${Number(p.price || 0).toLocaleString()} · {p.payment_status}
                                </div>
                              </div>
                              {p.is_active && <span className="text-[10px] text-[#4a7c59]">active</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[#F5F0E8]/70 text-sm">Amount (MXN)</Label>
                        <Input type="number" min="0" value={pkgAmount} onChange={(e) => setPkgAmount(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" placeholder="0" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[#F5F0E8]/70 text-sm">Date</Label>
                        <DateField value={pkgDate} onChange={(e) => setPkgDate(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-[#F5F0E8]/70 text-sm">Method</Label>
                        <Select value={pkgMethod} onValueChange={setPkgMethod}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0d1f18] border-white/10">
                            {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-[#F5F0E8]/70 text-sm">Notes (optional)</Label>
                        <Textarea value={pkgNotes} onChange={(e) => setPkgNotes(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8] min-h-[60px]" />
                      </div>
                    </div>
                    <Button onClick={handlePackageSave} disabled={saving} className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Save payment
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* OTHER */}
              <TabsContent value="other" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[#F5F0E8]/70 text-sm">Amount (MXN)</Label>
                    <Input type="number" min="0" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[#F5F0E8]/70 text-sm">Date</Label>
                    <DateField value={otherDate} onChange={(e) => setOtherDate(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[#F5F0E8]/70 text-sm">Method</Label>
                    <Select value={otherMethod} onValueChange={setOtherMethod}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1f18] border-white/10">
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[#F5F0E8]/70 text-sm">Concept</Label>
                    <Select value={otherConcept} onValueChange={setOtherConcept}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1f18] border-white/10">
                        {CONCEPTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-[#F5F0E8]/70 text-sm">Notes (optional)</Label>
                    <Textarea value={otherNotes} onChange={(e) => setOtherNotes(e.target.value)} className="bg-white/5 border-white/10 text-[#F5F0E8] min-h-[60px]" />
                  </div>
                </div>
                <Button onClick={handleOtherSave} disabled={saving} className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Record payment
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <AddPackageModal
        open={showAddPackage}
        onOpenChange={setShowAddPackage}
        preselectedStudentId={studentId}
        onPackageAdded={async () => {
          const { data: fresh } = await refetchPackages();
          refetchAll();
          // Auto-select the newest package for this student and prefill the
          // amount with its price so one Save records the package_payments row.
          const list = (fresh as any[] | undefined) || [];
          const newest = [...list].sort((a, b) =>
            String(b.created_at || '').localeCompare(String(a.created_at || ''))
          )[0];
          if (newest?.id) {
            setPackageId(newest.id);
            const price = Number(newest.price) || 0;
            const paid = Number(newest.amount_paid) || 0;
            const due = Math.max(price - paid, 0);
            if (due > 0) setPkgAmount(String(due));
          }
        }}
      />
    </>
  );
}