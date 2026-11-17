import { useState } from 'react';
import { formatLessonDate, formatLessonTime } from '@/lib/formatLessonDateTime';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { User, BookOpen, BarChart3, CheckCircle, Loader2, ArrowRight } from 'lucide-react';

interface ReclassifyVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoTitle: string;
  currentCategory: string | null;
  currentLessonId: string | null;
  studentId: string;
}

type Category = 'profile' | 'analysis' | 'lesson';
type Step = 'category' | 'lesson' | 'confirm';

export function ReclassifyVideoModal({
  open, onOpenChange, videoId, videoTitle, currentCategory, currentLessonId, studentId,
}: ReclassifyVideoModalProps) {
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<Category>((currentCategory as Category) || 'profile');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(currentLessonId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['student-lessons-reclassify', studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type')
        .eq('student_id', studentId)
        .order('lesson_date', { ascending: false });
      return data || [];
    },
    enabled: open && step === 'lesson',
  });

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  const reset = () => {
    setStep('category');
    setCategory((currentCategory as Category) || 'profile');
    setSelectedLessonId(currentLessonId);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleNext = () => {
    if (step === 'category') {
      if (category === 'lesson') setStep('lesson');
      else setStep('confirm');
    } else if (step === 'lesson') setStep('confirm');
  };

  const handleBack = () => {
    if (step === 'confirm') setStep(category === 'lesson' ? 'lesson' : 'category');
    else if (step === 'lesson') setStep('category');
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('videos')
        .update({
          category,
          lesson_id: category === 'lesson' ? selectedLessonId : null,
        })
        .eq('id', videoId);

      if (error) throw error;

      toast({ title: 'Video reclassified', description: `"${videoTitle}" moved to ${category}.` });

      queryClient.invalidateQueries({ queryKey: ['student-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      queryClient.invalidateQueries({ queryKey: ['recent-videos'] });
      handleOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryLabel = (c: string) =>
    c === 'analysis' ? 'Analysis' : c === 'lesson' ? 'Lesson' : 'Profile';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md w-[95vw] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reclassify Video</DialogTitle>
          <DialogDescription>Change the category of "{videoTitle}"</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
          {step === 'category' && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Select new category</Label>
              <RadioGroup value={category} onValueChange={v => setCategory(v as Category)} className="space-y-3">
                <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${category === 'profile' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
                  <RadioGroupItem value="profile" />
                  <User className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Profile Video</p>
                    <p className="text-xs text-muted-foreground">General video, not linked to a lesson</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${category === 'analysis' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
                  <RadioGroupItem value="analysis" />
                  <BarChart3 className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Analysis Video</p>
                    <p className="text-xs text-muted-foreground">Submitted for coach review</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${category === 'lesson' ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
                  <RadioGroupItem value="lesson" />
                  <BookOpen className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Lesson Video</p>
                    <p className="text-xs text-muted-foreground">Attach to a specific lesson</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          {step === 'lesson' && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select lesson</Label>
              {isLoading ? (
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
                <p className="text-sm text-muted-foreground text-center py-6">No lessons found</p>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Confirm reclassification</Label>
              <div className="border rounded-lg p-4 space-y-3 bg-accent/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Video:</span>
                  <span className="text-sm font-medium truncate">{videoTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">From:</span>
                  <Badge variant="outline">{categoryLabel(currentCategory || 'profile')}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">To:</span>
                  <Badge variant="secondary">
                    {category === 'lesson' && selectedLesson
                      ? `Lesson – ${formatLessonDate(selectedLesson, 'short')}`
                      : categoryLabel(category)}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 pt-2 border-t">
          {step !== 'category' && (
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>Back</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          {step === 'confirm' ? (
            <Button onClick={handleConfirm} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <>Confirm<ArrowRight className="h-4 w-4" /></>}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={step === 'lesson' && !selectedLessonId}
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
