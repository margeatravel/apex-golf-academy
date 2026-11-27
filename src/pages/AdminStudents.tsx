import { useState } from 'react';
import { useCoachPreview } from '@/contexts/CoachPreviewContext';
import { Link, useNavigate } from 'react-router-dom';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Users, Search, Eye, Target, BookOpen, Video, Merge, ArrowRight, Shield, DollarSign, Package, User, Download, Archive as ArchiveIcon, ChevronDown, ChevronRight, RotateCcw, ScreenShare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoStudents } from '@/data/demoData';
import { supabase } from '@/integrations/supabase/client';
import { getEffectivePlan } from '@/contexts/AuthContext';

import { format } from 'date-fns';
import { SocialFooter } from '@/components/SocialFooter';
import { isPlaceholderEmail } from '@/lib/duplicateDetection';
import { fmtMXN } from '@/lib/formatCurrency';
import { toast } from 'sonner';

type SortOption = 'name-asc' | 'name-desc' | 'lessons-desc' | 'recent';
type PlanFilter = 'all' | 'pro' | 'scratch' | 'free';

export default function AdminStudents() {
  const previewCoachId = useCoachPreview()?.coachId ?? null;
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['admin-all-students', isDemoModeActive() ? 'demo' : 'live', previewCoachId ?? 'all'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoStudents as any[];
      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'student');

      if (rolesError) {
        console.error('Error loading student roles', rolesError);
        return [];
      }

      let studentIds = (roleRows || []).map((row: any) => row.user_id);
      // Coach preview only: keep students assigned to the previewed coach.
      if (previewCoachId && studentIds.length > 0) {
        const { data: assigned } = await supabase.from('profiles').select('id').eq('assigned_coach_id', previewCoachId).in('id', studentIds);
        studentIds = (assigned || []).map((r: any) => r.id);
      }
      if (studentIds.length === 0) return [];

      const [profilesRes, lessonsRes, videosRes, packagesRes, paymentsRes, subsRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', studentIds),
        supabase.from('lessons').select('student_id').in('student_id', studentIds).eq('status', 'completed'),
        supabase.from('videos').select('student_id').in('student_id', studentIds),
        supabase.from('class_packages').select('id, user_id, classes_remaining, package_size, is_active, created_at').in('user_id', studentIds),
        supabase.from('package_payments').select('package_id, amount'),
        supabase.from('subscriptions').select('student_id, plan_tier, status, is_active, current_period_end').in('student_id', studentIds),
      ]);

      const lessonCounts: Record<string, number> = {};
      const videoCounts: Record<string, number> = {};
      const pkgCounts: Record<string, number> = {};
      const pkgOwner: Record<string, string> = {};
      const paid: Record<string, number> = {};
      const subByStudent: Record<string, any> = {};

      lessonsRes.data?.forEach((l: any) => {
        lessonCounts[l.student_id] = (lessonCounts[l.student_id] || 0) + 1;
      });
      videosRes.data?.forEach((v: any) => {
        videoCounts[v.student_id] = (videoCounts[v.student_id] || 0) + 1;
      });
      const activePkgByUser: Record<string, any> = {};
      packagesRes.data?.forEach((p: any) => {
        pkgCounts[p.user_id] = (pkgCounts[p.user_id] || 0) + 1;
        pkgOwner[p.id] = p.user_id;
        // Track oldest active package per user (matches lesson deduction order)
        if ((p.classes_remaining ?? 0) > 0) {
          const existing = activePkgByUser[p.user_id];
          if (!existing || new Date(p.created_at).getTime() < new Date(existing.created_at).getTime()) {
            activePkgByUser[p.user_id] = p;
          }
        }
      });
      paymentsRes.data?.forEach((pp: any) => {
        const uid = pkgOwner[pp.package_id];
        if (uid) paid[uid] = (paid[uid] || 0) + Number(pp.amount || 0);
      });
      // Prefer active subscription; fallback to most recent
      subsRes.data?.forEach((s: any) => {
        if (!s.student_id) return;
        const existing = subByStudent[s.student_id];
        const isActive = s.is_active && s.status === 'active';
        if (!existing || (isActive && !(existing.is_active && existing.status === 'active'))) {
          subByStudent[s.student_id] = s;
        }
      });

      return (profilesRes.data || []).map((p: any) => {
        const sub = subByStudent[p.id];
        // Resolve effective plan with the shared helper (override > plan_tier),
        // with an active Stripe subscription as an extra upgrade path.
        const now = new Date();
        const overrideValid = p.manual_plan_override && (!p.override_expires_at || new Date(p.override_expires_at) > now);
        const isOverride = !!overrideValid;
        let effectivePlan: string = getEffectivePlan(p as any);
        if (!overrideValid && sub && sub.is_active && sub.status === 'active' && sub.plan_tier) {
          effectivePlan = sub.plan_tier;
        }

        const activePkg = activePkgByUser[p.id];
        return {
          ...p,
          lessonCount: lessonCounts[p.id] || 0,
          videoCount: videoCounts[p.id] || 0,
          packageCount: pkgCounts[p.id] || 0,
          totalPaid: paid[p.id] || 0,
          effectivePlan,
          isOverride,
          subStatus: sub?.status || null,
          activePackageRemaining: activePkg ? activePkg.classes_remaining : null,
          activePackageSize: activePkg ? activePkg.package_size : null,
        };
      });
    },
  });

  const activeStudents = students.filter((s: any) => !s.is_archived);
  const archivedStudents = students.filter((s: any) => s.is_archived);

  const filteredStudents = activeStudents
    .filter((student: any) => {
      if (planFilter !== 'all' && student.effectivePlan !== planFilter) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        student.full_name?.toLowerCase().includes(query) ||
        student.email?.toLowerCase().includes(query)
      );
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case 'name-asc':
          return (a.full_name || a.email).localeCompare(b.full_name || b.email);
        case 'name-desc':
          return (b.full_name || b.email).localeCompare(a.full_name || a.email);
        case 'lessons-desc':
          return b.lessonCount - a.lessonCount;
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          toast.error("Solo puedes seleccionar 2 estudiantes para merge");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const selectedStudents = students.filter((s: any) => selectedIds.has(s.id));

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_archived: false, archived_at: null } as any)
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
      toast.success('Estudiante restaurado');
    } catch (err: any) {
      toast.error('Error', { description: err.message });
    } finally {
      setRestoringId(null);
    }
  };

  const handleExportCsv = () => {
    if (filteredStudents.length === 0) {
      toast.error('No students to export');
      return;
    }

    const planLabel = (plan: string) => {
      switch (plan) {
        case 'pro': return 'Pro';
        case 'scratch': return 'Scratch';
        case 'free': return 'Free';
        default: return plan || 'Free';
      }
    };

    const escape = (val: any) => {
      const s = val === null || val === undefined ? '' : String(val);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = [
      'Full Name', 'Email', 'Phone', 'Plan', 'Plan Override', 'Subscription Status',
      'Handicap', 'Handicap Goal', 'GHIN Number', 'TheGrint Username',
      'Completed Lessons', 'Videos Uploaded', 'Total Packages',
      'Active Package Remaining', 'Active Package Size', 'Total Paid (MXN)',
      'Email Video Notifications', 'Created At',
    ];

    const rows = filteredStudents.map((s: any) => [
      s.full_name || '',
      s.email || '',
      s.phone || '',
      planLabel(s.effectivePlan),
      s.isOverride ? 'Yes' : 'No',
      s.subStatus || '',
      s.handicap ?? '',
      s.handicap_goal ?? '',
      s.ghin_number || '',
      s.thegrint_username || '',
      s.lessonCount,
      s.videoCount,
      s.packageCount,
      s.activePackageRemaining ?? '',
      s.activePackageSize ?? '',
      s.totalPaid,
      s.email_video_notifications ? 'Yes' : 'No',
      s.created_at ? format(new Date(s.created_at), 'yyyy-MM-dd') : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escape).join(','))
      .join('\n');

    // Prepend BOM for Excel UTF-8 compatibility
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'}`);
  };


  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, duplicateId }: { primaryId: string; duplicateId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("merge-students", {
        body: { primaryId, duplicateId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Merge completado", {
        description: `Lessons: ${data.summary.lessonsReassigned}, Packages: ${data.summary.packagesReassigned}`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-all-students"] });
      queryClient.invalidateQueries({ queryKey: ["merge-students-list"] });
      setMergeDialogOpen(false);
      setSelectedIds(new Set());
      setSwapped(false);
    },
    onError: (err: any) => {
      toast.error("Merge failed", { description: err.message });
    },
  });

  const handleConfirmMerge = () => {
    if (selectedStudents.length !== 2) return;
    const [a, b] = selectedStudents;
    const primary = swapped ? b : a;
    const dup = swapped ? a : b;
    mergeMutation.mutate({ primaryId: primary.id, duplicateId: dup.id });
  };

  const primaryStudent = selectedStudents.length === 2 ? (swapped ? selectedStudents[1] : selectedStudents[0]) : null;
  const dupStudent = selectedStudents.length === 2 ? (swapped ? selectedStudents[0] : selectedStudents[1]) : null;

  return (
    <div className="app-bg min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="hover:bg-secondary/60">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 icon-container icon-container-primary">
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold text-foreground">All Students</h1>
                <p className="text-xs text-muted-foreground">Manage your student roster</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <LanguageToggle variant="header" />
            {selectedIds.size === 2 && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => { setSwapped(false); setMergeDialogOpen(true); }}>
                <Merge className="h-4 w-4" /> Merge Selected ({selectedIds.size})
              </Button>
            )}
            {selectedIds.size === 1 && (
              <Badge variant="outline" className="text-xs">1 selected — pick another to merge</Badge>
            )}
            <Link to="/admin/merge-students">
              <Button variant="outline" size="sm" className="gap-2">
                <Merge className="h-4 w-4" /> Auto-Detect Duplicates
              </Button>
            </Link>
            <Badge variant="secondary" className="text-sm">
              {students.length} student{students.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 pb-mobile-safe">
        <Card className="card-elevated">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-lg z-50">
                  <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                  <SelectItem value="lessons-desc">Most Lessons</SelectItem>
                  <SelectItem value="recent">Most Recent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={(value: PlanFilter) => setPlanFilter(value)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by plan..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-lg z-50">
                  <SelectItem value="all">All plans</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="scratch">Scratch</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={filteredStudents.length === 0}
                className="gap-2 w-full sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Export CSV ({filteredStudents.length})
              </Button>
            </div>
          </CardContent>
        </Card>


        <Card className="card-elevated overflow-hidden">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-lg">Student Roster</CardTitle>
            <CardDescription>
              {filteredStudents.length} of {students.length} students shown
              {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="font-heading font-semibold text-lg mb-2">
                  {searchQuery ? 'No students found' : 'No students yet'}
                </h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  {searchQuery 
                    ? 'Try adjusting your search query' 
                    : 'Students will appear here once they sign up and book lessons via Calendly'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold text-center">Plan</TableHead>
                      <TableHead className="font-semibold text-center">Package</TableHead>
                      <TableHead className="font-semibold text-center">Lessons</TableHead>
                      <TableHead className="font-semibold text-center">Videos</TableHead>
                      <TableHead className="font-semibold">Member Since</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student: any) => (
                      <TableRow key={student.id} className={`hover:bg-secondary/30 ${selectedIds.has(student.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(student.id)}
                            onCheckedChange={() => toggleSelection(student.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                              {student.full_name?.charAt(0) || student.email.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">
                              {student.full_name || 'No name'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.email}
                        </TableCell>
                        <TableCell className="text-center">
                          <PlanBadge plan={student.effectivePlan} isOverride={student.isOverride} />
                        </TableCell>
                        <TableCell className="text-center">
                          {student.activePackageRemaining !== null ? (
                            <Badge className="bg-primary/15 text-primary border-primary/25">
                              <Package className="h-3 w-3 mr-1" />
                              {student.activePackageSize - student.activePackageRemaining}/{student.activePackageSize}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">No package</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <span className="font-medium">{student.lessonCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Video className="h-4 w-4 text-accent" />
                            <span className="font-medium">{student.videoCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(student.created_at), 'MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Link to={`/admin/student/${student.id}`}>
                              <Button variant="outline" size="sm" className="gap-2">
                                <Eye className="h-4 w-4" />
                                View Profile
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
                              onClick={() => navigate(`/admin/student-preview/${student.id}`)}
                            >
                              <ScreenShare className="h-4 w-4" />
                              Ver como alumno
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Archived students */}
        <Card className="card-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <ArchiveIcon className="h-4 w-4 text-warning" />
              <span className="font-heading font-semibold">Alumnos archivados</span>
              <Badge variant="secondary" className="ml-1">{archivedStudents.length}</Badge>
            </div>
          </button>
          {showArchived && (
            <CardContent className="p-0 border-t border-border/50">
              {archivedStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay alumnos archivados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="font-semibold">Name</TableHead>
                        <TableHead className="font-semibold">Email</TableHead>
                        <TableHead className="font-semibold text-center">Lessons</TableHead>
                        <TableHead className="font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {archivedStudents.map((student: any) => (
                        <TableRow key={student.id} className="hover:bg-secondary/30 opacity-80">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                                {student.full_name?.charAt(0) || student.email.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium">{student.full_name || 'No name'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{student.email}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <BookOpen className="h-4 w-4 text-primary" />
                              <span className="font-medium">{student.lessonCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Link to={`/admin/student/${student.id}`}>
                                <Button variant="outline" size="sm" className="gap-1.5">
                                  <Eye className="h-4 w-4" /> View
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                onClick={() => handleRestore(student.id)}
                                disabled={restoringId === student.id}
                              >
                                <RotateCcw className="h-4 w-4" /> Restore
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </main>

      {/* Manual merge dialog */}
      <AlertDialog open={mergeDialogOpen} onOpenChange={(o) => { if (!o) { setMergeDialogOpen(false); setSwapped(false); } }}>
        <AlertDialogContent className="max-w-2xl w-[95vw] overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-warning" /> Manual Merge
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm">All history from the <strong>duplicate</strong> will be moved into the <strong>surviving</strong> record. The duplicate profile will be deactivated.</p>
                {primaryStudent && dupStudent && (
                  <>
                    <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      <MergeCard student={primaryStudent} label="Surviving" variant="primary" />
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      <MergeCard student={dupStudent} label="Will be merged" variant="destructive" />
                    </div>
                    <div className="flex flex-col gap-3 sm:hidden">
                      <MergeCard student={primaryStudent} label="Surviving" variant="primary" />
                      <div className="flex justify-center"><ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" /></div>
                      <MergeCard student={dupStudent} label="Will be merged" variant="destructive" />
                    </div>
                  </>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSwapped(!swapped)}>
                  ↔ Swap surviving / duplicate
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMerge}
              disabled={mergeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mergeMutation.isPending ? "Merging…" : "Confirm Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SocialFooter />
    </div>
  );
}

function MergeCard({ student, label, variant }: { student: any; label: string; variant: "primary" | "destructive" }) {
  return (
    <div className={`p-4 rounded-xl border space-y-2 min-w-0 overflow-hidden ${variant === "primary" ? "bg-primary/10 border-primary/20" : "bg-destructive/10 border-destructive/20"}`}>
      <Badge className={variant === "primary" ? "bg-primary text-primary-foreground" : ""} variant={variant === "destructive" ? "destructive" : "default"}>{label}</Badge>
      <p className="font-semibold text-sm truncate">{student.full_name || "—"}</p>
      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs truncate"><BookOpen className="h-3 w-3 text-info shrink-0" />{student.lessonCount ?? 0} lessons</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><Package className="h-3 w-3 text-accent shrink-0" />{student.packageCount ?? 0} pkgs</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><DollarSign className="h-3 w-3 text-warning shrink-0" />{fmtMXN(student.totalPaid || 0)}</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><User className="h-3 w-3 shrink-0" />HC: {student.handicap ?? "—"}</div>
      </div>
      <Badge variant="outline" className={`text-[10px] ${isPlaceholderEmail(student.email) ? "text-warning border-warning/40" : "text-primary border-primary/25"}`}>
        {isPlaceholderEmail(student.email) ? "Import Placeholder" : "Real Account"}
      </Badge>
    </div>
  );
}

function PlanBadge({ plan, isOverride }: { plan: string; isOverride?: boolean }) {
  const config: Record<string, { label: string; className: string }> = {
    free: { label: 'Free', className: 'bg-ivory/10 text-ivory/80 border-ivory/20' },
    member: { label: 'Free', className: 'bg-ivory/10 text-ivory/80 border-ivory/20' },
    scratch: { label: 'Scratch', className: 'bg-[#4a7c59] text-white border-[#4a7c59]' },
    pro: { label: 'Pro', className: 'bg-[#F0C040] text-black border-[#F0C040]' },
  };
  const c = config[plan] || config.free;
  return (
    <Badge variant="outline" className={`${c.className} font-medium`} title={isOverride ? 'Manual override' : undefined}>
      {c.label}{isOverride ? ' *' : ''}
    </Badge>
  );
}
