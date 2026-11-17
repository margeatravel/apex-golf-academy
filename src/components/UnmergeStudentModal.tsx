import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle, Package, BookOpen, DollarSign, Video, ImageIcon, Wrench, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { fmtMXN } from '@/lib/formatCurrency';
import { toast } from 'sonner';

interface UnmergeStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
  lessons: any[];
  packages: any[];
  payments: any[];
  videos: any[];
  media: any[];
  drills: any[];
  onComplete: () => void;
}

type Step = 'profile' | 'records' | 'review';

export function UnmergeStudentModal({
  open, onOpenChange, student, lessons, packages, payments, videos, media, drills, onComplete,
}: UnmergeStudentModalProps) {
  const [step, setStep] = useState<Step>('profile');
  const [saving, setSaving] = useState(false);

  // New student profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Selected record IDs to move to the new student
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [selectedDrills, setSelectedDrills] = useState<Set<string>>(new Set());

  const toggleSet = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  };

  const totalSelected = selectedLessons.size + selectedPackages.size + selectedPayments.size + selectedVideos.size + selectedMedia.size + selectedDrills.size;

  const canProceedFromProfile = fullName.trim().length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('unmerge-student', {
        body: {
          sourceStudentId: student.id,
          newStudentProfile: {
            full_name: fullName.trim(),
            email: email.trim() || `no-email-${Date.now()}@placeholder.local`,
            phone: phone.trim() || null,
          },
          lessonIds: Array.from(selectedLessons),
          packageIds: Array.from(selectedPackages),
          paymentIds: Array.from(selectedPayments),
          videoIds: Array.from(selectedVideos),
          mediaIds: Array.from(selectedMedia),
          drillIds: Array.from(selectedDrills),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Student separated successfully. ${totalSelected} records moved to ${fullName}.`);
      onComplete();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unmerge student');
    } finally {
      setSaving(false);
    }
  };

  const resetState = () => {
    setStep('profile');
    setFullName('');
    setEmail('');
    setPhone('');
    setSelectedLessons(new Set());
    setSelectedPackages(new Set());
    setSelectedPayments(new Set());
    setSelectedVideos(new Set());
    setSelectedMedia(new Set());
    setSelectedDrills(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-warning" />
            {step === 'profile' && 'Step 1: New Student Profile'}
            {step === 'records' && 'Step 2: Select Records to Move'}
            {step === 'review' && 'Step 3: Review & Confirm'}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            {(['profile', 'records', 'review'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${step === s ? 'bg-[#4a7c59]' : i < ['profile', 'records', 'review'].indexOf(step) ? 'bg-[#4a7c59]/50' : 'bg-white/20'}`} />
                {i < 2 && <div className="w-8 h-px bg-white/10" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          {/* STEP 1: Profile */}
          {step === 'profile' && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.2)' }}>
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning/80">
                  This will create a new student profile and move selected records from <strong>{student?.full_name}</strong> to the new student. No data will be deleted.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[#F5F0E8]/70 text-sm">Full Name *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter the separated student's name"
                  className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[#F5F0E8]/70 text-sm">Email (opcional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@email.com"
                  className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[#F5F0E8]/70 text-sm">Phone (optional)</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52..."
                  className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Record Selection */}
          {step === 'records' && (
            <div className="space-y-5 py-2">
              <p className="text-xs text-[#F5F0E8]/50">
                Check the records that belong to <strong className="text-[#F5F0E8]/80">{fullName}</strong>. Unchecked records stay with <strong className="text-[#F5F0E8]/80">{student?.full_name}</strong>.
              </p>

              {/* Lessons */}
              {lessons.length > 0 && (
                <RecordSection
                  icon={<BookOpen className="h-4 w-4 text-info" />}
                  title={`Lessons (${lessons.length})`}
                  selectedCount={selectedLessons.size}
                >
                  {lessons.map((l: any) => (
                    <RecordRow
                      key={l.id}
                      checked={selectedLessons.has(l.id)}
                      onToggle={() => toggleSet(selectedLessons, setSelectedLessons, l.id)}
                      label={`${format(parseISO(l.lesson_date), 'MMM d, yyyy')} — ${l.lesson_type}`}
                      detail={l.status}
                    />
                  ))}
                </RecordSection>
              )}

              {/* Packages */}
              {packages.length > 0 && (
                <RecordSection
                  icon={<Package className="h-4 w-4 text-accent" />}
                  title={`Packages (${packages.length})`}
                  selectedCount={selectedPackages.size}
                >
                  {packages.map((p: any) => (
                    <RecordRow
                      key={p.id}
                      checked={selectedPackages.has(p.id)}
                      onToggle={() => toggleSet(selectedPackages, setSelectedPackages, p.id)}
                      label={p.package_name || `${p.package_size}-Lesson Package`}
                      detail={`${p.classes_used}/${p.package_size} used`}
                    />
                  ))}
                </RecordSection>
              )}

              {/* Payments */}
              {payments.length > 0 && (
                <RecordSection
                  icon={<DollarSign className="h-4 w-4 text-warning" />}
                  title={`Payments (${payments.length})`}
                  selectedCount={selectedPayments.size}
                >
                  {payments.map((p: any) => (
                    <RecordRow
                      key={p.id}
                      checked={selectedPayments.has(p.id)}
                      onToggle={() => toggleSet(selectedPayments, setSelectedPayments, p.id)}
                      label={`${format(parseISO(p.payment_date), 'MMM d, yyyy')} — ${p.concept}`}
                      detail={`$${Number(p.amount).toLocaleString()}`}
                    />
                  ))}
                </RecordSection>
              )}

              {/* Videos */}
              {videos.length > 0 && (
                <RecordSection
                  icon={<Video className="h-4 w-4 text-primary" />}
                  title={`Videos (${videos.length})`}
                  selectedCount={selectedVideos.size}
                >
                  {videos.map((v: any) => (
                    <RecordRow
                      key={v.id}
                      checked={selectedVideos.has(v.id)}
                      onToggle={() => toggleSet(selectedVideos, setSelectedVideos, v.id)}
                      label={v.title}
                      detail={v.category || 'video'}
                    />
                  ))}
                </RecordSection>
              )}

              {/* Media */}
              {media.length > 0 && (
                <RecordSection
                  icon={<ImageIcon className="h-4 w-4 text-green-400" />}
                  title={`Media (${media.length})`}
                  selectedCount={selectedMedia.size}
                >
                  {media.map((m: any) => (
                    <RecordRow
                      key={m.id}
                      checked={selectedMedia.has(m.id)}
                      onToggle={() => toggleSet(selectedMedia, setSelectedMedia, m.id)}
                      label={m.title || m.file_type}
                      detail={format(parseISO(m.uploaded_at), 'MMM d, yyyy')}
                    />
                  ))}
                </RecordSection>
              )}

              {/* Drills */}
              {drills.length > 0 && (
                <RecordSection
                  icon={<Wrench className="h-4 w-4 text-orange-400" />}
                  title={`Drills (${drills.length})`}
                  selectedCount={selectedDrills.size}
                >
                  {drills.map((d: any) => (
                    <RecordRow
                      key={d.id}
                      checked={selectedDrills.has(d.id)}
                      onToggle={() => toggleSet(selectedDrills, setSelectedDrills, d.id)}
                      label={d.title}
                      detail={d.category}
                    />
                  ))}
                </RecordSection>
              )}

              {lessons.length === 0 && packages.length === 0 && payments.length === 0 && videos.length === 0 && media.length === 0 && drills.length === 0 && (
                <p className="text-center text-[#F5F0E8]/40 py-8">No records to reassign.</p>
              )}
            </div>
          )}

          {/* STEP 3: Review */}
          {step === 'review' && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.2)' }}>
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning/80">
                  Please review carefully. This action will create a new student and move the selected records.
                </p>
              </div>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-semibold text-[#E8D5B0]">New Student</p>
                  <div className="text-xs space-y-1 text-[#F5F0E8]/70">
                    <p>Name: <span className="text-[#F5F0E8]">{fullName}</span></p>
                    <p>Email: <span className="text-[#F5F0E8]">{email}</span></p>
                    {phone && <p>Phone: <span className="text-[#F5F0E8]">{phone}</span></p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-semibold text-[#E8D5B0]">Records Moving to {fullName}</p>
                  <div className="text-xs space-y-1 text-[#F5F0E8]/70">
                    {selectedLessons.size > 0 && <p className="flex items-center gap-1.5"><BookOpen className="h-3 w-3 text-info" />{selectedLessons.size} lesson(s)</p>}
                    {selectedPackages.size > 0 && <p className="flex items-center gap-1.5"><Package className="h-3 w-3 text-accent" />{selectedPackages.size} package(s)</p>}
                    {selectedPayments.size > 0 && <p className="flex items-center gap-1.5"><DollarSign className="h-3 w-3 text-warning" />{selectedPayments.size} payment(s)</p>}
                    {selectedVideos.size > 0 && <p className="flex items-center gap-1.5"><Video className="h-3 w-3 text-primary" />{selectedVideos.size} video(s)</p>}
                    {selectedMedia.size > 0 && <p className="flex items-center gap-1.5"><ImageIcon className="h-3 w-3 text-green-400" />{selectedMedia.size} media file(s)</p>}
                    {selectedDrills.size > 0 && <p className="flex items-center gap-1.5"><Wrench className="h-3 w-3 text-orange-400" />{selectedDrills.size} drill(s)</p>}
                    {totalSelected === 0 && <p className="text-[#F5F0E8]/40">No records selected — only the profile will be created.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-semibold text-[#E8D5B0]">Staying with {student?.full_name}</p>
                  <div className="text-xs space-y-1 text-[#F5F0E8]/70">
                    <p className="flex items-center gap-1.5"><BookOpen className="h-3 w-3 text-info" />{lessons.length - selectedLessons.size} lesson(s)</p>
                    <p className="flex items-center gap-1.5"><Package className="h-3 w-3 text-accent" />{packages.length - selectedPackages.size} package(s)</p>
                    <p className="flex items-center gap-1.5"><DollarSign className="h-3 w-3 text-warning" />{payments.length - selectedPayments.size} payment(s)</p>
                    <p className="flex items-center gap-1.5"><Video className="h-3 w-3 text-primary" />{videos.length - selectedVideos.size} video(s)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>

        {/* Footer Nav */}
        <DialogFooter className="flex-row justify-between gap-2 pt-4 border-t border-white/10">
          {step !== 'profile' ? (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'review' ? 'records' : 'profile')}
              className="gap-1 bg-white/5 border-white/10 text-[#F5F0E8]"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          ) : <div />}

          {step === 'profile' && (
            <Button
              onClick={() => setStep('records')}
              disabled={!canProceedFromProfile}
              className="gap-1 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {step === 'records' && (
            <Button
              onClick={() => setStep('review')}
              className="gap-1 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              Review <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {step === 'review' && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-warning hover:bg-warning/80 text-warning-foreground"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving ? 'Separating...' : 'Confirm & Separate'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Sub-components
function RecordSection({ icon, title, selectedCount, children }: { icon: React.ReactNode; title: string; selectedCount: number; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[#E8D5B0]">
          {icon} {title}
        </div>
        {selectedCount > 0 && (
          <Badge className="bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30 text-[10px]">
            {selectedCount} selected
          </Badge>
        )}
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function RecordRow({ checked, onToggle, label, detail }: { checked: boolean; onToggle: () => void; label: string; detail?: string }) {
  return (
    <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="border-white/20 data-[state=checked]:bg-[#4a7c59] data-[state=checked]:border-[#4a7c59]"
      />
      <span className="text-xs text-[#F5F0E8]/80 flex-1 truncate">{label}</span>
      {detail && <span className="text-[10px] text-[#F5F0E8]/40 shrink-0">{detail}</span>}
    </label>
  );
}
