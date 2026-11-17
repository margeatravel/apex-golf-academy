import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Merge, Search, AlertTriangle, Package, BookOpen, Video } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { hasRemainingLessons } from '@/lib/packageStatus';

interface MergeFromProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStudent: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

export function MergeFromProfileModal({ open, onOpenChange, currentStudent }: MergeFromProfileModalProps) {
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all students except current
  const { data: allStudents = [] } = useQuery({
    queryKey: ['merge-all-students-profile'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .neq('id', currentStudent.id)
        .order('full_name');
      return (profiles || []).filter((p: any) => {
        const isMerged =
          (p.email && /^merged\+.*@archived\.local$/i.test(p.email)) ||
          (p.full_name && p.full_name.startsWith('[MERGED]'));
        return !isMerged;
      });
    },
    enabled: open,
  });

  // Fetch selected student details
  const selectedStudent = allStudents.find((s: any) => s.id === selectedStudentId);

  const { data: selectedStats } = useQuery({
    queryKey: ['merge-student-stats', selectedStudentId],
    queryFn: async () => {
      if (!selectedStudentId) return null;
      const [lessonsRes, pkgsRes, videosRes] = await Promise.all([
        supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('student_id', selectedStudentId),
        supabase.from('class_packages').select('id, package_name, classes_remaining, is_active').eq('user_id', selectedStudentId),
        supabase.from('videos').select('id', { count: 'exact', head: true }).eq('student_id', selectedStudentId),
      ]);
      return {
        lessonCount: lessonsRes.count || 0,
        videoCount: videosRes.count || 0,
        packages: pkgsRes.data || [],
      };
    },
    enabled: !!selectedStudentId,
  });

  const filtered = allStudents.filter((s: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const handleMerge = async () => {
    if (!selectedStudentId) return;
    setMerging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Current student is PRIMARY (keeps), selected is DUPLICATE (gets absorbed)
      const res = await supabase.functions.invoke('merge-students', {
        body: { primaryId: currentStudent.id, duplicateId: selectedStudentId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({
        title: 'Students merged',
        description: `Lessons: ${res.data.summary.lessonsReassigned}, Packages: ${res.data.summary.packagesReassigned}, Videos: ${res.data.summary.videosReassigned}`,
      });

      queryClient.invalidateQueries({ queryKey: ['student-detail'] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['student-packages'] });
      queryClient.invalidateQueries({ queryKey: ['student-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-payments'] });
      queryClient.invalidateQueries({ queryKey: ['student-media'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['all-students'] });
      queryClient.invalidateQueries({ queryKey: ['merge-students-list'] });

      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  };

  const resetState = () => {
    setSearch('');
    setSelectedStudentId(null);
    setConfirmStep(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!merging) { onOpenChange(v); if (!v) resetState(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />
            Merge with another student
          </DialogTitle>
          <DialogDescription>
            All records of the selected student will be moved to the profile of <strong>{currentStudent.full_name || currentStudent.email}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!confirmStep ? (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search duplicate student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Student list */}
            <ScrollArea className="h-[280px] border rounded-lg">
              <div className="p-2 space-y-1">
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No students found</p>
                )}
                {filtered.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                      selectedStudentId === s.id
                        ? 'bg-primary/15 border border-primary/30'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <p className="font-medium truncate">{s.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>

            <Button
              className="w-full"
              disabled={!selectedStudentId}
              onClick={() => setConfirmStep(true)}
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Confirm view */}
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
              <Badge className="bg-primary text-primary-foreground text-xs">Kept</Badge>
              <p className="font-semibold text-sm">{currentStudent.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{currentStudent.email}</p>
            </div>

            <div className="flex justify-center">
              <Merge className="h-5 w-5 text-muted-foreground rotate-90" />
            </div>

            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
              <Badge variant="destructive" className="text-xs">Absorbed</Badge>
              <p className="font-semibold text-sm">{selectedStudent?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{selectedStudent?.email}</p>
              {selectedStats && (
                <div className="flex gap-3 pt-1 flex-wrap">
                  <span className="text-xs flex items-center gap-1"><BookOpen className="h-3 w-3" />{selectedStats.lessonCount} lessons</span>
                  <span className="text-xs flex items-center gap-1"><Package className="h-3 w-3" />{selectedStats.packages.length} packages</span>
                  {selectedStats.videoCount > 0 && (
                    <span className="text-xs flex items-center gap-1"><Video className="h-3 w-3" />{selectedStats.videoCount} videos</span>
                  )}
                </div>
              )}
            </div>

            {selectedStats && (selectedStats.packages.filter((p: any) => hasRemainingLessons(p)).length > 0 || selectedStats.videoCount > 0) && (
              <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                {selectedStats.packages.filter((p: any) => hasRemainingLessons(p)).length > 0 && (
                  <>
                    <p className="text-xs font-medium flex items-center gap-1.5 mb-1">
                      <Package className="h-3.5 w-3.5 text-accent" />
                      Packages to be transferred:
                    </p>
                    {selectedStats.packages.filter((p: any) => hasRemainingLessons(p)).map((pkg: any) => (
                      <p key={pkg.id} className="text-xs text-muted-foreground ml-5">
                        • {pkg.package_name || 'Package'} — {pkg.classes_remaining} lessons remaining
                      </p>
                    ))}
                  </>
                )}
                {selectedStats.videoCount > 0 && (
                  <p className="text-xs font-medium flex items-center gap-1.5 mt-2">
                    <Video className="h-3.5 w-3.5 text-accent" />
                    {selectedStats.videoCount} video{selectedStats.videoCount !== 1 ? 's' : ''} to be transferred to the main profile
                  </p>
                )}
              </div>
            )}

            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                This action is irreversible. All data of the absorbed student will be moved to the main profile, including lesson packages and videos.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmStep(false)} disabled={merging}>
                Back
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={handleMerge}
                disabled={merging}
              >
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
                Merge
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
