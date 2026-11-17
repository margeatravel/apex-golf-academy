import { LessonsGivenPdfButton } from '@/components/pdf/ScheduleExportButtons';
import { useState, useEffect } from 'react';
import { fmtMXN } from '@/lib/formatCurrency';
import { Link, useSearchParams } from 'react-router-dom';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Calendar, CalendarDays, Clock, User, DollarSign, Package, Trash2, Loader2, MoreVertical, Users, CreditCard, Repeat, Search, X, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { buildDemoLessons, demoRecurringSlots } from '@/data/demoData';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { formatLessonDate, formatLessonTime, getTodayInAppTimezone } from '@/lib/formatLessonDateTime';
import { SocialFooter } from '@/components/SocialFooter';
import { ImportedPackageReview } from '@/components/ImportedPackageReview';
import { useToast } from '@/hooks/use-toast';
import { AdminPackagesView } from '@/components/AdminPackagesView';
import { AdminSubscribersView } from '@/components/AdminSubscribersView';
import { AdminRecurringSchedulesView } from '@/components/AdminRecurringSchedulesView';
import { useNavigate } from 'react-router-dom';
import { PendingLessonsOwedPanel } from '@/components/PendingLessonsOwedPanel';
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';
import { AdminCalendarBody } from '@/components/calendar/AdminCalendarBody';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAssignedStudentIds } from '@/hooks/useAssignedStudentIds';

type TabValue = 'all' | 'today' | 'upcoming' | 'completed' | 'cancelled' | 'no_show' | 'recurring';
type SectionValue = 'lessons' | 'packages' | 'subscribers' | 'recurring' | 'imported' | 'calendar';

export default function AdminLessons() {
  const { t } = useLanguage();
  const { isOwner, studentIds } = useAssignedStudentIds();
  const scopeKey = isOwner ? 'all' : `coach:${(studentIds ?? []).slice().sort().join(',')}`;
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabValue | null;
  const sectionFromUrl = searchParams.get('section') as SectionValue | null;
  const [activeTab, setActiveTab] = useState<TabValue>(tabFromUrl && ['all', 'today', 'upcoming', 'completed', 'no_show', 'recurring'].includes(tabFromUrl) ? tabFromUrl : 'all');
  const [activeSection, setActiveSection] = useState<SectionValue>(
    sectionFromUrl === 'packages' ? 'packages'
      : sectionFromUrl === 'subscribers' ? 'subscribers'
      : sectionFromUrl === 'recurring' ? 'recurring'
      : sectionFromUrl === 'imported' ? 'imported'
      : sectionFromUrl === 'calendar' ? 'calendar'
      : 'lessons'
  );
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [isDeletingLessons, setIsDeletingLessons] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
  const [studentFilter, setStudentFilter] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Legacy hash → redirect to the new master Calendar page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#recurring') return;
    navigate('/admin/calendar', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (tabFromUrl && ['all', 'today', 'upcoming', 'completed', 'no_show', 'recurring'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['admin-all-lessons', isDemoModeActive() ? 'demo' : 'live', scopeKey],
    queryFn: async () => {
      if (isDemoModeActive()) return buildDemoLessons();
      // Non-owner coaches only see lessons of their assigned students.
      if (!isOwner) {
        if (!studentIds || studentIds.length === 0) return [];
      }
      let q = supabase
        .from('lessons')
        .select('*, profiles!lessons_student_id_fkey(id, full_name, email)')
        .order('lesson_date', { ascending: false })
        .order('lesson_time', { ascending: false });
      if (!isOwner && studentIds) q = q.in('student_id', studentIds);
      const { data, error } = await q;
      if (error) { console.error('Error fetching lessons:', error); return []; }
      return data || [];
    },
  });

  const { data: recurringCount = 0 } = useQuery({
    queryKey: ['admin-recurring-slots-count', isDemoModeActive() ? 'demo' : 'live', scopeKey],
    queryFn: async () => {
      if (isDemoModeActive()) return demoRecurringSlots.length;
      if (!isOwner) {
        if (!studentIds || studentIds.length === 0) return 0;
      }
      let q = supabase
        .from('recurring_lesson_slots')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      if (!isOwner && studentIds) q = q.in('student_id', studentIds);
      const { count, error } = await q;
      if (error) { console.error('Error counting recurring slots:', error); return 0; }
      return count || 0;
    },
  });

  const todayStr = getTodayInAppTimezone();

  const filteredLessons = lessons.filter((lesson: any) => {
    // Student name/email filter
    if (studentFilter.trim()) {
      const q = studentFilter.trim().toLowerCase();
      const name = (lesson.profiles?.full_name || '').toLowerCase();
      const email = (lesson.profiles?.email || '').toLowerCase();
      const invitee = (lesson.invitee_name || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q) && !invitee.includes(q)) return false;
    }
    switch (activeTab) {
      case 'today': return lesson.lesson_date === todayStr;
      case 'upcoming': return lesson.status === 'scheduled' && lesson.lesson_date >= todayStr;
      case 'completed': return lesson.status === 'completed';
      case 'cancelled': return lesson.status === 'cancelled';
      case 'no_show': return lesson.status === 'no_show';
      default: return true;
    }
  });

  const sortedLessons = [...filteredLessons].sort((a: any, b: any) => {
    const keyA = `${a.lesson_date}T${a.lesson_time}`;
    const keyB = `${b.lesson_date}T${b.lesson_time}`;
    return activeTab === 'upcoming' ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
  });

  const stats = {
    total: lessons.length,
    today: lessons.filter((l: any) => l.lesson_date === todayStr).length,
    upcoming: lessons.filter((l: any) => l.status === 'scheduled' && l.lesson_date >= todayStr).length,
    completed: lessons.filter((l: any) => l.status === 'completed').length,
    no_show: lessons.filter((l: any) => l.status === 'no_show').length,
    cancelled: lessons.filter((l: any) => l.status === 'cancelled').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-success/15 text-success border-success/25">{t('coachUi.completed')}</Badge>;
      case 'scheduled': return <Badge className="bg-status-scheduled/15 text-status-scheduled border-status-scheduled/25">{t('coachUi.scheduled')}</Badge>;
      case 'no_show': return <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/25">{t('coachUi.noShow')}</Badge>;
      case 'cancelled': return <Badge className="bg-destructive/15 text-destructive border-destructive/25">{t('coachUi.cancelled')}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleStatusChange = async (lessonId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('lessons').update({ status: newStatus as any }).eq('id', lessonId);
      if (error) throw error;
      toast({ title: `Lesson marked as ${newStatus === 'no_show' ? 'No Show' : newStatus}` });
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['today-lessons'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-lessons'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleLessonSelect = (id: string) => {
    setSelectedLessons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllLessons = () => {
    if (selectedLessons.size === sortedLessons.length) {
      setSelectedLessons(new Set());
    } else {
      setSelectedLessons(new Set(sortedLessons.map((l: any) => l.id)));
    }
  };

  const handleDeleteLessons = async () => {
    if (selectedLessons.size === 0) return;
    setIsDeletingLessons(true);
    try {
      const ids = Array.from(selectedLessons);
      const { error } = await supabase.from('lessons').delete().in('id', ids);
      if (error) throw error;
      toast({ title: 'Deleted', description: `${ids.length} lesson(s) deleted.` });
      setSelectedLessons(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsDeletingLessons(false);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="hover:bg-secondary/60">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('adminTabs.backToDashboard')}
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 icon-container icon-container-primary">
                <Calendar className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold text-foreground">{t('adminTabs.pageTitle')}</h1>
                <p className="text-xs text-muted-foreground">{t('adminTabs.pageSubtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <LanguageToggle variant="header" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Top-level section switcher */}
        <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/50 w-fit flex-wrap">
          <Button
            variant={activeSection === 'lessons' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => { setActiveSection('lessons'); setSelectedLessons(new Set()); }}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            {t('adminTabs.lessons')}
          </Button>
          <Button
            variant={activeSection === 'packages' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('packages')}
            className="gap-2"
          >
            <Package className="h-4 w-4" />
            {t('adminTabs.packages')}
          </Button>
          <Button
            variant={activeSection === 'subscribers' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('subscribers')}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            {t('adminTabs.subscribers')}
          </Button>
          <Button
            variant={activeSection === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('calendar')}
            className="gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            {t('adminTabs.liveCalendar')}
          </Button>
          <Button
            variant={activeSection === 'recurring' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('recurring')}
            className="gap-2"
          >
            <Repeat className="h-4 w-4" />
            {t('adminTabs.recurring')}
          </Button>
          <Button
            variant={activeSection === 'imported' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('imported')}
            className="gap-2"
          >
            <CreditCard className="h-4 w-4" />
            {t('adminTabs.importedReview')}
          </Button>
        </div>

        {activeSection === 'lessons' ? (
          <>
            <div className="flex justify-end"><LessonsGivenPdfButton /></div>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('adminTabs.totalLessons'), value: stats.total, color: 'text-foreground', target: null as { kind: 'tab' | 'section'; value: string } | null },
                { label: t('adminTabs.upcoming'), value: stats.upcoming, color: 'text-status-scheduled', target: { kind: 'tab' as const, value: 'upcoming' } },
                { label: t('adminTabs.completed'), value: stats.completed, color: 'text-success', target: { kind: 'tab' as const, value: 'completed' } },
                { label: t('adminTabs.recurringSchedule'), value: recurringCount, color: 'text-[#F0C040]', target: { kind: 'section' as const, value: 'recurring' } },
              ].map(s => {
                const card = (
                  <Card key={s.label} className={`card-elevated ${s.target ? 'cursor-pointer hover:border-[#F0C040]/40 transition-colors' : ''}`}>
                    <CardContent className="pt-5 pb-4">
                      <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-3xl font-heading font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                );
                return s.target ? (
                  <button
                    key={s.label}
                    type="button"
                    className="text-left"
                    onClick={() => {
                      if (s.target!.kind === 'section') {
                        setActiveSection(s.target!.value as SectionValue);
                      } else {
                        setActiveTab(s.target!.value as TabValue);
                        setSelectedLessons(new Set());
                      }
                    }}
                  >
                    {card}
                  </button>
                ) : card;
              })}
            </div>

            {/* Pending lessons owed via active packages — shown on Upcoming tab */}
            {activeTab === 'upcoming' && <PendingLessonsOwedPanel />}

            {/* Lessons table */}
            <Card className="card-elevated overflow-hidden">
              <div className="border-b border-border/50 px-4 pt-4 pb-3">
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabValue); setSelectedLessons(new Set()); }}>
                  <TabsList className="grid w-full max-w-2xl grid-cols-5">
                    <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                    <TabsTrigger value="today">Today ({stats.today})</TabsTrigger>
                    <TabsTrigger value="upcoming">Upcoming ({stats.upcoming})</TabsTrigger>
                    <TabsTrigger value="completed">Done ({stats.completed})</TabsTrigger>
                    <TabsTrigger value="no_show">No Show ({stats.no_show})</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Student filter */}
                <div className="mt-3 flex items-center gap-2 max-w-md">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={studentFilter}
                      onChange={(e) => { setStudentFilter(e.target.value); setSelectedLessons(new Set()); }}
                      placeholder={t('coachUi.filterByStudent')}
                      className="pl-9 pr-9 h-9"
                    />
                    {studentFilter && (
                      <button
                        type="button"
                        onClick={() => setStudentFilter('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {studentFilter && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {sortedLessons.length} match{sortedLessons.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
              </div>



                {/* Bulk action bar for lessons */}
                {sortedLessons.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedLessons.size === sortedLessons.length && sortedLessons.length > 0}
                      onCheckedChange={toggleAllLessons}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedLessons.size} selected
                    </span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        disabled={selectedLessons.size === 0 || isDeletingLessons}
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                      >
                        {isDeletingLessons ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete ({selectedLessons.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedLessons.size} lesson(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {selectedLessons.size} selected lesson(s). This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('coachUi.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteLessons} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : sortedLessons.length === 0 ? (
                  <div className="py-16 text-center">
                    <Calendar className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
                    <h3 className="font-heading font-semibold text-lg mb-2">
                      No {activeTab === 'all' ? '' : activeTab} lessons found
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                      {activeTab === 'all'
                        ? 'Sync with Calendly to import your lesson bookings'
                        : `No ${activeTab} lessons at this time`}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="font-semibold">{t('coachUi.date')}</TableHead>
                          <TableHead className="font-semibold">{t('coachUi.time')}</TableHead>
                          <TableHead className="font-semibold">{t('coachUi.student')}</TableHead>
                          <TableHead className="font-semibold">{t('coachUi.type')}</TableHead>
                          <TableHead className="font-semibold text-center">{t('coachUi.duration')}</TableHead>
                          <TableHead className="font-semibold text-center">{t('coachUi.status')}</TableHead>
                          <TableHead className="font-semibold text-right">{t('coachUi.revenue')}</TableHead>
                          <TableHead className="font-semibold text-right">{t('coachUi.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLessons.map((lesson: any) => (
                          <TableRow key={lesson.id} className={`hover:bg-secondary/30 ${selectedLessons.has(lesson.id) ? 'bg-primary/5' : ''}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedLessons.has(lesson.id)}
                                onCheckedChange={() => toggleLessonSelect(lesson.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {formatLessonDate(lesson, 'short')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span>{formatLessonTime(lesson)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-xs">
                                  {lesson.profiles?.full_name?.charAt(0) || lesson.profiles?.email?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <span className="font-medium">
                                  {lesson.profiles?.full_name || lesson.profiles?.email || 'Unknown'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal">
                                {lesson.lesson_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-muted-foreground">{lesson.duration_minutes} min</span>
                            </TableCell>
                            <TableCell className="text-center">
                              {getStatusBadge(lesson.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              {lesson.status === 'completed' && lesson.revenue ? (
                                <div className="flex items-center justify-end gap-1 text-success font-medium">
                                  <DollarSign className="h-4 w-4" />
                                  {fmtMXN(Number(lesson.revenue))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {lesson.student_id && (
                                  <Link to={`/admin/student/${lesson.student_id}`}>
                                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                                      <User className="h-3.5 w-3.5" />
                                      Student
                                    </Button>
                                  </Link>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => setEditingLesson(lesson)}
                                      className="gap-2 cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit lesson
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs">{t('coachUi.changeStatus')}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {(['scheduled', 'completed', 'no_show', 'cancelled'] as const).map(s => (
                                      <DropdownMenuItem
                                        key={s}
                                        onClick={() => handleStatusChange(lesson.id, s)}
                                        className={`gap-2 cursor-pointer ${lesson.status === s ? 'font-semibold' : ''}`}
                                      >
                                        {s === 'no_show' ? 'No Show' : s.charAt(0).toUpperCase() + s.slice(1)}
                                        {lesson.status === s && <span className="ml-auto text-xs opacity-50">✓</span>}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        if (!confirm(lesson.status === 'completed'
                                          ? 'Delete this lesson? It will be returned to the student\'s package.'
                                          : 'Delete this lesson? This cannot be undone.')) return;
                                        const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
                                        if (error) {
                                          toast({ title: 'Error', description: error.message, variant: 'destructive' });
                                        } else {
                                          toast({
                                            title: 'Lesson deleted',
                                            description: lesson.status === 'completed'
                                              ? 'Returned to package.'
                                              : 'Removed.',
                                          });
                                          queryClient.invalidateQueries({ queryKey: ['admin-all-lessons'] });
                                          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
                                        }
                                      }}
                                      className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete lesson
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
          </>
        ) : activeSection === 'packages' ? (
          <AdminPackagesView />
        ) : activeSection === 'subscribers' ? (
          <AdminSubscribersView />
        ) : activeSection === 'recurring' ? (
          <AdminRecurringSchedulesView variant="full" />
        ) : activeSection === 'calendar' ? (
          <div className="space-y-5">
            <AdminCalendarBody />
          </div>
        ) : (
          <ImportedPackageReview />
        )}
      </main>

      <SocialFooter />
      <EditLessonQuickModal
        open={!!editingLesson}
        onOpenChange={(o) => { if (!o) setEditingLesson(null); }}
        lesson={editingLesson}
      />
    </div>
  );
}
