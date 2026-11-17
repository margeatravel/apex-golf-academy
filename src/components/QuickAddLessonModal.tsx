import { useState, useRef, useCallback, useEffect } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Loader2, Upload, X, Video, Package, Clock } from 'lucide-react';
import { HourPicker } from '@/components/HourPicker';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { hasRemainingLessons } from '@/lib/packageStatus';
import { getTodayInAppTimezone } from '@/lib/formatLessonDateTime';

interface QuickAddLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentMode = 'paid' | 'partial' | 'pending';
type LessonMode = 'package' | 'individual';
type Currency = 'MXN' | 'USD';

export function QuickAddLessonModal({ open, onOpenChange }: QuickAddLessonModalProps) {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('MXN');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pending');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentDate, setPaymentDate] = useState<Date>();
  const [saving, setSaving] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePackages, setActivePackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('none');
  const [lessonMode, setLessonMode] = useState<LessonMode>('individual');

  // Fetch active packages (owned + shared) when student changes
  useEffect(() => {
    if (!studentId) { setActivePackages([]); setSelectedPackageId('none'); return; }
    (async () => {
      // 1. Owned packages
      const { data: owned } = await supabase
        .from('class_packages')
        .select('*')
        .eq('user_id', studentId)
        .gt('classes_remaining', 0)
        .order('created_at', { ascending: true });

      // 2. Shared packages (where student is in package_members)
      const { data: memberRows } = await supabase
        .from('package_members' as any)
        .select('package_id')
        .eq('student_id', studentId);
      const sharedIds = ((memberRows || []) as any[]).map((m: any) => m.package_id);

      let shared: any[] = [];
      if (sharedIds.length > 0) {
        const { data: sharedPkgs } = await supabase
          .from('class_packages')
          .select('*')
          .in('id', sharedIds)
          .gt('classes_remaining', 0);
        shared = sharedPkgs || [];
      }

      // Merge & dedupe by id
      const all = [...(owned || []), ...shared];
      const dedup = Array.from(new Map(all.map((p) => [p.id, p])).values());

      // Mark shared & fetch member names for display
      const ownerIds = new Set((owned || []).map((p: any) => p.id));
      const enriched = await Promise.all(
        dedup.map(async (p: any) => {
          const { data: members } = await supabase
            .from('package_members' as any)
            .select('student_id')
            .eq('package_id', p.id);
          const memberCount = (members || []).length;
          const isShared = memberCount > 1;
          let memberNames: string[] = [];
          if (isShared) {
            const ids = ((members || []) as any[]).map((m: any) => m.student_id);
            const { data: profs } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', ids);
            memberNames = (profs || []).map((pr: any) => pr.full_name || pr.email);
          }
          return { ...p, _isShared: isShared, _memberNames: memberNames, _isOwner: ownerIds.has(p.id) };
        })
      );

      setActivePackages(enriched);
      setSelectedPackageId('none');
    })();
  }, [studentId]);


  const priceNum = parseFloat(price) || 0;
  const paidNum = paymentMode === 'paid' ? priceNum : paymentMode === 'partial' ? (parseFloat(amountPaid) || 0) : 0;
  const remaining = Math.max(0, priceNum - paidNum);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (newFiles.length === 0) { toast.error('Only photos and videos are allowed'); return; }
    setMediaFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(f => {
      const url = URL.createObjectURL(f);
      setMediaPreviews(prev => [...prev, url]);
    });
  }, []);

  const removeFile = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); };

  const fmtAmount = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

  const resetForm = () => {
    setStudentId(''); setDate(undefined); setTime(''); setPrice(''); setNotes('');
    setCurrency('MXN');
    setPaymentMode('pending'); setAmountPaid(''); setPaymentDate(undefined);
    mediaPreviews.forEach(url => URL.revokeObjectURL(url));
    setMediaFiles([]); setMediaPreviews([]);
    setActivePackages([]); setSelectedPackageId('none'); setLessonMode('individual');
  };

  const uploadMedia = async (lessonId: string, sId: string, coachId: string) => {
    for (const file of mediaFiles) {
      const ext = file.name.split('.').pop();
      const path = `${sId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('golf-media').upload(path, file);
      if (upErr) { console.error('Upload error:', upErr); continue; }
      const { data: urlData } = supabase.storage.from('golf-media').getPublicUrl(path);
      const fileType = file.type.startsWith('video/') ? 'video' : 'image';
      await supabase.from('student_media').insert({
        student_id: sId,
        coach_id: coachId,
        file_url: urlData.publicUrl,
        file_type: fileType,
        lesson_id: lessonId,
        is_general: false,
        title: file.name,
      });
    }
  };

  const handleSave = async () => {
    if (!studentId || !date) {
      toast.error('Select a student and a date');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const coachId = user?.id || '';

      const paymentLabel = paidNum >= priceNum && priceNum > 0
        ? `✅ Paid — ${fmtAmount(paidNum)}`
        : paidNum > 0
        ? `🔶 Partial payment — ${fmtAmount(paidNum)} of ${fmtAmount(priceNum)}`
        : '⏳ Unpaid';

      const coachNoteParts = [notes, paymentLabel].filter(Boolean).join('\n');

      const packageIdToWrite =
        lessonMode === 'package' && selectedPackageId && selectedPackageId !== 'none'
          ? selectedPackageId
          : null;

      // Future-dated lessons must be saved as 'scheduled', not 'completed'.
      // They haven't happened yet, so they should not count as past lessons,
      // deduct package slots, or award points until the date arrives.
      const lessonDateStr = format(date, 'yyyy-MM-dd');
      const isFuture = lessonDateStr > getTodayInAppTimezone();

      if (lessonDateStr >= getTodayInAppTimezone()) {
        const c = await findSlotConflicts({
          dateStr: lessonDateStr,
          time: (time || '12:00').slice(0, 5),
          durationMinutes: 60,
          lessonType: 'Individual',
          studentId,
        });
        if (c.length > 0) throw new Error(`Choca con ${c.map((x) => x.label).join(', ')}. No se guardó.`);
      }

      const { data: lessonData, error } = await supabase.from('lessons').insert({
        student_id: studentId,
        lesson_date: lessonDateStr,
        lesson_time: time || '12:00',
        lesson_type: 'Individual',
        duration_minutes: 60,
        coach_notes: coachNoteParts || null,
        status: (isFuture ? 'scheduled' : 'completed') as any,
        revenue: priceNum,
        currency,
        package_id: packageIdToWrite,
      } as any).select('id').single();

      if (error) throw error;

      // Upload media if any
      if (mediaFiles.length > 0 && lessonData?.id) {
        await uploadMedia(lessonData.id, studentId, coachId);
      }

      // Only deduct packages / award points for lessons that have actually happened.
      // Future lessons will be processed by the DB trigger when the coach marks
      // them completed after the lesson takes place.
      if (isFuture) {
        // skip package deduction & points
      } else if (lessonMode === 'package') {
        // Package mode: points only when manually linking to a package; package usage is derived from linked completed lessons
        if (selectedPackageId && selectedPackageId !== 'none') {
          const { data: existingPoints } = await supabase
            .from('student_points')
            .select('*')
            .eq('user_id', studentId)
            .maybeSingle();
          if (existingPoints) {
            await supabase.from('student_points').update({
              total_points: existingPoints.total_points + 10,
              total_lessons_ever: existingPoints.total_lessons_ever + 1,
              reward_available: existingPoints.total_points + 10 >= 100 ? true : existingPoints.reward_available,
            }).eq('user_id', studentId);
          } else {
            await supabase.from('student_points').insert({
              user_id: studentId, total_points: 10, total_lessons_ever: 1,
            });
          }
        } else {
          // Auto: deduct from oldest package
          await supabase.rpc('process_lesson_completion', { p_user_id: studentId });
        }
      } else {
        // Individual mode: just award points, no package deduction
        const { data: existingPoints } = await supabase
          .from('student_points')
          .select('*')
          .eq('user_id', studentId)
          .maybeSingle();
        if (existingPoints) {
          await supabase.from('student_points').update({
            total_points: existingPoints.total_points + 10,
            total_lessons_ever: existingPoints.total_lessons_ever + 1,
            reward_available: existingPoints.total_points + 10 >= 100 ? true : existingPoints.reward_available,
          }).eq('user_id', studentId);
        } else {
          await supabase.from('student_points').insert({
            user_id: studentId, total_points: 10, total_lessons_ever: 1,
          });
        }
      }

      toast.success(isFuture ? 'Lesson scheduled' : 'Lesson created successfully');
      queryClient.invalidateQueries({ queryKey: ['today-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-packages'] });
      queryClient.invalidateQueries({ queryKey: ['student-media'] });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Error creating lesson');
    } finally {
      setSaving(false);
    }
  };

  const modeButtons: { mode: PaymentMode; label: string; emoji: string; color: string; border: string }[] = [
    { mode: 'paid', label: 'Paid', emoji: '✅', color: 'rgba(74,124,89,0.3)', border: '#4a7c59' },
    { mode: 'partial', label: 'Partial', emoji: '🔶', color: 'rgba(234,179,8,0.2)', border: '#eab308' },
    { mode: 'pending', label: 'Pending', emoji: '⏳', color: 'rgba(239,68,68,0.2)', border: '#ef4444' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">Add Lesson</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Student */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Student *</Label>
            <SearchableStudentSelect value={studentId} onValueChange={setStudentId} />
          </div>

          {/* Lesson Mode Toggle */}
          {studentId && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">Lesson type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setLessonMode('package'); setSelectedPackageId('none'); }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: lessonMode === 'package' ? 'rgba(74,124,89,0.25)' : 'rgba(255,255,255,0.05)',
                    border: lessonMode === 'package' ? '2px solid #4a7c59' : '2px solid rgba(255,255,255,0.1)',
                    color: lessonMode === 'package' ? '#F5F0E8' : 'rgba(245,240,232,0.5)',
                  }}
                >
                  <Package className="h-4 w-4" /> Apply to package
                </button>
                <button
                  type="button"
                  onClick={() => { setLessonMode('individual'); setSelectedPackageId('none'); }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: lessonMode === 'individual' ? 'rgba(232,213,176,0.15)' : 'rgba(255,255,255,0.05)',
                    border: lessonMode === 'individual' ? '2px solid #E8D5B0' : '2px solid rgba(255,255,255,0.1)',
                    color: lessonMode === 'individual' ? '#F5F0E8' : 'rgba(245,240,232,0.5)',
                  }}
                >
                  💳 Single lesson
                </button>
              </div>
            </div>
          )}

          {/* Package selector — only in package mode */}
          {studentId && lessonMode === 'package' && (
            <div className="space-y-1.5">
              {activePackages.length > 0 ? (
                <>
                  <Label className="text-[#F5F0E8]/70 text-sm flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Select package
                  </Label>
                  <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                      <SelectValue placeholder="Choose a package" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1f18] border-white/10">
                      <SelectItem value="none" className="text-[#F5F0E8]">
                        {activePackages[0]
                          ? `Auto — ${activePackages[0].package_name || `${activePackages[0].package_size} lessons`} (${activePackages[0].classes_remaining} left)`
                          : 'Auto (oldest package)'}
                      </SelectItem>
                      {activePackages.map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.id} className="text-[#F5F0E8]">
                          {pkg.package_name || `${pkg.package_size} lessons`} — {pkg.classes_remaining} remaining
                          {pkg._isShared ? ' · 👥 Shared' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPackageId !== 'none' && (() => {
                    const sel = activePackages.find((p: any) => p.id === selectedPackageId);
                    if (!sel) return null;
                    return (
                      <div className="space-y-1 mt-1">
                        <p className="text-[10px] text-[#4a7c59]">
                          1 lesson will be deducted from this package upon saving
                        </p>
                        {sel._isShared && sel._memberNames?.length > 0 && (
                          <p className="text-[10px] text-[#E8D5B0]/70">
                            👥 Shared with: {sel._memberNames.join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <p className="text-xs text-yellow-200/80">This student has no active packages. Create one first or use "Single lesson".</p>
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn(
                  'w-full justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
                  !date && 'text-[#F5F0E8]/40'
                )}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Time (optional)
            </Label>
            <HourPicker
              value={time}
              onChange={setTime}
              className="w-full"
              placeholder="Select time"
            />
          </div>

          {/* Price & Payment — only in individual mode */}
          {lessonMode === 'individual' && (
            <>
              {/* Price + Currency */}
              <div className="space-y-1.5">
                <Label className="text-[#F5F0E8]/70 text-sm">Price</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
                    <Input type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)}
                      placeholder="0" className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7" />
                  </div>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                    <SelectTrigger className="w-[100px] bg-white/5 border-white/10 text-[#F5F0E8]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1f18] border-white/10">
                      <SelectItem value="MXN" className="text-[#F5F0E8]">MXN</SelectItem>
                      <SelectItem value="USD" className="text-[#F5F0E8]">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-[#F5F0E8]/40 mt-1">Default currency is MXN</p>
              </div>

              {/* Payment Mode */}
              <div className="space-y-1.5">
                <Label className="text-[#F5F0E8]/70 text-sm">Payment Status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {modeButtons.map(b => (
                    <button key={b.mode}
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

              {/* Partial amount */}
              {paymentMode === 'partial' && (
                <div className="space-y-1.5">
                  <Label className="text-[#F5F0E8]/70 text-sm">Amount Paid ({currency})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#E8D5B0', opacity: 0.6 }}>$</span>
                    <Input type="number" min="0" step="1" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      placeholder="0" className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 pl-7" />
                  </div>
                  {priceNum > 0 && paidNum > 0 && (
                    <p className="text-xs mt-1" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                      Pending: {fmtAmount(remaining)}
                    </p>
                  )}
                </div>
              )}

              {/* Payment Date */}
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
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Lesson focus, drills..."
              className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 min-h-[60px]" />
          </div>

          {/* Media Upload - Drag & Drop */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">Photos / Videos</Label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[80px]',
                isDragging ? 'border-[#4a7c59] bg-[#4a7c59]/10' : 'border-white/15 hover:border-white/30 bg-white/5'
              )}
            >
              <Upload className="h-5 w-5 mb-1" style={{ color: '#E8D5B0', opacity: 0.5 }} />
              <p className="text-xs text-center" style={{ color: '#E8D5B0', opacity: 0.5 }}>
                Click or drag photos/videos here
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* Previews */}
            {mediaPreviews.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {mediaPreviews.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                    {mediaFiles[i]?.type.startsWith('video/') ? (
                      <div className="w-full h-full bg-black/40 flex items-center justify-center">
                        <Video className="h-5 w-5 text-[#F5F0E8]/60" />
                      </div>
                    ) : (
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving || !studentId || !date}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? 'Saving...' : 'Create Lesson'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
