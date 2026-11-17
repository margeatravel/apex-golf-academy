import { useState, useMemo } from 'react';
import { formatLessonDate, formatLessonTime } from '@/lib/formatLessonDateTime';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, User, BookOpen, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';

interface ReassignVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoTitle: string;
  currentStudentId: string;
}

type Step = 'student' | 'destination' | 'lesson' | 'confirm';
type Destination = 'profile' | 'lesson';

export function ReassignVideoModal({ open, onOpenChange, videoId, videoTitle, currentStudentId }: ReassignVideoModalProps) {
  const [step, setStep] = useState<Step>('student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(currentStudentId);
  const [destination, setDestination] = useState<Destination>('profile');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all students
  const { data: students = [] } = useQuery({
    queryKey: ['all-profiles-reassign'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name');
      return data || [];
    },
    enabled: open,
  });

  // Fetch lessons for selected student
  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ['student-lessons-reassign', selectedStudentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type')
        .eq('student_id', selectedStudentId)
        .order('lesson_date', { ascending: false });
      return data || [];
    },
    enabled: open && !!selectedStudentId && step === 'lesson',
  });

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [students, search]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  const reset = () => {
    setStep('student');
    setSelectedStudentId(currentStudentId);
    setDestination('profile');
    setSelectedLessonId(null);
    setSearch('');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleNext = () => {
    if (step === 'student') setStep('destination');
    else if (step === 'destination') {
      if (destination === 'lesson') setStep('lesson');
      else setStep('confirm');
    } else if (step === 'lesson') setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'confirm') setStep(destination === 'lesson' ? 'lesson' : 'destination');
    else if (step === 'lesson') setStep('destination');
    else if (step === 'destination') setStep('student');
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      // Update video: change student, category, and optionally lesson_id
      const updateData: Record<string, any> = {
        student_id: selectedStudentId,
        category: destination === 'lesson' ? 'lesson' : 'profile',
        lesson_id: destination === 'lesson' ? selectedLessonId : null,
      };

      const { error: videoError } = await supabase
        .from('videos')
        .update(updateData)
        .eq('id', videoId);

      if (videoError) throw videoError;

      // Delete the analysis_request record for this video
      const { error: arError } = await supabase
        .from('analysis_requests')
        .delete()
        .eq('video_id', videoId);

      if (arError) console.warn('Could not remove analysis request record:', arError);

      toast({ title: 'Video reassigned', description: `"${videoTitle}" moved to ${destination === 'lesson' ? 'lesson' : 'profile media'}.` });

      queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['student-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      queryClient.invalidateQueries({ queryKey: ['recent-videos'] });

      handleOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Reassignment failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reassign Video</DialogTitle>
          <DialogDescription>Move "{videoTitle}" to a different student or destination.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
          {/* Step 1: Student */}
          {step === 'student' && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select target student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y divide-border">
                {filteredStudents.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-accent/50 transition-colors ${s.id === selectedStudentId ? 'bg-accent' : ''}`}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.full_name || 'No name'}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                    {s.id === selectedStudentId && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
                {filteredStudents.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No students found</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Destination */}
          {step === 'destination' && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Where should this video go?</Label>
              <RadioGroup value={destination} onValueChange={v => setDestination(v as Destination)} className="space-y-3">
                <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${destination === 'profile' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
                  <RadioGroupItem value="profile" />
                  <User className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Student Profile Media</p>
                    <p className="text-xs text-muted-foreground">General profile video, not linked to a lesson</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${destination === 'lesson' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
                  <RadioGroupItem value="lesson" />
                  <BookOpen className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Specific Lesson</p>
                    <p className="text-xs text-muted-foreground">Attach to a particular lesson record</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* Step 3: Lesson picker */}
          {step === 'lesson' && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select lesson for {selectedStudent?.full_name}</Label>
              {lessonsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : lessons.length > 0 ? (
                <div className="max-h-60 overflow-y-auto border rounded-md divide-y divide-border">
                  {lessons.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLessonId(l.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-accent/50 transition-colors ${l.id === selectedLessonId ? 'bg-accent' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{formatLessonDate(l, 'short')} · {formatLessonTime(l)}</p>
                        <p className="text-xs text-muted-foreground">{l.lesson_type}</p>
                      </div>
                      {l.id === selectedLessonId && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No lessons found for this student</p>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Confirm reassignment</Label>
              <div className="border rounded-lg p-4 space-y-3 bg-accent/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Video:</span>
                  <span className="text-sm font-medium truncate">{videoTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Student:</span>
                  <span className="text-sm font-medium truncate">{selectedStudent?.full_name || selectedStudent?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Destination:</span>
                  <Badge variant="secondary">
                    {destination === 'lesson' ? `Lesson – ${selectedLesson ? formatLessonDate(selectedLesson, 'short') : ''}` : 'Profile Media'}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">The video will be removed from Analysis Requests and moved to the selected destination. This cannot be undone automatically.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 pt-2 border-t">
          {step !== 'student' && (
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>Back</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          {step === 'confirm' ? (
            <Button onClick={handleConfirm} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Moving…</> : <>Confirm Move<ArrowRight className="h-4 w-4" /></>}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={
                (step === 'student' && !selectedStudentId) ||
                (step === 'lesson' && !selectedLessonId)
              }
              className="gap-2"
            >
              Next<ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
