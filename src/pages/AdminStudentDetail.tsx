import { useParams, Link, useNavigate } from 'react-router-dom';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LanguageToggle } from '@/components/LanguageToggle';
import { fmtMXN } from '@/lib/formatCurrency';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { CoachVideoUploadSheet } from '@/components/CoachFAB';
import { SignedMediaImg as SignedLessonImg, SignedMediaVideo as SignedLessonVideo } from '@/components/SignedMedia';
import { DrillsLinksList } from '@/components/DrillsLinksList';
import { AddHighlightModal } from '@/components/AddHighlightModal';
import { CancelSubscriptionDialog } from '@/components/CancelSubscriptionDialog';
import { PauseSubscriptionDialog } from '@/components/PauseSubscriptionDialog';
import { ArchiveStudentDialog } from '@/components/ArchiveStudentDialog';
import { useAuth, getEffectivePlan as computeEffectivePlan } from '@/contexts/AuthContext';
import { usePlanOptions } from '@/hooks/usePlanOptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, User, TrendingUp, Calendar, Video, Target, Mail, Phone, Award, Upload, Play, AlertCircle, GraduationCap, CheckCircle, Crown, Loader2, DollarSign, ExternalLink, Save, FileText, ImageIcon, Package, Pencil, Split, Trash2, Merge, Star, KeyRound, Copy, Send, ChevronDown, Trophy, Bolt, RefreshCw, Pause, Eye, Archive as ArchiveIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import {
  getDemoStudentById,
  getDemoLessonsForStudent,
  getDemoEnrichedPackagesForStudent,
  getDemoPackagePaymentsForStudent,
  getDemoManualPaymentsForStudent,
  getDemoActiveSubscriptionForStudent,
  getDemoStudentPoints,
} from '@/data/demoData';
import { format as _format, subDays, startOfMonth, parseISO as _parseISO } from 'date-fns';

// Safe wrappers — never throw on invalid/missing dates.
/** Read-only labels for the student onboarding quiz answers. */
const ONBOARDING_LABELS: Record<string, string> = {
  none: 'No handicap',
  over_25: 'Over 25',
  '15_25': '15–25',
  '5_15': '5–15',
  under_5: 'Under 5',
  short_game: 'Short game',
  putting: 'Putting',
  driving: 'Driving',
  approach: 'Approach',
  bunker: 'Bunker',
  mental: 'Mental game',
  distance: 'More distance',
  direction: 'Better direction',
  swing: 'Improve swing',
  beginner: 'Just starting',
  rarely: 'Almost never',
  monthly: 'Once a month',
  weekly: 'Every week',
  several_weekly: 'Several times a week',
};

const format = (d: Date | number | string | null | undefined, fmt: string): string => {
  try {
    if (d === null || d === undefined || d === '') return '';
    const date = d instanceof Date ? d : new Date(d as any);
    if (isNaN(date.getTime())) return '';
    return _format(date, fmt);
  } catch {
    return '';
  }
};
const parseISO = (s: string | null | undefined): Date => {
  if (!s) return new Date(NaN);
  try { return _parseISO(s); } catch { return new Date(NaN); }
};
import { SocialFooter } from '@/components/SocialFooter';
import { VideoCardMenu } from '@/components/VideoCardMenu';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { AddLessonModal } from '@/components/AddLessonModal';
import { AddPaymentModal } from '@/components/AddPaymentModal';
import { AddPackageModal } from '@/components/AddPackageModal';
import { RebalanceLessonsDialog } from '@/components/RebalanceLessonsDialog';
import { rebalanceAndRegenerate } from '@/lib/rebalanceStudentLessons';
import { EditPackageModal } from '@/components/EditPackageModal';
import { PackageLessonsModal } from '@/components/PackageLessonsModal';
import { BulkEditLessonsModal } from '@/components/BulkEditLessonsModal';
import { Checkbox } from '@/components/ui/checkbox';
import { MoveVideosToFamilyDialog } from '@/components/family/MoveVideosToFamilyDialog';
import { useFamilyTargets } from '@/hooks/useFamilyTargets';
import { UnmergeStudentModal } from '@/components/UnmergeStudentModal';
import { MergeFromProfileModal } from '@/components/MergeFromProfileModal';
import { AwardPointsModal } from '@/components/AwardPointsModal';
import { RecurringScheduleCard } from '@/components/RecurringScheduleCard';
import { MonthlyStreakModal } from '@/components/MonthlyStreakModal';
import { EditLessonQuickModal } from '@/components/EditLessonQuickModal';
import { RoundsList } from '@/components/RoundsList';
import { AiInsightsTab } from '@/components/AiInsightsTab';
import { CreateReportModal } from '@/components/CreateReportModal';
import { ReportPreviewModal } from '@/components/ReportPreviewModal';
import { StudentReportsTab } from '@/components/StudentReportsTab';
import { AdminLogRoundSection } from '@/components/AdminLogRoundSection';
import { CoachScoringReportButton } from '@/components/CoachScoringReportButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EditRevenueEntryModal } from '@/components/EditRevenueEntryModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus } from 'lucide-react';
import { formatLessonDate, formatLessonTime, getLessonSortKey, getTodayInAppTimezone } from '@/lib/formatLessonDateTime';
import { updateLessonStatusWithPackage, type RetroLessonStatus } from '@/lib/updateLessonStatusWithPackage';

import { hasRemainingLessons, packageDisplayState, getCurrentPackage } from '@/lib/packageStatus';
import { pausePackage, resumePackage } from '@/lib/pausePackage';
import { archivePackage, unarchivePackage } from '@/lib/archivePackage';
import { isEffectivelyTaken, effectiveLessonStatus } from '@/lib/lessonStatus';
import { computePackageCounts } from '@/lib/lessonPackageUsage';
import { buildWeightedLessonNumberMap, getLessonSlotWeight, getWeightedLessonCount, isDoubleSlotLesson } from '@/lib/lessonPackageUsage';
import { useToast } from '@/hooks/use-toast';
import { getPackageAttachments, deletePackageCascade } from '@/lib/deletePackage';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ParentAccessManager } from '@/components/ParentAccessManager';
import { FamilyLinksManager } from '@/components/FamilyLinksManager';

const getLessonPackageUsage = (lesson: any) => {
  if (!isEffectivelyTaken(lesson)) return 0;
  return getLessonSlotWeight(lesson);
};

const getCompletedUsage = (lessons: any[]) =>
  lessons
    .filter((l) => isEffectivelyTaken(l))
    .reduce((sum, l) => sum + getLessonPackageUsage(l), 0);

const looksLikePlaceholderEmail = (e?: string | null) => {
  if (!e) return true;
  return (
    /^import_\d+_\d+@scgolf\.placeholder$/i.test(e) ||
    /^split-.*@placeholder\.local$/i.test(e) ||
    /^no-email-.*@placeholder\.local$/i.test(e) ||
    /^merged\+.*@archived\.local$/i.test(e) ||
    /@placeholder\.sc$/i.test(e)
  );
};

import { classifyManualPayment } from '@/lib/revenueCalc';

/** Manual payments are never their own bucket: they belong to a lesson or a package. */
function paymentEventBucket(evt: { source: string; label?: string }): 'package' | 'lesson' {
  if (evt.source === 'package') return 'package';
  if (evt.source === 'lesson') return 'lesson';
  return classifyManualPayment({ concept: evt.label });
}

function AdminLessonCard({ lesson, studentId, profileId, packages, lessons: allLessons = [], onNotesSaved, selectable, selected, onToggleSelect, lessonNumber }: { lesson: any; studentId: string; profileId: string; packages: any[]; lessons?: any[]; onNotesSaved: () => void; selectable?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void; lessonNumber?: number }) {
  const [notes, setNotes] = useState(lesson.coach_notes || '');
  const [saving, setSaving] = useState(false);
  const [packageId, setPackageId] = useState<string>(lesson.package_id || '__none__');
  const [savingPackage, setSavingPackage] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [statusValue, setStatusValue] = useState<string>(lesson.status || 'scheduled');
  const [savingStatus, setSavingStatus] = useState(false);
  const cardQueryClient = useQueryClient();
  const { toast } = useToast();
  const isPlayingLesson = isDoubleSlotLesson(lesson);
  const isPastLesson = String(lesson.lesson_date || '') < getTodayInAppTimezone();

  useEffect(() => { setStatusValue(lesson.status || 'scheduled'); }, [lesson.status]);

  const handleStatusChange = async (val: string) => {
    const prev = statusValue;
    setStatusValue(val);
    setSavingStatus(true);
    try {
      await updateLessonStatusWithPackage(
        { id: lesson.id, status: prev, package_id: lesson.package_id, lesson_type: lesson.lesson_type },
        val as RetroLessonStatus,
      );
      toast({ title: 'Estatus actualizado', description: `La clase quedó como ${val}.` });
      ['lessons', 'student-lessons', 'admin-student-lessons', 'packages', 'student-packages', 'class-packages', 'master-calendar-week', 'master-calendar-month', 'revenue', 'revenue-manual-payments']
        .forEach((k) => cardQueryClient.invalidateQueries({ queryKey: [k] }));
      onNotesSaved();
    } catch (err: any) {
      setStatusValue(prev);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingStatus(false);
    }
  };


  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('lessons')
        .update({ coach_notes: notes.trim() || null })
        .eq('id', lesson.id);

      if (error) throw error;

      // Create notification for student if there are notes and a student_id
      if (notes.trim() && lesson.student_id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: lesson.student_id,
            title: 'New coach notes',
            message: `Your coach left notes on your ${lesson.lesson_type} lesson from ${format(new Date(lesson.lesson_date + 'T12:00:00'), 'MMM dd')}.`,
            link: '/lessons',
            type: 'coach_notes',
            metadata: { lesson_id: lesson.id, lesson_type: lesson.lesson_type, lesson_date: lesson.lesson_date, lesson_time: lesson.lesson_time },
          });
      }

      toast({ title: 'Notes saved', description: 'Coach notes updated successfully.' });
      onNotesSaved();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePackageChange = async (val: string) => {
    setPackageId(val);
    setSavingPackage(true);
    const { error } = await supabase
      .from('lessons')
      .update({ package_id: val === '__none__' ? null : val })
      .eq('id', lesson.id);
    setSavingPackage(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setPackageId(lesson.package_id || '__none__');
      return;
    }
    toast({ title: val === '__none__' ? 'Clase desvinculada del paquete' : 'Paquete asignado' });
    onNotesSaved();
  };

  const linkedPkg = packages.find((p) => p.id === lesson.package_id);
  const sharedMembers: any[] = linkedPkg?._isShared ? (linkedPkg._memberProfiles || []) : [];
  const attendeeValue = lesson.taken_together ? '__together__' : (lesson.student_id || '');
  const [savingAttendee, setSavingAttendee] = useState(false);
  const handleAttendeeChange = async (val: string) => {
    setSavingAttendee(true);
    const patch: any = val === '__together__'
      ? { taken_together: true }
      : { taken_together: false, student_id: val };
    const { error } = await supabase.from('lessons').update(patch).eq('id', lesson.id);
    setSavingAttendee(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: val === '__together__' ? 'Marcada como tomada juntos' : 'Alumno actualizado' });
    ['student-lessons', 'student-others-package-lessons', 'student-packages', 'master-calendar-week', 'master-calendar-month']
      .forEach((k) => cardQueryClient.invalidateQueries({ queryKey: [k] }));
    onNotesSaved();
  };

  const handleDeleteLesson = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
      if (error) throw error;
      toast({
        title: 'Lesson deleted',
        description: lesson.status === 'completed'
          ? 'The lesson was returned to the package.'
          : 'Lesson removed.',
      });
      onNotesSaved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkCompleted = async () => {
    setMarking(true);
    try {
      const { error } = await supabase
        .from('lessons')
        .update({ status: 'completed' })
        .eq('id', lesson.id);
      if (error) throw error;
      toast({
        title: 'Lesson marked as completed',
        description: lesson.package_id
          ? 'Package usage updated.'
          : 'Lesson is now completed.',
      });
      onNotesSaved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setMarking(false);
    }
  };

  return (
    <Card
      className={`card-hover ${selectable ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-[#F0C040]' : ''}`}
      onClick={selectable ? (e) => { e.stopPropagation(); onToggleSelect?.(lesson.id); } : undefined}
    >
      <CardContent className="p-3">
        {/* Compact header row — always visible */}
        <div className="flex items-center gap-2">
          {selectable && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={() => onToggleSelect?.(lesson.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          <button
            type="button"
            onClick={(e) => { if (selectable) { e.stopPropagation(); onToggleSelect?.(lesson.id); return; } setExpanded((v) => !v); }}
            className="flex-1 min-w-0 flex items-center gap-2 text-left"
          >
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
            {typeof lessonNumber === 'number' && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#4a7c59] text-white text-[10px] font-bold shrink-0 ring-1 ring-white/20">
                #{lessonNumber}
              </span>
            )}
            <span className="text-sm font-semibold truncate">
              {formatLessonDate(lesson)} • {formatLessonTime(lesson)}
            </span>
          </button>
          <Badge
            className={`text-[10px] shrink-0 ${
              statusValue === 'completed' ? 'bg-success/20 text-success border-success/30' :
              statusValue === 'scheduled' ? 'bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30' :
              'bg-destructive/20 text-destructive border-destructive/30'
            }`}
          >
            {statusValue}
          </Badge>

        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
            {lesson.lesson_type}
          </Badge>
          {isPlayingLesson && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
              ⛳ 2h
            </Badge>
          )}
          {lesson.taken_together ? (
            <Badge variant="outline" className="border-accent/40 text-accent text-[9px] px-1.5 py-0 h-4 leading-none">
              👥 Juntos
            </Badge>
          ) : lesson.student_id && lesson.student_id !== profileId && lesson.attendee && (
            <Badge variant="outline" className="border-accent/40 text-accent text-[9px] px-1.5 py-0 h-4 leading-none">
              👥 {lesson.attendee.full_name || lesson.attendee.email}
            </Badge>
          )}
          {linkedPkg && (
            <Badge variant="outline" className="border-[#4a7c59]/40 text-[#4a7c59] text-[10px]">
              📦 {linkedPkg.package_name || `${linkedPkg.package_size}-Lesson`}
            </Badge>
          )}
          {(lesson.coach_notes || lesson.student_notes) && (
            <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
              <FileText className="h-2.5 w-2.5 mr-0.5" />notes
            </Badge>
          )}
          {lesson.skipped && (
            <Badge variant="outline" className="border-[#F0C040]/40 text-[#F0C040] text-[10px]">
              ⏭ Skipped
            </Badge>
          )}
        </div>

        {sharedMembers.length > 1 && !selectable && (
          <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-muted-foreground shrink-0">¿Quién la tomó?</span>
            <Select value={attendeeValue} onValueChange={handleAttendeeChange} disabled={savingAttendee}>
              <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0 px-2">
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                {sharedMembers.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                ))}
                <SelectItem value="__together__">👥 Juntos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Expanded body */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
            <p className="text-xs text-muted-foreground">
              Duration: {lesson.duration_minutes} min • Revenue: {fmtMXN(Number(lesson.revenue))}
            </p>

            {/* Retroactive status control (past lessons) */}
            {isPastLesson && (
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Estatus:</span>
                <Select value={statusValue} onValueChange={handleStatusChange} disabled={savingStatus}>
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed" className="text-xs">Completada</SelectItem>
                    <SelectItem value="no_show" className="text-xs">No Show</SelectItem>
                    <SelectItem value="cancelled" className="text-xs">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
                {savingStatus && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            )}



            {/* Package assignment */}
            <div className="flex items-center gap-2 flex-wrap">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Package:</span>
              <Select value={packageId} onValueChange={handlePackageChange} disabled={savingPackage}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] flex-1 max-w-[280px]">
                  <SelectValue placeholder="Sin paquete" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">No package (single lesson)</SelectItem>
                  {packages.map((p) => {
                    const used = allLessons
                      .filter((l: any) => l.package_id === p.id)
                      .reduce((s: number, l: any) => s + getLessonPackageUsage(l), 0);
                    return (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.package_name || `${p.package_size}-Lesson`} · {used}/{p.package_size} · {format(new Date(p.created_at), 'MMM yyyy')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {savingPackage && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            {lesson.student_notes && (
              <div className="p-2.5 bg-accent/10 rounded-lg">
                <p className="text-xs font-semibold text-accent-foreground mb-1">Student Notes:</p>
                <p className="text-xs text-muted-foreground">{lesson.student_notes}</p>
              </div>
            )}

            {/* Editable Coach Notes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Coach Notes</span>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes for this lesson..."
                className="min-h-[60px] resize-y text-xs"
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  size="sm"
                  className="gap-1.5 h-8 text-xs bg-green-accent hover:bg-green-accent/90 text-ivory"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Notes
                </Button>
                <div className="flex items-center gap-2">
                  {lesson.status === 'scheduled' && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 text-xs bg-[#4a7c59] hover:bg-[#4a7c59]/90 text-ivory"
                      onClick={handleMarkCompleted}
                      disabled={marking}
                    >
                      {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Mark Completed
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={deleting}
                      >
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {lesson.status === 'completed'
                            ? 'This lesson is completed. Deleting it will return the class back to the student\'s package and revert the points awarded.'
                            : 'This will permanently remove the lesson. This action cannot be undone.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteLesson}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <EditLessonQuickModal open={editOpen} onOpenChange={setEditOpen} lesson={lesson} />
    </Card>
  );
}

function EditableCoachNoteCard({
  table,
  id,
  field,
  value,
  title,
  meta,
  extra,
  onSaved,
  setExtraFields,
}: {
  table: 'lessons' | 'videos';
  id: string;
  field: 'coach_notes' | 'coach_feedback';
  value: string;
  title: React.ReactNode;
  meta: React.ReactNode;
  extra?: React.ReactNode;
  onSaved: () => void;
  setExtraFields?: () => Record<string, any>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = draft.trim();
    const payload: Record<string, any> = { [field]: trimmed || null };
    if (setExtraFields) Object.assign(payload, setExtraFields());
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    setEditing(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    const payload: Record<string, any> = { [field]: null };
    if (setExtraFields) Object.assign(payload, setExtraFields());
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    setDeleting(false);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Note deleted' });
    onSaved();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0 flex-1">{title}</div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-normal text-muted-foreground">{meta}</span>
            {!editing && (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setDraft(value); setEditing(false); }} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">{value}</p>
        )}
        {extra}
      </CardContent>
    </Card>
  );
}

function StandaloneCoachNoteCard({
  note,
  onChanged,
}: {
  note: { id: string; title: string | null; body: string; created_at: string };
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(note.body);
  const [draftTitle, setDraftTitle] = useState(note.title || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraftBody(note.body);
      setDraftTitle(note.title || '');
    }
  }, [note.body, note.title, editing]);

  const handleSave = async () => {
    const trimmedBody = draftBody.trim();
    if (!trimmedBody) {
      toast({ title: 'Note cannot be empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('student_coach_notes' as any)
      .update({ title: draftTitle.trim() || null, body: trimmedBody })
      .eq('id', note.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    setEditing(false);
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    const { error } = await supabase
      .from('student_coach_notes' as any)
      .delete()
      .eq('id', note.id);
    setDeleting(false);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Note deleted' });
    onChanged();
  };

  const displayDate = note.created_at ? new Date(note.created_at).toLocaleDateString() : '';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0 flex-1 font-semibold truncate">{note.title || 'Note'}</div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-normal text-muted-foreground">{displayDate}</span>
            {!editing && (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {editing ? (
          <div className="space-y-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title..."
              className="text-sm"
            />
            <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={4} placeholder="Write a note about this student..." />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setDraftBody(note.body); setDraftTitle(note.title || ''); setEditing(false); }} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AddStandaloneCoachNote({
  studentId,
  authorId,
  onAdded,
}: {
  studentId: string;
  authorId?: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast({ title: 'Note cannot be empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('student_coach_notes' as any)
      .insert({ student_id: studentId, title: title.trim() || null, body: trimmedBody, created_by: authorId || null });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to add note', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Note added' });
    setTitle('');
    setBody('');
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add note
        </Button>
      </div>
    );
  }

  return (
    <Card className="w-full min-w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">New note</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title (optional)..."
          className="text-sm"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[200px] resize-y"
          placeholder="Write a note about this student..."
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setTitle(''); setBody(''); setOpen(false); }} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add note'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminStudentDetail() {
  const { studentId } = useParams();
  const { signOut, user, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('lessons');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Multi-select for coach notes
  const [notesSelectMode, setNotesSelectMode] = useState(false);
  const [selectedNoteKeys, setSelectedNoteKeys] = useState<Set<string>>(new Set());
  const [bulkDeletingNotes, setBulkDeletingNotes] = useState(false);
  const [bulkDeleteNotesOpen, setBulkDeleteNotesOpen] = useState(false);
  const toggleNoteSelected = (key: string) => {
    setSelectedNoteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const exitNotesSelectMode = () => {
    setNotesSelectMode(false);
    setSelectedNoteKeys(new Set());
  };
  const handleBulkDeleteNotes = async () => {
    setBulkDeletingNotes(true);
    try {
      const keys = Array.from(selectedNoteKeys);
      const noteIds = keys.filter((k) => k.startsWith('note-')).map((k) => k.slice(5));
      const lessonIds = keys.filter((k) => k.startsWith('lesson-')).map((k) => k.slice(7));
      const videoIds = keys.filter((k) => k.startsWith('video-')).map((k) => k.slice(6));
      const ops: PromiseLike<any>[] = [];
      if (noteIds.length) {
        ops.push(supabase.from('student_coach_notes' as any).delete().in('id', noteIds));
      }
      if (lessonIds.length) {
        ops.push(supabase.from('lessons').update({ coach_notes: null }).in('id', lessonIds));
      }
      if (videoIds.length) {
        ops.push(supabase.from('videos').update({ coach_feedback: null }).in('id', videoIds));
      }
      const results = await Promise.all(ops);
      const firstErr = results.find((r: any) => r?.error);
      if (firstErr) throw firstErr.error;
      toast({ title: 'Notes deleted', description: `${keys.length} note(s) removed.` });
      exitNotesSelectMode();
      queryClient.invalidateQueries({ queryKey: ['student-coach-notes', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-videos', studentId] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBulkDeletingNotes(false);
      setBulkDeleteNotesOpen(false);
    }
  };
  const [selectedPlanOverride, setSelectedPlanOverride] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [cancelSubOpen, setCancelSubOpen] = useState(false);
  const [pauseSubOpen, setPauseSubOpen] = useState(false);
  const [mediaUploadOpen, setMediaUploadOpen] = useState(false);
  const [highlightUploadOpen, setHighlightUploadOpen] = useState(false);
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  // Multi-select for lessons
  const [lessonSelectMode, setLessonSelectMode] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const toggleLessonSelected = (id: string) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setLessonSelectMode(false);
    setSelectedLessonIds(new Set());
  };
  const invalidateLessonQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
    queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
    queryClient.invalidateQueries({ queryKey: ['admin-student-points', studentId] });
    queryClient.invalidateQueries({ queryKey: ['next-lesson'] });
    queryClient.invalidateQueries({ queryKey: ['student-upcoming-lessons'] });
  };
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedLessonIds);
      const { error } = await supabase.from('lessons').delete().in('id', ids);
      if (error) throw error;
      toast({ title: 'Lessons deleted', description: `${ids.length} lesson(s) removed.` });
      exitSelectMode();
      invalidateLessonQueries();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };
  const [editRevenueEntry, setEditRevenueEntry] = useState<any>(null);
  const [deleteRevenueEntry, setDeleteRevenueEntry] = useState<any>(null);
  const [deletingRevenue, setDeletingRevenue] = useState(false);
  const [addPackageOpen, setAddPackageOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [settingActivePackageId, setSettingActivePackageId] = useState<string | null>(null);
  const [regeneratingPackageId, setRegeneratingPackageId] = useState<string | null>(null);
  const [pausingPackageId, setPausingPackageId] = useState<string | null>(null);
  const [archivingPackageId, setArchivingPackageId] = useState<string | null>(null);
  const [showArchivedPackages, setShowArchivedPackages] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [arEditLesson, setArEditLesson] = useState<any>(null);
  const [viewingPackageLessons, setViewingPackageLessons] = useState<any>(null);
  const [unmergeOpen, setUnmergeOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePermanentOpen, setDeletePermanentOpen] = useState(false);
  const [deletingPermanent, setDeletingPermanent] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);
  const [packageAttachments, setPackageAttachments] = useState<{ lessons: number; payments: number; members: number } | null>(null);
  const [isDeletingPkg, setIsDeletingPkg] = useState(false);
  const [awardPointsOpen, setAwardPointsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [streakModal, setStreakModal] = useState<{ open: boolean; monthStart: string | null; lessons: number }>({ open: false, monthStart: null, lessons: 0 });
  const navigate = useNavigate();

  const handleSetActivePackage = async (pkg: any) => {
    if (!pkg?.id || !pkg?.user_id) return;
    setSettingActivePackageId(pkg.id);
    try {
      // Deactivate any other active packages for this user
      const { error: deactivateErr } = await supabase
        .from('class_packages')
        .update({ is_active: false })
        .eq('user_id', pkg.user_id)
        .eq('is_active', true)
        .neq('id', pkg.id);
      if (deactivateErr) throw deactivateErr;

      // Activate the selected package
      const { error: activateErr } = await supabase
        .from('class_packages')
        .update({ is_active: true })
        .eq('id', pkg.id);
      if (activateErr) throw activateErr;

      // Generate recurring lessons for this student
      try {
        await supabase.functions.invoke('generate-recurring-lessons', {
          body: { student_id: pkg.user_id },
        });
      } catch (e) {
        console.error('generate-recurring-lessons call failed:', e);
      }

      toast({ title: 'Package set as active', description: `${pkg.package_name || 'Package'} is now the active package.` });
      refetchPackages();
      queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
      queryClient.invalidateQueries({ queryKey: ['student-packages'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Could not set package as active.', variant: 'destructive' });
    } finally {
      setSettingActivePackageId(null);
    }
  };


  const handleRegeneratePackageLessons = async (pkg: any) => {
    if (!pkg?.id || !pkg?.user_id) return;
    setRegeneratingPackageId(pkg.id);
    try {
      const { error } = await supabase.functions.invoke('generate-recurring-lessons', {
        body: { student_id: pkg.user_id },
      });
      if (error) throw error;
      toast({ title: 'Lessons regenerated' });
      refetchPackages();
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Could not regenerate lessons.', variant: 'destructive' });
    } finally {
      setRegeneratingPackageId(null);
    }
  };

  /**
   * Pause / resume a package. Pausing re-points its FUTURE scheduled lessons
   * (chronological order) to the oldest active, non-paused package with
   * classes available; the rest stay put. History and revenue untouched.
   */
  const handleTogglePausePackage = async (pkg: any) => {
    if (!pkg?.id) return;
    setPausingPackageId(pkg.id);
    try {
      if (pkg.is_paused === true) {
        await resumePackage(pkg);
        toast({ title: 'Paquete reanudado' });
      } else {
        const { moved, deleted } = await pausePackage(pkg);
        toast({
          title: 'Paquete pausado',
          description:
            moved > 0 || deleted > 0
              ? `${moved} clase(s) re-vinculada(s)${deleted > 0 ? `, ${deleted} eliminada(s) por falta de cupo` : ''}.`
              : 'No recibirá clases nuevas.',
        });
      }
      refetchPackages();
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'No se pudo actualizar el paquete.', variant: 'destructive' });
    } finally {
      setPausingPackageId(null);
    }
  };

  /**
   * Archive / unarchive a package. Archiving is blocked while the package still
   * has FUTURE scheduled lessons. Archived packages stay fully visible in this
   * admin view (in their own section) and keep counting for revenue and stats;
   * they are only hidden from the student portal and from the rotation.
   */
  const handleToggleArchivePackage = async (pkg: any) => {
    if (!pkg?.id) return;
    setArchivingPackageId(pkg.id);
    try {
      if (pkg.is_archived === true) {
        await unarchivePackage(pkg);
        toast({ title: 'Paquete desarchivado' });
      } else {
        await archivePackage(pkg);
        toast({ title: 'Paquete archivado', description: 'Ya no se muestra en el portal del alumno.' });
      }
      refetchPackages();
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
    } catch (err: any) {
      toast({
        title: 'No se pudo archivar',
        description: err?.message || 'Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setArchivingPackageId(null);
    }
  };



  // Report state
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [reportPreview, setReportPreview] = useState<{ report: string; studentName: string; dateStart: string; dateEnd: string } | null>(null);

  // Account access (password reset / temp password) — admins only
  const [sendingReset, setSendingReset] = useState(false);
  const [generatingTemp, setGeneratingTemp] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [repairingEmail, setRepairingEmail] = useState(false);

  // Media edit state
  const [editMediaItem, setEditMediaItem] = useState<any>(null);
  const [editMediaTitle, setEditMediaTitle] = useState('');
  const [savingMedia, setSavingMedia] = useState(false);
  const [deleteMediaId, setDeleteMediaId] = useState<string | null>(null);
  const [deletingMedia, setDeletingMedia] = useState(false);

  // Lightbox preview for media / highlights
  const [previewItem, setPreviewItem] = useState<any>(null);

  // Bulk selection in the Videos tab, used to move files to a family member.
  const [videoSelectMode, setVideoSelectMode] = useState(false);
  type SelectedVideo = { source: 'videos' | 'media'; ownerId: string };
  const [selectedVideoKeys, setSelectedVideoKeys] = useState<Record<string, SelectedVideo>>({});
  const [moveToFamilyOpen, setMoveToFamilyOpen] = useState(false);
  const selectedVideoItems = Object.entries(selectedVideoKeys).map(([id, v]) => ({ id, ...v }));
  const toggleVideoSelection = (id: string, source: 'videos' | 'media', ownerId: string) =>
    setSelectedVideoKeys((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { source, ownerId };
      return next;
    });

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    handicap: '',
    ghin_number: '',
    thegrint_username: '',
    goals: '',
  });

  const handleEditMedia = async () => {
    if (!editMediaItem) return;
    setSavingMedia(true);
    try {
      const { error } = await supabase
        .from('student_media' as any)
        .update({ title: editMediaTitle.trim() || editMediaItem.title })
        .eq('id', editMediaItem.id);
      if (error) throw error;
      toast({ title: 'Media updated' });
      refetchMedia();
      setEditMediaItem(null);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setSavingMedia(false);
    }
  };

  const handleDeleteMedia = async () => {
    if (!deleteMediaId) return;
    setDeletingMedia(true);
    try {
      const item = studentMedia.find((m: any) => m.id === deleteMediaId);
      if (item) {
        const m = item.file_url?.match(/\/golf-media\/(.+)$/);
        if (m) await supabase.storage.from('golf-media').remove([decodeURIComponent(m[1].split('?')[0])]).catch(() => {});
      }
      const { error } = await supabase.from('student_media' as any).delete().eq('id', deleteMediaId);
      if (error) throw error;
      toast({ title: 'Media deleted' });
      refetchMedia();
      setDeleteMediaId(null);
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingMedia(false);
    }
  };

  const handleArchiveStudent = async () => {
    if (!studentId) return;
    setDeleting(true);
    try {
      // Non-destructive archive: keep all records intact and just hide the
      // student from the active roster. Admins can restore later.
      const { error } = await supabase
        .from('profiles')
        .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
        .eq('id', studentId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['all-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-canonical'] });
      toast({ title: 'Estudiante archivado', description: 'Se movió a la sección de archivados. Puedes restaurarlo cuando quieras.' });
      navigate('/admin/students');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeletePermanent = async () => {
    if (!studentId) return;
    setDeletingPermanent(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-student-auth', {
        body: { action: 'delete_user', user_id: studentId, reassign_shared: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      queryClient.invalidateQueries({ queryKey: ['all-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
      queryClient.invalidateQueries({ queryKey: ['all-students-canonical'] });
      toast({ title: 'Estudiante eliminado', description: 'La cuenta y todos sus datos fueron borrados permanentemente.' });
      navigate('/admin/students');
    } catch (err: any) {
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingPermanent(false);
      setDeletePermanentOpen(false);
    }
  };

  // Drills query for unmerge
  const { data: drills = [] } = useQuery({
    queryKey: ['student-drills', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [];
      const { data } = await supabase
        .from('student_drills')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  const { data: student } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoStudentById(studentId!) as any;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single();
      return data;
    },
    enabled: !!studentId,
  });

  // Subscription row — SAME source that feeds the admin Subscribers table
  // (public.subscriptions). Resolved by student_id first, then by email so a
  // student with more than one row keyed to their address still matches.
  const { data: latestSubscription } = useQuery({
    queryKey: ['student-active-subscription', studentId, student?.email],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoActiveSubscriptionForStudent(studentId!);
      const cols =
        'id, paused_at, cancel_at_period_end, stripe_subscription_id, is_active, status, plan_tier, plan_name, current_period_end, archived_at, created_at';
      const { data: byId } = await supabase
        .from('subscriptions')
        .select(cols)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byId) return byId as any;
      if (!student?.email) return null;
      const { data: byEmail } = await supabase
        .from('subscriptions')
        .select(cols)
        .eq('student_email', student.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (byEmail as any) ?? null;
    },
    enabled: !!studentId,
  });

  // A subscription only counts as active when the Subscribers table would show
  // it as active — never from the profile's cached plan fields.
  const subIsActive =
    !!latestSubscription &&
    !latestSubscription.archived_at &&
    !!latestSubscription.is_active &&
    (latestSubscription.status === 'active' || latestSubscription.status === 'trialing');
  const activeSubscription = subIsActive ? latestSubscription : null;



  // Get shared package ids for this student (where they are a member)
  const { data: sharedPackageIds = [] } = useQuery({
    queryKey: ['student-shared-package-ids', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as string[];
      const { data } = await supabase
        .from('package_members' as any)
        .select('package_id')
        .eq('student_id', studentId);
      return ((data || []) as any[]).map((m: any) => m.package_id) as string[];
    },
    enabled: !!studentId,
  });

  // Shared packages this student OWNS (with other members). Used to let
  // an admin pick who inherits ownership when deleting the student.
  const { data: ownedSharedPackages = [] } = useQuery({
    queryKey: ['student-owned-shared-packages', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      if (!studentId) return [] as any[];
      const { data: owned } = await supabase
        .from('class_packages')
        .select('id, package_name, classes_remaining, package_size')
        .eq('user_id', studentId);
      const ids = (owned || []).map((p: any) => p.id);
      if (ids.length === 0) return [];
      const { data: members } = await supabase
        .from('package_members' as any)
        .select('package_id, student_id, added_at')
        .in('package_id', ids)
        .order('added_at', { ascending: true });
      const memberIds = Array.from(new Set(((members || []) as any[]).map((m: any) => m.student_id)));
      let nameMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', memberIds);
        (profs || []).forEach((p: any) => {
          nameMap[p.id] = p.full_name || p.email || 'Student';
        });
      }
      return (owned || [])
        .map((p: any) => {
          const others = ((members || []) as any[])
            .filter((m: any) => m.package_id === p.id)
            .map((m: any) => ({ id: m.student_id, name: nameMap[m.student_id] || 'Student' }));
          return { ...p, members: others };
        })
        .filter((p: any) => p.members.length > 0);
    },
    enabled: !!studentId,
  });

  // Selected new owner for the shared-package handoff in the delete dialog.
  const [sharedHandoffOwnerId, setSharedHandoffOwnerId] = useState<string | null>(null);
  useEffect(() => {
    // Default to the first other member when the dialog opens / data loads.
    if (!sharedHandoffOwnerId && ownedSharedPackages.length > 0) {
      const first = ownedSharedPackages[0]?.members?.[0]?.id;
      if (first) setSharedHandoffOwnerId(first);
    }
  }, [ownedSharedPackages, sharedHandoffOwnerId]);

  const { data: lessons = [] } = useQuery({
    queryKey: ['student-lessons', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoLessonsForStudent(studentId!);
      // Only this student's lessons. Shared packages are tracked separately —
      // each lesson belongs to a single attendee, even if it deducts from a shared package.
      const { data } = await supabase
        .from('lessons')
        .select('*, attendee:profiles!lessons_student_id_fkey(id, full_name, email)')
        .eq('student_id', studentId)
        .order('lesson_date', { ascending: false })
        .order('lesson_time', { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  const { data: videos = [] } = useQuery({
    queryKey: ['student-videos', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const { data } = await supabase
        .from('videos')
        .select('*, lessons(lesson_date, lesson_type)')
        .eq('student_id', studentId)
        .order('upload_date', { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  // Videos that belong to this student's linked family members (children with
  // or without their own account, partner). Shown in a separate section so the
  // coach keeps seeing everything they uploaded, without touching any counts.
  const { data: familyTargets = [] } = useFamilyTargets(studentId);
  const familyMemberIds = familyTargets.filter((t) => !t.isSelf).map((t) => t.id);
  const { data: familyVideos = [] } = useQuery({
    queryKey: ['student-family-videos', studentId, familyMemberIds.join(',')],
    enabled: !!studentId && familyMemberIds.length > 0,
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const nameOf = (id: string) => familyTargets.find((t) => t.id === id)?.name || '';
      const isManaged = (id: string) => familyTargets.find((t) => t.id === id)?.isManaged === true;
      const [{ data: vids }, { data: media }] = await Promise.all([
        supabase
          .from('videos')
          .select('*, lessons(lesson_date, lesson_type)')
          .in('student_id', familyMemberIds)
          .order('upload_date', { ascending: false }),
        supabase
          .from('student_media')
          .select('*')
          .in('student_id', familyMemberIds)
          .order('uploaded_at', { ascending: false }),
      ]);
      const rows = [
        ...(vids || []).map((v: any) => ({
          ...v,
          _source: 'videos',
          _effective_date: v.lessons?.lesson_date ? `${v.lessons.lesson_date}T12:00:00` : v.upload_date,
        })),
        ...(media || []).map((m: any) => ({
          ...m,
          _source: 'media',
          upload_date: m.uploaded_at,
          category: m.is_general ? 'media' : 'lesson',
          _effective_date: m.uploaded_at,
        })),
      ].map((r: any) => ({
        ...r,
        _ownerId: r.student_id,
        _ownerName: nameOf(r.student_id),
        _ownerManaged: isManaged(r.student_id),
      }));
      return rows.sort(
        (a, b) => new Date(b._effective_date).getTime() - new Date(a._effective_date).getTime(),
      );
    },
  });

  // Standalone coach notes (not tied to a lesson/video)
  const { data: standaloneCoachNotes = [] } = useQuery({
    queryKey: ['student-coach-notes', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const { data } = await supabase
        .from('student_coach_notes' as any)
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!studentId,
  });

  // Student media query
  const { data: studentMedia = [], refetch: refetchMedia } = useQuery({
    queryKey: ['student-media', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const { data } = await supabase
        .from('student_media' as any)
        .select('*, lessons(lesson_date, lesson_type)')
        .eq('student_id', studentId)
        .order('uploaded_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!studentId,
  });

  // Payments query
  // Student highlights query
  const { data: studentHighlights = [] } = useQuery({
    queryKey: ['student-highlights-admin', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const { data } = await supabase
        .from('student_highlights' as any)
        .select('*')
        .eq('student_id', studentId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!studentId,
  });

  // Payments query
  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ['student-payments', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoManualPaymentsForStudent(studentId!);
      const { data } = await supabase
        .from('payments' as any)
        .select('*')
        .eq('student_id', studentId)
        .order('payment_date', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!studentId,
  });

  const totalPayments = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // SC Points query
  const { data: studentPoints, refetch: refetchPoints } = useQuery({
    queryKey: ['admin-student-points', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoStudentPoints(studentId!);
      const { data } = await supabase
        .from('student_points')
        .select('total_points, total_lessons_ever, reward_available, lifetime_points' as any)
        .eq('user_id', studentId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!studentId,
  });

  // Point transactions history (enriched with real lesson date/time)
  const { data: pointTransactions = [] } = useQuery({
    queryKey: ['admin-point-transactions', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      const { data } = await supabase
        .from('point_transactions' as any)
        .select('*')
        .eq('user_id', studentId!)
        .order('created_at', { ascending: false })
        .limit(100);
      const txs = (data || []) as any[];
      const lessonIds = Array.from(new Set(
        txs.map((t) => t.metadata?.lesson_id).filter(Boolean)
      ));
      let lessonMap: Record<string, { lesson_date: string; lesson_time: string }> = {};
      if (lessonIds.length > 0) {
        const { data: ls } = await supabase
          .from('lessons')
          .select('id, lesson_date, lesson_time')
          .in('id', lessonIds);
        (ls || []).forEach((l: any) => {
          lessonMap[l.id] = { lesson_date: l.lesson_date, lesson_time: l.lesson_time };
        });
      }
      // Sort by event date: lesson_date if linked, else created_at, DESC
      return txs
        .map((t) => ({ ...t, _lesson: lessonMap[t.metadata?.lesson_id] || null }))
        .sort((a, b) => {
          const ka = a._lesson ? `${a._lesson.lesson_date}T${a._lesson.lesson_time}` : a.created_at;
          const kb = b._lesson ? `${b._lesson.lesson_date}T${b._lesson.lesson_time}` : b.created_at;
          return kb.localeCompare(ka);
        });
    },
    enabled: !!studentId,
  });

  // Student packages query — owned + shared
  const { data: studentPackages = [], refetch: refetchPackages } = useQuery({
    queryKey: ['student-packages', studentId, sharedPackageIds.join(',')],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoEnrichedPackagesForStudent(studentId!);
      const { data: owned } = await supabase
        .from('class_packages')
        .select('*')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false });

      let shared: any[] = [];
      if (sharedPackageIds.length > 0) {
        const { data: sharedPkgs } = await supabase
          .from('class_packages')
          .select('*')
          .in('id', sharedPackageIds);
        shared = sharedPkgs || [];
      }

      const all = [...(owned || []), ...shared];
      const dedup = Array.from(new Map(all.map((p) => [p.id, p])).values());

      // Batch-fetch ALL lessons linked to these packages (across every member).
      // This makes "used / remaining" reflect lessons taken by any shared member,
      // not just the currently-viewed student.
      const pkgIds = dedup.map((p: any) => p.id);
      let lessonsForPackages: any[] = [];
      if (pkgIds.length) {
        const { data: lr } = await supabase
          .from('lessons')
          .select('id, package_id, status, lesson_type, student_id, lesson_date, lesson_time')
          .in('package_id', pkgIds);
        lessonsForPackages = (lr || []) as any[];
      }
      const lessonsByPkg = new Map<string, any[]>();
      lessonsForPackages.forEach((l: any) => {
        if (!l?.package_id) return;
        const arr = lessonsByPkg.get(l.package_id) || [];
        arr.push(l);
        lessonsByPkg.set(l.package_id, arr);
      });

      // Enrich each package with member info + cross-member usage totals
      const enriched = await Promise.all(
        dedup.map(async (p: any) => {
          const { data: members } = await supabase
            .from('package_members' as any)
            .select('student_id')
            .eq('package_id', p.id);
          const memberIds = Array.from(new Set([
            ...((members || []) as any[]).map((m: any) => m.student_id),
            ...(p.user_id ? [p.user_id] : []),
          ].filter(Boolean)));
          const isShared = memberIds.length > 1;
          let memberProfiles: any[] = [];
          if (isShared) {
            const { data: profs } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', memberIds);
            memberProfiles = profs || [];
          }
          const allLessons = lessonsByPkg.get(p.id) || [];
          const totalLessonsUsed = getWeightedLessonCount(allLessons, true);
          const totalLessonsRemaining = Math.max(0, (p.package_size || 0) - totalLessonsUsed);
          return {
            ...p,
            _isShared: isShared,
            _isOwner: p.user_id === studentId,
            _memberProfiles: memberProfiles,
            _otherMemberNames: memberProfiles
              .filter((pr: any) => pr.id !== studentId)
              .map((pr: any) => pr.full_name || pr.email),
            _allLessons: allLessons,
            _totalLessonsUsed: totalLessonsUsed,
            _totalLessonsRemaining: totalLessonsRemaining,
          };
        })
      );

      // Sort chronologically: newest first, oldest at the bottom.
      // Prefer payment_date when available, fall back to created_at.
      enriched.sort((a: any, b: any) => {
        const ad = new Date(a.payment_date || a.created_at || 0).getTime();
        const bd = new Date(b.payment_date || b.created_at || 0).getTime();
        return bd - ad;
      });
      return enriched as any[];
    },
    enabled: !!studentId,
  });

  // Package payments query - for revenue totals
  const { data: packagePayments = [] } = useQuery({
    queryKey: ['student-package-payments', studentId],
    queryFn: async () => {
      if (isDemoModeActive()) return getDemoPackagePaymentsForStudent(studentId!);
      // Only count revenue for packages OWNED by this student.
      // Shared-package payments belong to the owner's profile to avoid double counting.
      const pkgIds = studentPackages
        .filter((p: any) => p.user_id === studentId)
        .map((p: any) => p.id);
      if (!pkgIds.length) return [];
      const { data } = await supabase
        .from('package_payments')
        .select('*')
        .in('package_id', pkgIds);
      return (data || []) as any[];
    },
    enabled: !!studentId && studentPackages.length > 0,
  });

  const totalPackagePayments = packagePayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // Active package = the one the next lesson will actually be drawn from.
  // Must match the FIFO rule used by `book-lesson` and `process_lesson_completion`
  // (oldest active package with remaining lessons first), not the newest.
  const activePackage = getCurrentPackage(studentPackages as any[]);

  // Admin keeps seeing everything: archived packages simply move to their own
  // collapsible section at the bottom of the Packages tab.
  const visiblePackages = useMemo(
    () => (studentPackages as any[]).filter((p: any) => p.is_archived !== true),
    [studentPackages],
  );
  const archivedPackages = useMemo(
    () => (studentPackages as any[]).filter((p: any) => p.is_archived === true),
    [studentPackages],
  );

  // All package ids this student is associated with (owned or shared member).
  // Used to fetch lessons attended by OTHER members of the same packages so they
  // appear under the corresponding package divider in the lessons list.
  const allMyPackageIds = useMemo(
    () => (studentPackages as any[]).map((p: any) => p.id),
    [studentPackages]
  );

  const { data: othersPackageLessons = [] } = useQuery({
    queryKey: ['student-others-package-lessons', studentId, allMyPackageIds.join(',')],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as any[];
      if (!allMyPackageIds.length) return [];
      const { data } = await supabase
        .from('lessons')
        .select('*, attendee:profiles!lessons_student_id_fkey(id, full_name, email)')
        .in('package_id', allMyPackageIds)
        .neq('student_id', studentId);
      return (data || []) as any[];
    },
    enabled: !!studentId && allMyPackageIds.length > 0,
  });

  // Combined lessons: this student's own lessons + lessons attended by other
  // members on shared packages this student belongs to. Each entry tagged so
  // the renderer / totals can tell them apart.
  const allRelevantLessons = useMemo(() => {
    const seen = new Map<string, any>();
    (lessons as any[]).forEach((l: any) =>
      seen.set(l.id, { ...l, _isOwnLesson: true })
    );
    (othersPackageLessons as any[]).forEach((l: any) => {
      if (!seen.has(l.id)) seen.set(l.id, { ...l, _isOwnLesson: false });
    });
    return Array.from(seen.values());
  }, [lessons, othersPackageLessons]);

  // Backwards-compat map for downstream renderers
  const lessonsByPackageId = useMemo(() => {
    const m = new Map<string, any[]>();
    (studentPackages as any[]).forEach((p: any) => {
      if (Array.isArray(p?._allLessons)) m.set(p.id, p._allLessons);
    });
    return m;
  }, [studentPackages]);

  // Split videos by category
  // Combine videos table + student_media into one unified list
  const allVideos = useMemo(() => {
    const effectiveDate = (item: any): string => {
      // Prefer the linked lesson's date so videos sort by when they were taken
      const lessonDate = item?.lessons?.lesson_date;
      if (lessonDate) return `${lessonDate}T12:00:00`;
      return item?.upload_date || item?.uploaded_at;
    };
    const fromVideos = videos.map((v: any) => ({
      ...v,
      _source: 'videos',
      _effective_date: effectiveDate(v),
    }));
    const fromMedia = studentMedia.map((m: any) => ({
      ...m,
      _source: 'media',
      upload_date: m.uploaded_at,
      category: m.is_general ? 'media' : 'lesson',
      _effective_date: effectiveDate({ ...m, upload_date: m.uploaded_at }),
    }));
    return [...fromVideos, ...fromMedia].sort(
      (a, b) => new Date(b._effective_date).getTime() - new Date(a._effective_date).getTime()
    );
  }, [videos, studentMedia]);

  const analysisVideos = allVideos.filter((v: any) => v.category === 'analysis');
  const lessonVideos = allVideos.filter((v: any) => v.category === 'lesson');

  // Total across ALL packages this student belongs to (individual + shared, including
  // lessons taken by other shared members). This is what the profile face card stat shows.
  const allRelevantCompletedWeighted = getWeightedLessonCount(allRelevantLessons, true);
  const activePackageUsed = activePackage
    ? ((activePackage as any)._totalLessonsUsed ??
      getCompletedUsage(
        lessonsByPackageId.get(activePackage.id) ||
          (lessons as any[]).filter((l: any) => l.package_id === activePackage.id)
      ))
    : null;
  const activePackageRemaining = activePackage
    ? Math.max(0, (activePackage.package_size || 0) - (activePackageUsed ?? 0))
    : null;
  const displayedCompletedLessons = allRelevantCompletedWeighted;
  const displayedUpcomingLessons = activePackageRemaining ?? lessons.filter(l => l.status === 'scheduled').length;
  const totalLessonRevenue = lessons.reduce((sum, lesson) => sum + (Number(lesson.revenue) || 0), 0);
  const totalRevenue = totalLessonRevenue + totalPayments + totalPackagePayments;
  
  // Calculate progression - compare earliest vs latest handicap from lessons
  const lessonsWithHandicap = lessons
    .filter(l => l.coach_notes?.includes('handicap') || l.student_notes?.includes('handicap'))
    .sort((a, b) => new Date(a.lesson_date).getTime() - new Date(b.lesson_date).getTime());

  // Effective plan — uses the shared `getEffectivePlan` helper so admin and the
  // student portal always resolve the exact same tier.
  const effectivePlan = (() => {
    const overrideActive =
      !!student?.manual_plan_override &&
      (!student?.override_expires_at || new Date(student.override_expires_at) > new Date());
    return { plan: computeEffectivePlan((student ?? null) as any), isOverride: overrideActive };
  })();

  // Plan options come from billing_plans so new plans (Familiar, etc.) appear
  // automatically in the override picker and badges.
  const planOptions = usePlanOptions();




  // Build unified payment events for Revenue tab
  const paymentEvents = useMemo(() => {
    const events: { id: string; date: string; label: string; type: string; amount: number; source: 'lesson' | 'payment' | 'package'; rawId: string; paymentMethod?: string; notes?: string }[] = [];

    // Lesson revenue — only include if > 0 (lesson record is the source of truth)
    lessons.forEach((l: any) => {
      const rev = Number(l.revenue) || 0;
      if (rev > 0) {
        events.push({
          id: `lesson-${l.id}`,
          date: l.lesson_date || l.created_at?.substring(0, 10) || '',
          label: `${l.lesson_type} lesson`,
          type: 'Lesson',
          amount: rev,
          source: 'lesson',
          rawId: l.id,
        });
      }
    });

    // Manual payments
    payments.forEach((p: any) => {
      events.push({
        id: `payment-${p.id}`,
        date: p.payment_date,
        label: p.concept || 'Payment',
        type: p.payment_method || 'Cash',
        amount: Number(p.amount) || 0,
        source: 'payment',
        rawId: p.id,
        paymentMethod: p.payment_method,
        notes: p.notes,
      });
    });

    // Package payments
    packagePayments.forEach((pp: any) => {
      events.push({
        id: `pkg-${pp.id}`,
        date: pp.payment_date,
        label: 'Package Payment',
        type: pp.payment_method || 'Cash',
        amount: Number(pp.amount) || 0,
        source: 'package',
        rawId: pp.id,
        paymentMethod: pp.payment_method,
        notes: pp.notes,
      });
    });

    // Sort descending by date
    events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return events;
  }, [lessons, payments, packagePayments]);

  // Revenue KPIs based on actual payment events
  const revenueStats = useMemo(() => {
    const today = new Date();
    const mtdStart = startOfMonth(today);
    const last30Start = subDays(today, 30);

    const sumInRange = (start: Date) =>
      paymentEvents
        .filter(e => parseISO(e.date) >= start)
        .reduce((s, e) => s + e.amount, 0);

    const countInRange = (start: Date) =>
      paymentEvents.filter(e => parseISO(e.date) >= start).length;

    return {
      mtd: sumInRange(mtdStart),
      mtdCount: countInRange(mtdStart),
      last30: sumInRange(last30Start),
      last30Count: countInRange(last30Start),
      allTime: totalRevenue,
      allTimeCount: paymentEvents.length,
    };
  }, [paymentEvents, totalRevenue]);

  const hasMissingRevenue = false; // No longer relevant with unified events

  // ============= STUDENT ACCOUNTS RECEIVABLE =============
  // Mirrors the logic in AdminRevenue's "Por Cobrar" section, scoped to this
  // student. Any edit/payment through the existing modals flows back to the
  // class_packages / lessons tables, so the global Revenue page and
  // LinkToARModal recompute automatically on refresh.
  const studentAR = useMemo(() => {
    // Unpaid lesson = completed, no package, not imported, no payment recorded.
    // Each lesson's "amount" is its own revenue field (entered by the coach).
    const unpaidLessons = (lessons as any[])
      .filter((l: any) => {
        return l.status === 'completed'
          && !l.package_id
          && !l.imported
          && !l.payment_method;
      })
      .map((l: any) => ({ ...l, amount: Number(l.revenue) || 0 }));

    // Only packages OWNED by this student count as their AR (shared-package
    // balances belong to the owner's profile to avoid double-counting).
    const ownedPackages = (studentPackages as any[]).filter((p: any) => p.user_id === studentId);

    const packagesPartial = ownedPackages
      .filter((p: any) => {
        if (p.imported) return false;
        const price = Number(p.price) || 0;
        const paid = Number(p.amount_paid) || 0;
        return price > 0 && paid > 0 && paid < price;
      })
      .map((p: any) => ({
        ...p,
        balance: (Number(p.price) || 0) - (Number(p.amount_paid) || 0),
        arKind: 'partial' as const,
      }));

    const packagesPending = ownedPackages
      .filter((p: any) => {
        if (p.imported) return false;
        const price = Number(p.price) || 0;
        const paid = Number(p.amount_paid) || 0;
        return price > 0 && paid === 0;
      })
      .map((p: any) => ({
        ...p,
        balance: Number(p.price) || 0,
        arKind: 'pending' as const,
      }));

    const allPackages = [...packagesPending, ...packagesPartial].sort((a, b) => b.balance - a.balance);
    const lessonsTotal = unpaidLessons.reduce((s: number, l: any) => s + (l.amount || 0), 0);
    const packagesTotal = allPackages.reduce((s, p) => s + p.balance, 0);

    return {
      unpaidLessons,
      lessonsCount: unpaidLessons.length,
      lessonsTotal,
      packages: allPackages,
      packagesCount: allPackages.length,
      packagesTotal,
      grandTotal: lessonsTotal + packagesTotal,
    };
  }, [lessons, studentPackages, studentId]);
  // ========================================================

  const handleSavePlanOverride = async () => {
    if (!studentId || !user || selectedPlanOverride === null) return;
    
    setSavingOverride(true);
    try {
      const updateData: Record<string, any> = {
        manual_plan_override: selectedPlanOverride === 'none' ? null : selectedPlanOverride,
        override_set_by: selectedPlanOverride === 'none' ? null : user.id,
        override_set_at: selectedPlanOverride === 'none' ? null : new Date().toISOString(),
        override_expires_at: null, // No expiry by default
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', studentId);

      if (error) throw error;

      toast({
        title: 'Plan updated',
        description: selectedPlanOverride === 'none' 
          ? 'Manual override removed. Student will use Stripe subscription.' 
          : `Student plan set to ${selectedPlanOverride.charAt(0).toUpperCase() + selectedPlanOverride.slice(1)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
      setSelectedPlanOverride(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update plan',
        variant: 'destructive',
      });
    } finally {
      setSavingOverride(false);
    }
  };

  // ── Trial access controls ───────────────────────────────────────────
  const [savingTrial, setSavingTrial] = useState(false);
  const updateTrial = async (next: Date | null, label: string) => {
    if (!studentId) return;
    setSavingTrial(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ trial_ends_at: next ? next.toISOString() : null })
        .eq('id', studentId);
      if (error) throw error;
      toast({ title: 'Trial updated', description: label });
      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message ?? 'Failed to update trial', variant: 'destructive' });
    } finally {
      setSavingTrial(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!studentId) return;
    setSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-student-auth', {
        body: {
          action: 'send_reset',
          user_id: studentId,
          redirect_to: `${window.location.origin}/auth/reset`,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Failed to send reset email');
      }
      toast({
        title: 'Reset email sent',
        description: `A password reset link was emailed to ${(data as any)?.email || 'the student'}.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSendingReset(false);
    }
  };

  const handleRepairAuthEmail = async () => {
    if (!studentId) return;
    if (!confirm("Sync this student's login email with the address on their profile? Their next password-reset link will go to the profile email.")) return;
    setRepairingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-student-auth', {
        body: { action: 'repair_email', user_id: studentId },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Failed to sync login email');
      }
      if ((data as any)?.unchanged) {
        toast({ title: 'Already in sync', description: 'The login email already matches the profile email.' });
      } else {
        toast({
          title: 'Login email updated',
          description: `Password reset emails will now go to ${(data as any)?.email}.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-student', studentId] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRepairingEmail(false);
    }
  };

  const handleGenerateTempPassword = async () => {
    if (!studentId) return;
    if (!confirm('Generate a temporary password for this student? Their current password will stop working immediately.')) return;
    setGeneratingTemp(true);
    setTempPassword(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-student-auth', {
        body: { action: 'set_temp_password', user_id: studentId },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Failed to generate password');
      }
      const tp = (data as any)?.temp_password as string | undefined;
      if (!tp) throw new Error('No password returned');
      setTempPassword(tp);
      toast({
        title: 'Temporary password ready',
        description: 'Copy it now — it will not be shown again after you leave this page.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingTemp(false);
    }
  };

  const copyTempPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      toast({ title: 'Copied', description: 'Temporary password copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please select and copy manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="app-bg min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 md:px-4 py-3 md:py-4 flex items-center justify-between gap-2">
          <Link to="/admin" className="shrink-0">
            <Button variant="ghost" size="sm" className="px-2 md:px-3">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Back to Dashboard</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
          <GlobalSearch />
          <LanguageToggle variant="header" />
          <Link to={`/admin/upload-video?studentId=${studentId}`} className="shrink-0">
            <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload Video for Student</span>
              <span className="sm:hidden">Upload</span>
            </Button>
          </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8 space-y-6 md:space-y-8">
        {/* Student Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
            <div className="h-14 w-14 md:h-20 md:w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl md:text-3xl font-heading font-bold text-primary-foreground shadow-glow shrink-0">
              {student?.full_name?.charAt(0) || student?.email.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1.5 md:space-y-2 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-3xl font-heading font-bold truncate">{student?.full_name || 'Student'}</h1>
                {(student as any)?.is_managed && (
                  <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-400">
                    Familiar sin cuenta
                  </span>
                )}
                {role === 'admin' && studentId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => navigate(`/admin/student-preview/${studentId}`)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver como alumno
                  </Button>
                )}
                {(() => {
                  const tier = effectivePlan.plan === 'free' ? 'member' : effectivePlan.plan;
                  const fromPlans = planOptions.find((p) => p.tier === tier);
                  const meta = fromPlans
                    ? { label: fromPlans.label, color: fromPlans.color }
                    : { label: 'Free', color: '#9CA3AF' };
                  return (
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                      style={{ color: meta.color, borderColor: `${meta.color}66`, background: `${meta.color}1a` }}
                      title={effectivePlan.isOverride ? 'Plan override' : 'Plan'}
                    >
                      <Star className="h-3 w-3" />
                      {meta.label}{effectivePlan.isOverride ? ' ·' : ''}
                    </span>
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground">
                <div className="flex items-center gap-1 min-w-0">
                  <Mail className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                  <span className="truncate">{student?.email}</span>
                </div>
                {student?.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    {student?.phone}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {student?.handicap && (
                  <Badge className="bg-warning/20 text-warning border-warning/30">
                    <Target className="h-3 w-3 mr-1" />
                    Handicap: {student.handicap}
                  </Badge>
                )}
                {(student as any)?.ghin_number && (
                  <Badge className="bg-info/20 text-info border-info/30">
                    <Award className="h-3 w-3 mr-1" />
                    GHIN: {(student as any).ghin_number}
                  </Badge>
                )}
                {(student as any)?.thegrint_username && (
                  <Badge className="bg-accent/20 text-accent border-accent/30">
                    <Award className="h-3 w-3 mr-1" />
                    TheGrint: {(student as any).thegrint_username}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2 md:shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMergeOpen(true)}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Merge className="h-4 w-4" />
              Merge
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              className="gap-1.5 border-warning/30 text-warning hover:bg-warning/10"
            >
              <ArchiveIcon className="h-4 w-4" />
              Archive
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletePermanentOpen(true)}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateReportOpen(true)}
              className="gap-1.5 bg-[#F0C040] text-[#0d1f18] hover:bg-[#d4a830]"
            >
              <FileText className="h-4 w-4" />
              Report
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card 
            className="card-hover cursor-pointer hover:border-primary/40 hover:scale-[1.02] transition-all duration-200"
            onClick={() => setActiveTab('lessons')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Total Lessons</p>
                  <p className="text-2xl md:text-3xl font-heading font-bold text-primary truncate">{displayedCompletedLessons}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    Across all packages
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-primary opacity-20 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className="card-hover cursor-pointer hover:border-warning/40 hover:scale-[1.02] transition-all duration-200"
            onClick={() => setActiveTab('revenue')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Revenue</p>
                  <p className="text-2xl md:text-3xl font-heading font-bold text-warning truncate">{fmtMXN(totalRevenue)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-warning opacity-20 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover border-warning/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">SC Points</p>
                  <p className="text-2xl md:text-3xl font-heading font-bold text-warning truncate">{studentPoints?.total_points ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Lifetime: {studentPoints?.lifetime_points ?? studentPoints?.total_points ?? 0}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); setAwardPointsOpen(true); }}
                  >
                    <Plus className="h-3 w-3" /> Adjust
                  </Button>
                </div>
                <Star className="h-8 w-8 text-warning opacity-30 flex-shrink-0" fill="currentColor" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className="card-hover cursor-pointer hover:border-accent/40 hover:scale-[1.02] transition-all duration-200"
            onClick={() => setActiveTab('videos')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Videos</p>
                  <p className="text-2xl md:text-3xl font-heading font-bold text-accent truncate">{allVideos.length}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {analysisVideos.length} for analysis • {lessonVideos.length} lesson
                  </p>
                </div>
                <Video className="h-8 w-8 text-accent opacity-20 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SC Points History */}
        {pointTransactions.length > 0 && (
          <Collapsible open={showHistory} onOpenChange={setShowHistory}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <Star className="h-4 w-4 text-warning" fill="currentColor" />
                {showHistory ? 'Hide' : 'Show'} SC Points history ({pointTransactions.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {pointTransactions.map((tx: any) => {
                      const isStreak = tx.reason === 'monthly_streak';
                      const monthStart = tx.metadata?.month_start
                        ?? (tx.created_at ? format(new Date(tx.created_at), 'yyyy-MM-01') : null);
                      const lessonsCount = Number(tx.metadata?.lessons_this_month) || 0;
                      const RowTag: any = isStreak ? 'button' : 'div';
                      return (
                        <RowTag
                          key={tx.id}
                          onClick={isStreak ? () => setStreakModal({ open: true, monthStart, lessons: lessonsCount }) : undefined}
                          className={`w-full text-left flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0 ${isStreak ? 'hover:bg-orange-400/5 rounded px-1 -mx-1 cursor-pointer' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground font-medium capitalize flex items-center gap-1.5">
                              {tx.reason.replace(/_/g, ' ')}
                              {isStreak && <span className="text-[9px] text-orange-400 font-normal">(view lessons →)</span>}
                            </p>
                            <p className="text-muted-foreground text-[10px]">
                              {tx._lesson
                                ? `Lesson: ${format(new Date(`${tx._lesson.lesson_date}T${tx._lesson.lesson_time}`), 'MMM d, yyyy · HH:mm')}`
                                : format(new Date(tx.created_at), 'MMM d, yyyy · HH:mm')}
                            </p>
                          </div>
                          <span className={`font-bold ${tx.delta > 0 ? 'text-success' : 'text-destructive'}`}>
                            {tx.delta > 0 ? '+' : ''}{tx.delta}
                          </span>
                        </RowTag>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        <RedemptionsPanel studentId={studentId!} />

        {/* Active Package Summary */}
        {activePackage && (() => {
          // Use cross-member totals attached by the student-packages query so
          // shared packages count lessons taken by ALL members.
          const activeUsed =
            (activePackage as any)._totalLessonsUsed ??
            getCompletedUsage(
              lessonsByPackageId.get(activePackage.id) ||
                (lessons as any[]).filter((l: any) => l.package_id === activePackage.id)
            );
          const activeRemaining = Math.max(0, (activePackage.package_size || 0) - activeUsed);
          const pkgPrice = Number(activePackage.price) || 0;
          const pkgPaid = Number((activePackage as any).amount_paid) || 0;
          const pkgPending = Math.max(0, pkgPrice - pkgPaid);
          const pkgStatus = pkgPaid <= 0 ? 'pending' : pkgPending <= 0 ? 'paid' : 'partial';
          return (
            <Card
              role="button"
              tabIndex={0}
              aria-label="Open package lessons"
              className="border-[#4a7c59]/30 bg-[#4a7c59]/5 cursor-pointer hover:bg-[#4a7c59]/10 transition-colors"
              onClick={() => setViewingPackageLessons(activePackage)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setViewingPackageLessons(activePackage);
                }
              }}
              title="Ver clases del paquete"
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#4a7c59]/20 flex-shrink-0">
                      <Package className="h-5 w-5 text-[#4a7c59]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{activePackage.package_name || `${activePackage.package_size}-Lesson Package`}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activeUsed} used • {activeRemaining} lessons remaining of {activePackage.package_size}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0 pointer-events-none">
                    {pkgPrice > 0 && (
                      <Badge variant="outline" className="text-xs">{fmtMXN(pkgPrice)}</Badge>
                    )}
                    {pkgStatus === 'paid' ? (
                      <Badge className="bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30 text-xs">✅ Already paid</Badge>
                    ) : pkgStatus === 'partial' ? (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                        🔶 Partial — Pending: {fmtMXN(pkgPending)}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">⏳ Payment pending</Badge>
                    )}
                  </div>
                </div>
                {/* Progress bar with lesson count */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${activePackage.package_size > 0 ? (activeUsed / activePackage.package_size) * 100 : 0}%`, background: '#4a7c59' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap font-medium">{activeUsed}/{activePackage.package_size}</span>
                </div>
                {/* Payment summary line */}
                {pkgPrice > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    <span>Total: {fmtMXN(pkgPrice)}</span>
                    <span>Paid: {fmtMXN(pkgPaid)}</span>
                    <span>Pending: {fmtMXN(pkgPending)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Goals */}
        {student?.goals && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Student Goals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{student.goals}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Lessons, Videos, and Profile */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto bg-transparent p-0">
            <TabsTrigger value="lessons" className="whitespace-nowrap px-3 text-xs md:text-sm">Lessons</TabsTrigger>
            <TabsTrigger value="packages" className="whitespace-nowrap px-3 text-xs md:text-sm">Packages</TabsTrigger>
            <TabsTrigger value="videos" className="whitespace-nowrap px-3 text-xs md:text-sm">Videos</TabsTrigger>
            <TabsTrigger value="highlights" className="whitespace-nowrap px-3 text-xs md:text-sm">Highlights</TabsTrigger>
            <TabsTrigger value="stats" className="whitespace-nowrap px-3 text-xs md:text-sm">Stats</TabsTrigger>
            <TabsTrigger value="revenue" className="whitespace-nowrap px-3 text-xs md:text-sm">Revenue</TabsTrigger>
            <TabsTrigger value="insights" className="whitespace-nowrap px-3 text-xs md:text-sm">AI & Reports</TabsTrigger>
            <TabsTrigger value="coach-notes" className="whitespace-nowrap px-3 text-xs md:text-sm">Coach Notes</TabsTrigger>
            <TabsTrigger value="profile" className="whitespace-nowrap px-3 text-xs md:text-sm">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Student Information
                  {!editingProfile ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProfileForm({
                          full_name: student?.full_name || '',
                          email: student?.email || '',
                          phone: (student as any)?.phone || '',
                          handicap: student?.handicap != null ? String(student.handicap) : '',
                          ghin_number: (student as any)?.ghin_number || '',
                          thegrint_username: (student as any)?.thegrint_username || '',
                          goals: (student as any)?.goals || '',
                        });
                        setEditingProfile(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingProfile(false)}
                        disabled={savingProfile}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={savingProfile}
                        onClick={async () => {
                          setSavingProfile(true);
                          try {
                            const updates: any = {
                              full_name: profileForm.full_name.trim() || null,
                              email: profileForm.email.trim() || student?.email,
                              phone: profileForm.phone.trim() || null,
                              handicap: profileForm.handicap ? parseFloat(profileForm.handicap) : null,
                              ghin_number: profileForm.ghin_number.trim() || null,
                              thegrint_username: profileForm.thegrint_username.trim() || null,
                              goals: profileForm.goals.trim() || null,
                            };
                            const { error } = await supabase
                              .from('profiles')
                              .update(updates)
                              .eq('id', studentId);
                            if (error) throw error;
                            toast({ title: 'Profile updated' });
                            queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
                            queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
                            setEditingProfile(false);
                          } catch (err: any) {
                            toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
                          } finally {
                            setSavingProfile(false);
                          }
                        }}
                      >
                        {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  )}
                </CardTitle>
                <CardDescription>Complete profile and statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Full Name</p>
                    {editingProfile ? (
                      <Input value={profileForm.full_name} onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))} />
                    ) : (
                      <p className="text-base">{student?.full_name || 'Not provided'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Email</p>
                    {editingProfile ? (
                      <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))} />
                    ) : (
                      <p className="text-base">{student?.email}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Phone</p>
                    {editingProfile ? (
                      <Input value={profileForm.phone} onChange={(e) => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
                    ) : (
                      <p className="text-base">{student?.phone || 'Not provided'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Handicap</p>
                    {editingProfile ? (
                      <Input type="number" step="0.1" value={profileForm.handicap} onChange={(e) => setProfileForm(f => ({ ...f, handicap: e.target.value }))} />
                    ) : (
                      <p className="text-base font-bold text-warning">{student?.handicap || 'Not set'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">GHIN Number</p>
                    {editingProfile ? (
                      <Input value={profileForm.ghin_number} onChange={(e) => setProfileForm(f => ({ ...f, ghin_number: e.target.value }))} />
                    ) : (
                      <p className="text-base">{(student as any)?.ghin_number || 'Not provided'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">TheGrint Username</p>
                    {editingProfile ? (
                      <Input value={profileForm.thegrint_username} onChange={(e) => setProfileForm(f => ({ ...f, thegrint_username: e.target.value }))} />
                    ) : (
                      <p className="text-base">{(student as any)?.thegrint_username || 'Not linked'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Last Handicap Update</p>
                    <p className="text-base">
                      {(student as any)?.ghin_last_updated 
                        ? format(new Date((student as any).ghin_last_updated), 'MMM dd, yyyy')
                        : 'Never'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Member Since</p>
                    <p className="text-base">
                      {student?.created_at && format(new Date(student.created_at), 'MMM yyyy')}
                    </p>
                  </div>
                </div>
                
                {editingProfile ? (
                  <div className="space-y-2 pt-4 border-t">
                    <p className="text-sm font-semibold text-muted-foreground">Goals & Areas to Improve</p>
                    <Textarea
                      rows={3}
                      value={profileForm.goals}
                      onChange={(e) => setProfileForm(f => ({ ...f, goals: e.target.value }))}
                    />
                  </div>
                ) : student?.goals ? (
                  <div className="space-y-2 pt-4 border-t">
                    <p className="text-sm font-semibold text-muted-foreground">Goals & Areas to Improve</p>
                    <p className="text-base bg-muted/50 p-4 rounded-lg">{student.goals}</p>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div 
                    className="text-center p-4 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => setActiveTab('lessons')}
                  >
                    <p className="text-2xl font-bold text-primary">{displayedCompletedLessons}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Completed Lessons
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      across all packages
                    </p>
                  </div>
                  <div 
                    className="text-center p-4 bg-warning/10 rounded-lg cursor-pointer hover:bg-warning/20 transition-colors"
                    onClick={() => setActiveTab('lessons')}
                  >
                    <p className="text-2xl font-bold text-warning">{fmtMXN(totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
                  </div>
                  <div 
                    className="text-center p-4 bg-accent/10 rounded-lg cursor-pointer hover:bg-accent/20 transition-colors"
                    onClick={() => setActiveTab('videos')}
                  >
                    <p className="text-2xl font-bold text-accent">{allVideos.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Videos Uploaded</p>
                  </div>
                  <div 
                    className="text-center p-4 bg-success/10 rounded-lg cursor-pointer hover:bg-success/20 transition-colors"
                    onClick={() => setActiveTab('lessons')}
                  >
                    <p className="text-2xl font-bold text-success">{displayedUpcomingLessons}</p>
                    <p className="text-xs text-muted-foreground mt-1">Upcoming Lessons</p>
                    {activePackageRemaining !== null && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        active package remaining
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Game profile — read-only answers from the onboarding quiz */}
            {((student as any)?.onboarding_handicap ||
              (student as any)?.onboarding_goal ||
              (student as any)?.onboarding_frequency ||
              ((student as any)?.onboarding_focus_areas || []).length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Perfil de juego</CardTitle>
                  <CardDescription>
                    Answers from the student onboarding quiz (read-only)
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Handicap</p>
                    <p className="text-base">{ONBOARDING_LABELS[(student as any)?.onboarding_handicap] || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Goal</p>
                    <p className="text-base">{ONBOARDING_LABELS[(student as any)?.onboarding_goal] || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Areas to improve</p>
                    <p className="text-base">
                      {(((student as any)?.onboarding_focus_areas as string[] | null) || [])
                        .map((a) => ONBOARDING_LABELS[a] || a)
                        .join(', ') || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Plays</p>
                    <p className="text-base">{ONBOARDING_LABELS[(student as any)?.onboarding_frequency] || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Answered on</p>
                    <p className="text-base">
                      {(student as any)?.onboarding_completed_at
                        ? format(new Date((student as any).onboarding_completed_at), 'MMM dd, yyyy')
                        : 'Incomplete'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Plan Override Card - Coach Only */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Plan Management
                </CardTitle>
                <CardDescription>Manually set this student's plan tier</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Current Effective Plan</p>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        effectivePlan.plan === 'apex' ? 'text-black' :
                        effectivePlan.plan === 'pro' ? 'bg-amber-600 text-white' :
                        effectivePlan.plan === 'scratch' ? 'bg-primary text-primary-foreground' :
                        'bg-secondary text-secondary-foreground'
                      } style={effectivePlan.plan === 'apex' ? { background: 'linear-gradient(135deg, #D9AA42, #F0C040)' } : undefined}>
                        {effectivePlan.plan === 'free' || effectivePlan.plan === 'member' ? 'Free' : effectivePlan.plan.charAt(0).toUpperCase() + effectivePlan.plan.slice(1)}
                      </Badge>
                      {effectivePlan.isOverride && (
                        <Badge variant="outline" className="text-xs">Manual Override</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subscription state — mirrors the admin Subscribers table */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    Subscription:{' '}
                    <span className="font-medium text-foreground">
                      {latestSubscription
                        ? `${latestSubscription.plan_tier || latestSubscription.plan_name || '—'} · ${latestSubscription.status || 'unknown'}`
                        : 'none on record'}
                    </span>
                  </p>
                  {latestSubscription?.current_period_end && (
                    <p>
                      Period end:{' '}
                      {format(new Date(latestSubscription.current_period_end), 'MMM dd, yyyy')}
                    </p>
                  )}
                </div>

                {subIsActive ? (
                  <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg space-y-3">
                    <p className="text-sm text-warning flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Note: This student has an active Stripe subscription. Manual override will take precedence but won't affect billing.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPauseSubOpen(true)}
                        className="gap-2"
                      >
                        <AlertCircle className="h-4 w-4" />
                        {activeSubscription?.paused_at ? 'Resume Subscription' : 'Pause Subscription'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setCancelSubOpen(true)}
                        className="gap-2"
                      >
                        <AlertCircle className="h-4 w-4" />
                        Cancel Subscription
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-muted/40 border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      No active subscription. Pause and cancel are unavailable — only the manual
                      tier override below applies.
                    </p>
                  </div>
                )}


                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium">Set Plan Override</p>
                    <Select
                      value={selectedPlanOverride ?? (student?.manual_plan_override || 'none')}
                      onValueChange={setSelectedPlanOverride}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Override (use Stripe)</SelectItem>
                        {planOptions.map((p) => (
                          <SelectItem key={p.tier} value={p.tier}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                              {p.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSavePlanOverride}
                    disabled={savingOverride || selectedPlanOverride === null}
                    className="gap-2"
                  >
                    {savingOverride ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                  {selectedPlanOverride !== null && (
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPlanOverride(null)}
                      disabled={savingOverride}
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {student?.override_set_at && student?.manual_plan_override && (
                  <p className="text-xs text-muted-foreground">
                    Override set on {format(new Date(student.override_set_at), 'MMM dd, yyyy')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Trial Access — Coach Only */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Free Trial Access
                </CardTitle>
                <CardDescription>
                  Free students get 30 days of full access (Pro Zone, Swing Library, Compare Swings).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  {student?.trial_ends_at ? (
                    new Date(student.trial_ends_at) > new Date() ? (
                      <span className="text-green-600">
                        Active — ends {format(new Date(student.trial_ends_at), 'MMM dd, yyyy h:mm a')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Ended on {format(new Date(student.trial_ends_at), 'MMM dd, yyyy')}
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">No active trial.</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingTrial}
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      updateTrial(d, 'Trial reset to 30 days from today.');
                    }}
                  >
                    Reset to 30 days
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingTrial}
                    onClick={() => {
                      const base =
                        student?.trial_ends_at && new Date(student.trial_ends_at) > new Date()
                          ? new Date(student.trial_ends_at)
                          : new Date();
                      base.setDate(base.getDate() + 7);
                      updateTrial(base, 'Trial extended by 7 days.');
                    }}
                  >
                    Extend +7 days
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingTrial || !student?.trial_ends_at}
                    onClick={() => updateTrial(null, 'Trial ended.')}
                  >
                    End trial now
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Account Access — Coach Only */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Account Access
                </CardTitle>
                <CardDescription>
                  Help this student get back into their account if they're locked out.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {looksLikePlaceholderEmail(student?.email) && (
                  <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100">
                    <p className="font-semibold">Profile email looks like a placeholder.</p>
                    <p className="text-xs mt-1 text-amber-200/90">
                      This student was likely imported or created without a real email, so password-reset mail can't reach them. Edit the email on this profile, then click <span className="font-semibold">Sync login email</span> below so reset links actually go to the right inbox.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleSendResetEmail}
                    disabled={sendingReset || !student?.email}
                    variant="outline"
                    className="flex-1 gap-2"
                  >
                    {sendingReset ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send password reset email
                  </Button>
                  <Button
                    onClick={handleGenerateTempPassword}
                    disabled={generatingTemp || !student?.email}
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {generatingTemp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    Generate temporary password
                  </Button>
                </div>

                <Button
                  onClick={handleRepairAuthEmail}
                  disabled={repairingEmail || !student?.email || looksLikePlaceholderEmail(student?.email)}
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                >
                  {repairingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Sync login email with profile email
                </Button>
                <p className="text-xs text-muted-foreground -mt-2">
                  Use this if the student says they never receive password-reset emails — it copies the profile email into their login record so resets go to the right place.
                </p>

                {tempPassword && (
                  <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-3">
                    <div className="flex items-start gap-2 text-amber-200">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p className="text-xs">
                        Share this password with the student through a private channel. It will not be shown again after you leave this page. Ask them to change it after signing in.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-md bg-black/40 font-mono text-sm text-foreground break-all select-all">
                        {tempPassword}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyTempPassword}
                        className="gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                {!student?.email && (
                  <p className="text-xs text-muted-foreground">
                    This student has no email on file. Add one before resetting their password.
                  </p>
                )}
              </CardContent>
            </Card>

            {studentId && (
              <div className="mt-4">
                <ParentAccessManager
                  studentId={studentId}
                  intro="Da acceso a un papá, mamá o tutor para que entre a la cuenta de este alumno y vea videos, lecciones y avance — y pueda reservar o pagar a su nombre. Recibirán un link mágico por correo."
                />
              </div>
            )}

            {studentId && (
              <div className="mt-4">
                <FamilyLinksManager studentId={studentId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="lessons" className="space-y-4">
            <RecurringScheduleCard studentId={studentId!} packages={studentPackages} />
            <div className="flex items-center justify-between">
              <p className="text-ivory/60 text-sm">{allRelevantLessons.length} lesson{allRelevantLessons.length !== 1 ? 's' : ''}</p>
              <div className="flex items-center gap-2">
                {lessonSelectMode ? (
                  <>
                    <Button
                      onClick={() => setSelectedLessonIds(new Set(allRelevantLessons.map((l: any) => l.id)))}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      Select all
                    </Button>
                    <Button onClick={exitSelectMode} variant="outline" size="sm" className="text-xs">
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => setLessonSelectMode(true)}
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Select
                    </Button>
                    <Button
                      onClick={() => setAddLessonOpen(true)}
                      className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-2"
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add Lesson Manually
                    </Button>
                  </>
                )}
              </div>
            </div>
            {allRelevantLessons.length > 0 ? (
              (() => {
                const todayStr = new Date().toISOString().substring(0, 10);
                const sorted = [...allRelevantLessons].sort((a: any, b: any) =>
                  getLessonSortKey(b).localeCompare(getLessonSortKey(a))
                );
                // Chronological weighted numbering WITHIN each package (oldest = #1).
                // A 2-hour lesson consumes two slots, so the next badge skips one number.
                const lessonNumberMap = buildWeightedLessonNumberMap(allRelevantLessons, {
                  groupByPackage: true,
                  completedOnly: true,
                });
                // Upcoming = scheduled AND date is today or future
                // (Treat completed-but-future as scheduled too — it hasn't happened yet.)
                const upcoming = sorted
                  .filter((l: any) => effectiveLessonStatus(l) === 'scheduled' && l.lesson_date >= todayStr)
                  // upcoming should read soonest first (oldest at top of "future")
                  .reverse();
                const pastAll = sorted.filter(
                  (l: any) => !(effectiveLessonStatus(l) === 'scheduled' && l.lesson_date >= todayStr)
                );
                const past = pastAll.filter((l: any) => isEffectivelyTaken(l));
                const pastWeightedCount = getWeightedLessonCount(past);
                const pastOther = pastAll.filter((l: any) => !isEffectivelyTaken(l));
                const renderCard = (lesson: any) => (
                  <AdminLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    lessonNumber={lessonNumberMap.get(lesson.id)}
                    studentId={studentId!}
                    profileId={studentId!}
                    packages={studentPackages}
                    lessons={lessons as any[]}
                    selectable={lessonSelectMode}
                    selected={selectedLessonIds.has(lesson.id)}
                    onToggleSelect={toggleLessonSelected}
                    onNotesSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                      queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
                      queryClient.invalidateQueries({ queryKey: ['admin-student-points', studentId] });
                    }}
                  />
                );
                return (
                  <div className="space-y-6">
                    {upcoming.length > 0 && (
                      <Collapsible defaultOpen={false}>
                        <CollapsibleTrigger className="flex items-center gap-2 px-1 w-full hover:opacity-80 transition-opacity group">
                          <Calendar className="h-4 w-4 text-[#4a7c59]" />
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#4a7c59]">
                            Upcoming ({upcoming.length})
                          </h3>
                          <Plus className="h-4 w-4 text-[#4a7c59] ml-auto group-data-[state=open]:rotate-45 transition-transform" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {upcoming.map(renderCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {past.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Past lessons ({pastWeightedCount})
                          </h3>
                        </div>
                    <div className="space-y-2">
                      {(() => {
                        const pkgMap = new Map<string, any>(
                          (studentPackages as any[]).map((p: any) => [p.id, p])
                        );
                        const activePkgId = activePackage?.id;
                        let lastKey: string | null = null;
                        let lastAccent: string | null = null;
                        const out: any[] = [];
                        past.forEach((lesson: any, idx: number) => {
                          const key = lesson.package_id || '__none__';
                          if (key !== lastKey) {
                            const pkg = lesson.package_id ? pkgMap.get(lesson.package_id) : null;
                            const isActive = pkg && pkg.id === activePkgId;
                            const isIndividual = !lesson.package_id;
                            const accent = isIndividual
                              ? 'rgba(245,240,232,0.15)'
                              : isActive
                                ? '#F0C040'
                                : 'rgba(245,240,232,0.25)';
                            const labelColor = isIndividual
                              ? 'rgba(245,240,232,0.5)'
                              : isActive
                                ? '#F0C040'
                                : 'rgba(245,240,232,0.7)';
                            const label = isIndividual
                              ? 'Individual lessons'
                              : (pkg?.package_name || `${pkg?.package_size || '?'}-Lesson Package`);
                            const used = pkg?._totalLessonsUsed ?? pkg?.classes_used;
                            const size = pkg?.package_size;
                            const statusText = !pkg
                              ? null
                              : isActive
                                ? 'Active'
                                : (pkg._totalLessonsRemaining ?? 0) <= 0
                                  ? 'Completed'
                                  : 'Inactive';
                            const isShared = !!pkg?._isShared;
                            const sharingText = pkg
                              ? (isShared ? 'Shared' : 'Individual')
                              : null;
                            const otherNames: string[] = (pkg?._otherMemberNames || []) as string[];
                            out.push(
                              <div
                                key={`divider-${key}-${lesson.id}`}
                                className="flex items-center gap-3 pt-4 pb-1"
                              >
                                <div
                                  className="flex-1 h-px"
                                  style={{ background: accent }}
                                />
                                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider whitespace-nowrap">
                                  <span style={{ color: labelColor, fontWeight: 600 }}>
                                    {label}
                                  </span>
                                  {pkg && size != null && (
                                    <span style={{ color: 'rgba(245,240,232,0.4)' }}>
                                      · {used ?? 0}/{size} used
                                    </span>
                                  )}
                                  {sharingText && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px]"
                                      style={{
                                        background: isShared
                                          ? 'rgba(74,124,89,0.18)'
                                          : 'rgba(245,240,232,0.06)',
                                        color: isShared
                                          ? '#4a7c59'
                                          : 'rgba(245,240,232,0.55)',
                                      }}
                                      title={isShared && otherNames.length ? `with ${otherNames.join(', ')}` : undefined}
                                    >
                                      {sharingText}
                                      {isShared && otherNames.length > 0 ? ` · with ${otherNames.slice(0, 2).join(', ')}${otherNames.length > 2 ? '…' : ''}` : ''}
                                    </span>
                                  )}
                                  {statusText && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px]"
                                      style={{
                                        background: isActive ? 'rgba(240,192,64,0.15)' : 'rgba(245,240,232,0.08)',
                                        color: labelColor,
                                      }}
                                    >
                                      {statusText}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="flex-1 h-px"
                                  style={{ background: accent }}
                                />
                              </div>
                            );
                            lastKey = key;
                            lastAccent = accent;
                          }
                          out.push(renderCard(lesson));
                          // Closing divider after the last lesson of each group
                          const isLast = idx === past.length - 1;
                          const nextKey = !isLast ? (past[idx + 1].package_id || '__none__') : null;
                          if (isLast || nextKey !== key) {
                            out.push(
                              <div
                                key={`divider-end-${key}-${lesson.id}`}
                                className="flex items-center gap-3 pt-1 pb-2"
                              >
                                <div className="flex-1 h-px" style={{ background: lastAccent || 'rgba(245,240,232,0.15)' }} />
                              </div>
                            );
                          }
                        });
                        return out;
                      })()}
                    </div>
                      </div>
                    )}
                    {pastOther.length > 0 && (
                      <Collapsible defaultOpen={false}>
                        <CollapsibleTrigger className="flex items-center gap-2 px-1 w-full hover:opacity-80 transition-opacity group">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Other lessons ({pastOther.length})
                          </h3>
                          <span className="text-[11px] text-muted-foreground/70 ml-1">skipped · cancelled · no-show</span>
                          <Plus className="h-4 w-4 text-muted-foreground ml-auto group-data-[state=open]:rotate-45 transition-transform" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {pastOther.map(renderCard)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                );
              })()
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No lessons yet</p>
                </CardContent>
              </Card>
            )}

            <AddLessonModal
              open={addLessonOpen}
              onOpenChange={setAddLessonOpen}
              studentId={studentId!}
              studentName={student?.full_name || student?.email}
              onLessonAdded={() => {
                queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
                queryClient.invalidateQueries({ queryKey: ['admin-student-points', studentId] });
                queryClient.invalidateQueries({ queryKey: ['class-packages'] });
                queryClient.invalidateQueries({ queryKey: ['student-active-package'] });
                queryClient.invalidateQueries({ queryKey: ['next-lesson'] });
                queryClient.invalidateQueries({ queryKey: ['student-upcoming-lessons'] });
              }}
            />

            {lessonSelectMode && selectedLessonIds.size > 0 && (
              <div
                className="fixed left-0 right-0 z-40 px-3 pb-3"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
              >
                <div className="mx-auto max-w-2xl rounded-xl border border-[#F0C040]/40 bg-[#0d1f18]/95 backdrop-blur p-3 flex items-center gap-2 shadow-lg">
                  <span className="text-sm text-ivory font-medium flex-1">
                    {selectedLessonIds.size} selected
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            )}

            <BulkEditLessonsModal
              open={bulkEditOpen}
              onOpenChange={setBulkEditOpen}
              lessonIds={Array.from(selectedLessonIds)}
              packages={studentPackages}
              onDone={() => {
                exitSelectMode();
                invalidateLessonQueries();
              }}
            />

            <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedLessonIds.size} lesson{selectedLessonIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Completed lessons will return their slot to the package and revert the points awarded. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
                    disabled={bulkDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{visiblePackages.length} package{visiblePackages.length !== 1 ? 's' : ''}</p>
              <Button
                onClick={() => setAddPackageOpen(true)}
                className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-2"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Add Package
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setRebalanceOpen(true)}
              >
                <RefreshCw className="h-4 w-4" />
                Rebalancear
              </Button>
            </div>

            {visiblePackages.length > 0 ? (
              <div className="space-y-3">
                {visiblePackages.map((pkg: any) => {
                  const pkgPrice = Number(pkg.price) || 0;
                  const pkgPaid = Number(pkg.amount_paid) || 0;
                  const pkgPending = Math.max(0, pkgPrice - pkgPaid);
                  const pkgStatus = pkgPaid <= 0 ? 'pending' : pkgPending <= 0 ? 'paid' : 'partial';
                  const isCurrentlyUsed = activePackage?.id === pkg.id;
                  // Compute first/last lesson date for this package
                  const pkgLessons =
                    lessonsByPackageId.get(pkg.id) ||
                    (lessons as any[]).filter((l: any) => l.package_id === pkg.id);
                  const sortedDates = pkgLessons
                    .map((l: any) => l.lesson_date)
                    .filter(Boolean)
                    .sort();
                  const firstDate = sortedDates[0];
                  const lastDate = sortedDates[sortedDates.length - 1];
                  const pkgCounts = computePackageCounts(pkg, pkgLessons);
                  const fmtShort = (d: string) => {
                    const [y, m, day] = d.split('-').map(Number);
                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                    return `${day} ${months[m-1]} ${String(y).slice(2)}`;
                  };
                  return (
                    <Card
                      key={pkg.id}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${pkg.package_size === 0 ? 'border-blue-500/30' : pkgCounts.remaining > 0 ? 'border-[#4a7c59]/30' : 'opacity-60'}`}
                      onClick={() => setViewingPackageLessons(pkg)}
                    >
                      <CardContent className="py-4" onClick={(e) => {
                        // prevent inner buttons clicks from bubbling handled below
                      }}>
                         <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Package className="h-4 w-4 text-[#4a7c59]" />
                              <span className="font-semibold text-sm">{pkg.package_name || `${pkg.package_size}-Lesson Package`}</span>
                              {pkg.package_size === 0 && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">⚠️ Pending Size</Badge>
                              )}
                              {pkg.ar_status === 'draft' && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">📝 Borrador — pendiente de revisar</Badge>
                              )}
                              {pkg.ar_status !== 'draft' && pkg.package_size > 0 && pkgCounts.remaining > 0 && (
                                <Badge className="bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30 text-[10px]">Active</Badge>
                              )}
                              {isCurrentlyUsed && (
                                <Badge className="bg-[#F0C040]/20 text-[#F0C040] border-[#F0C040]/40 text-[10px]">
                                  ⭐ En uso
                                </Badge>
                              )}
                              {pkg.is_paused === true && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">⏸ Pausado</Badge>
                              )}
                              {pkg.package_size > 0 && pkgCounts.remaining === 0 && (
                                <Badge variant="outline" className="text-[10px]">Completed</Badge>
                              )}
                              {pkg._isShared && (
                                <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px]">👥 Compartido</Badge>
                              )}
                              {!pkg._isOwner && (
                                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Miembro</Badge>
                              )}
                            </div>
                            {pkg._isShared && pkg._otherMemberNames?.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mb-1">
                                Compartido con: {pkg._otherMemberNames.join(', ')}
                              </p>
                            )}
                            {pkg._isShared && !pkg._isOwner && (
                              <p className="text-[10px] text-muted-foreground mb-1 italic">
                                Paquete compartido — los ingresos se contabilizan en el perfil del titular.
                              </p>
                            )}

                            {/* Package size assignment for pending packages */}
                             {pkg.package_size === 0 && (
                               <div className="flex items-center flex-wrap gap-2 mt-2 mb-2 p-2 rounded-lg" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                                 <span className="text-xs text-blue-400">Assign size:</span>
                                {[5, 10, 20, 30, 40].map((size) => (
                                  <Button
                                    key={size}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-3 text-xs"
                                    style={{ borderColor: 'rgba(96,165,250,0.3)', color: '#60a5fa' }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const currentPrice = Number(pkg.price) || 0;
                                      const refPrice: Record<number, number> = { 5: 7500, 10: 14850, 20: 26500, 30: 34650 };
                                      const pkgLessons =
                                        lessonsByPackageId.get(pkg.id) ||
                                        (lessons as any[]).filter((l: any) => l.package_id === pkg.id);
                                      const usedSlots = pkgLessons.reduce((sum: number, l: any) => sum + getLessonPackageUsage(l), 0);
                                      const remaining = Math.max(0, size - usedSlots);
                                      const updateData: Record<string, any> = {
                                        package_size: size,
                                        classes_remaining: remaining,
                                        package_name: `${size}-Lesson Package`,
                                        is_active: remaining > 0,
                                      };
                                      if (currentPrice <= 0) {
                                        updateData.price = refPrice[size] || size * 1650;
                                      }
                                      await supabase.from('class_packages').update(updateData).eq('id', pkg.id);
                                      refetchPackages();
                                    }}
                                  >
                                    {size}
                                  </Button>
                                ))}
                              </div>
                            )}

                            {pkg.package_size > 0 && (() => {
                              // Single source of truth (see lib/lessonPackageUsage.ts)
                              const counts = pkgCounts;
                              return (
                                <>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                                    <span>Used: {counts.used}/{counts.total}</span>
                                    <span>Remaining: {counts.remaining}</span>
                                    {counts.scheduled > 0 && (
                                      <span className="text-blue-400">Agendas: {counts.scheduled}</span>
                                    )}
                                  </div>
                                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${counts.pct}%`, background: counts.remaining > 0 ? '#4a7c59' : '#ef4444' }}
                                    />
                                  </div>
                                </>
                              );
                            })()}

                            {pkg.package_size === 0 && (
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                <span>Used: {pkgLessons.reduce((sum: number, l: any) => sum + getLessonPackageUsage(l), 0)}</span>
                                <span className="text-blue-400">Size: pending</span>
                              </div>
                            )}
                            {/* Date range from linked lessons */}
                            {firstDate && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3 opacity-60" />
                                {firstDate === lastDate ? (
                                  <span>{fmtShort(firstDate)}</span>
                                ) : (
                                  <span>{fmtShort(firstDate)} → {fmtShort(lastDate)}</span>
                                )}
                                <span className="opacity-50">· {pkgCounts.total} clase{pkgCounts.total !== 1 ? 's' : ''}</span>
                              </div>
                            )}
                            {!firstDate && pkg.classes_used > 0 && (
                              <div className="text-[11px] text-yellow-400/70 mt-1">
                                ⚠️ No lessons linked — assign lessons to the package
                              </div>
                            )}
                          </div>
                           <div className="flex flex-row items-center justify-between gap-2 w-full sm:w-auto sm:flex-col sm:items-end sm:text-right sm:space-y-1.5 flex-shrink-0">
                            {pkgStatus === 'paid' ? (
                              <Badge className="bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30 text-[10px]">✅ Already paid</Badge>
                            ) : pkgStatus === 'partial' ? (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">🔶 Partial payment</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">⏳ Payment pending</Badge>
                            )}
                            {pkg.payment_date && (
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(pkg.payment_date + 'T12:00:00'), 'dd MMM yyyy')}
                              </p>
                            )}
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {pkg.is_active !== true && (pkg.classes_remaining ?? 0) > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 text-[#4a7c59] hover:text-[#4a7c59] hover:bg-[#4a7c59]/10"
                                  disabled={settingActivePackageId === pkg.id}
                                  onClick={(e) => { e.stopPropagation(); handleSetActivePackage(pkg); }}
                                >
                                  {settingActivePackageId === pkg.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Bolt className="h-3 w-3" />
                                  )}
                                  Set as Active
                                </Button>
                              )}
                              {pkg.is_active === true && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                  disabled={pausingPackageId === pkg.id}
                                  onClick={(e) => { e.stopPropagation(); handleTogglePausePackage(pkg); }}
                                >
                                  {pausingPackageId === pkg.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : pkg.is_paused === true ? (
                                    <Play className="h-3 w-3" />
                                  ) : (
                                    <Pause className="h-3 w-3" />
                                  )}
                                   {pkg.is_paused === true ? 'Reanudar' : 'Pausar'}
                                 </Button>
                               )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                disabled={archivingPackageId === pkg.id}
                                onClick={(e) => { e.stopPropagation(); handleToggleArchivePackage(pkg); }}
                              >
                                {archivingPackageId === pkg.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ArchiveIcon className="h-3 w-3" />
                                )}
                                Archivar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                onClick={(e) => { e.stopPropagation(); setEditingPackage(pkg); }}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              {pkg.is_active === true && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-[#4a7c59]"
                                  title="Regenerate lessons"
                                  disabled={regeneratingPackageId === pkg.id}
                                  onClick={(e) => { e.stopPropagation(); handleRegeneratePackageLessons(pkg); }}
                                >
                                  {regeneratingPackageId === pkg.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setDeletingPackageId(pkg.id);
                                  setPackageAttachments(null);
                                  try {
                                    const counts = await getPackageAttachments(pkg.id);
                                    setPackageAttachments(counts);
                                  } catch {
                                    setPackageAttachments({ lessons: 0, payments: 0, members: 0 });
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No packages yet</p>
                  <Button
                    onClick={() => setAddPackageOpen(true)}
                    className="mt-3 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-2"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Package
                  </Button>
                </CardContent>
              </Card>
            )}

            {archivedPackages.length > 0 && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-xs text-muted-foreground"
                  onClick={() => setShowArchivedPackages((v) => !v)}
                >
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  Archivados ({archivedPackages.length})
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showArchivedPackages ? 'rotate-180' : ''}`} />
                </Button>
                {showArchivedPackages && (
                  <div className="space-y-2 mt-2">
                    {archivedPackages.map((pkg: any) => {
                      const pkgLessons =
                        lessonsByPackageId.get(pkg.id) ||
                        (lessons as any[]).filter((l: any) => l.package_id === pkg.id);
                      const counts = computePackageCounts(pkg, pkgLessons);
                      return (
                        <Card key={pkg.id} className="opacity-70">
                          <CardContent className="py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm truncate">
                                  {pkg.package_name || `${pkg.package_size}-Lesson Package`}
                                </span>
                                <Badge variant="outline" className="text-[10px]">Archivado</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Used: {counts.used}/{counts.total} · Remaining: {counts.remaining}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-[#4a7c59] hover:text-[#4a7c59] hover:bg-[#4a7c59]/10"
                              disabled={archivingPackageId === pkg.id}
                              onClick={(e) => { e.stopPropagation(); handleToggleArchivePackage(pkg); }}
                            >
                              {archivingPackageId === pkg.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ArchiveIcon className="h-3 w-3" />
                              )}
                              Desarchivar
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <AddPackageModal
              open={addPackageOpen}
              onOpenChange={setAddPackageOpen}
              preselectedStudentId={studentId}
              onPackageAdded={async () => {
                if (studentId) await rebalanceAndRegenerate(studentId);
                refetchPackages();
                queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
              }}
            />

            <RebalanceLessonsDialog
              open={rebalanceOpen}
              onOpenChange={setRebalanceOpen}
              studentId={studentId || ''}
              onDone={() => {
                refetchPackages();
                queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
              }}
            />

            <EditPackageModal
              open={!!editingPackage}
              onOpenChange={(v) => { if (!v) setEditingPackage(null); }}
              pkg={editingPackage}
              onSaved={async () => {
                if (studentId) await rebalanceAndRegenerate(studentId);
                refetchPackages();
                queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                queryClient.invalidateQueries({ queryKey: ['student-package-payments', studentId] });
              }}
            />
          </TabsContent>

          <TabsContent value="videos" className="space-y-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="text-sm text-muted-foreground">
                {allVideos.length > 0 ? `Showing ${allVideos.length} video${allVideos.length > 1 ? 's' : ''}` : 'No videos uploaded yet'}
              </p>
              <div className="flex gap-2">
                {(allVideos.length > 0 || familyVideos.length > 0) && (
                  <Button
                    variant={videoSelectMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => { setVideoSelectMode((v) => !v); setSelectedVideoKeys({}); }}
                  >
                    {videoSelectMode ? 'Cancelar' : 'Seleccionar'}
                  </Button>
                )}
                <Button
                  onClick={() => setMediaUploadOpen(true)}
                  size="sm"
                  className="gap-2 bg-green-accent hover:bg-green-accent/90 text-ivory"
                >
                  <Upload className="h-4 w-4" />
                  Subir Video
                </Button>
                <Link to={`/admin/upload-video?studentId=${studentId}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Video
                  </Button>
                </Link>
              </div>
            </div>

            {videoSelectMode && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm">{selectedVideoItems.length} seleccionado(s)</span>
                <Button
                  size="sm"
                  disabled={selectedVideoItems.length === 0}
                  onClick={() => setMoveToFamilyOpen(true)}
                >
                  Mover a…
                </Button>
              </div>
            )}

            {allVideos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allVideos.map((video: any) => (
                  <div
                    key={video.id} 
                    className="relative aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10 cursor-pointer group"
                    onClick={() => {
                      if (videoSelectMode) {
                        toggleVideoSelection(video.id, video._source === 'media' ? 'media' : 'videos', video._ownerId || studentId!);
                        return;
                      }
                      if (video._source === 'videos') {
                        setSelectedVideoId(video.id);
                        setIsModalOpen(true);
                      } else {
                        setPreviewItem(video);
                      }
                    }}
                  >
                    {videoSelectMode && (
                      <div className="absolute inset-0 z-20 bg-black/40 flex items-start justify-end p-2">
                        <Checkbox checked={!!selectedVideoKeys[video.id]} className="bg-background" />
                      </div>
                    )}

                    {/* Category badge - top left */}
                    <div className="absolute top-1.5 left-1.5 z-10">
                      <Badge 
                        variant={video.category === 'analysis' ? 'destructive' : video._source === 'media' ? 'outline' : 'secondary'}
                        className="text-[9px] px-1.5 py-0 shadow-md"
                      >
                        {video.category === 'analysis' ? 'ANALYSIS' : video._source === 'media' ? 'MEDIA' : 'LESSON'}
                      </Badge>
                    </div>

                    {/* Action buttons - top right */}
                    {video._source === 'videos' && (
                      <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                        <VideoCardMenu video={video} studentId={studentId} />
                      </div>
                    )}
                    {video._source === 'media' && (
                      <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 hover:bg-background shadow-sm" onClick={() => { setEditMediaItem(video); setEditMediaTitle(video.title || ''); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 hover:bg-destructive/80 shadow-sm text-destructive" onClick={() => setDeleteMediaId(video.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Thumbnail / content */}
                    {video.file_type === 'video' || video._source === 'videos' ? (
                      <>
                        {video.thumbnail_url ? (
                          <SignedLessonImg src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-11 w-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                            <Play className="h-5 w-5 text-ivory ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <SignedLessonImg src={video.file_url} alt={video.title} className="w-full h-full object-cover" />
                    )}

                    {/* Bottom overlay with title + date */}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      {video.title && <p className="text-[11px] text-ivory font-semibold truncate">{video.title}</p>}
                      <p className="text-[10px] text-ivory/60 truncate">{format(new Date(video._effective_date || video.upload_date || video.uploaded_at), 'MMM dd, yyyy')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center space-y-4">
                  <Video className="h-16 w-16 text-muted-foreground mx-auto opacity-50" />
                  <div>
                    <p className="text-muted-foreground mb-2">No videos uploaded yet</p>
                    <Link to={`/admin/upload-video?studentId=${studentId}`}>
                      <Button variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload First Video
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Family members' videos — shown apart, never counted in this
                student's stats. */}
            {familyVideos.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border">
                <p className="text-sm font-semibold">Videos de su familia</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {familyVideos.map((video: any) => (
                    <div
                      key={`fam-${video.id}`}
                      className="relative aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10 cursor-pointer group"
                      onClick={() => {
                        if (videoSelectMode) {
                          toggleVideoSelection(video.id, video._source === 'media' ? 'media' : 'videos', video._ownerId);
                          return;
                        }
                        if (video._source === 'videos') {
                          setSelectedVideoId(video.id);
                          setIsModalOpen(true);
                        } else {
                          setPreviewItem(video);
                        }
                      }}
                    >
                      {videoSelectMode && (
                        <div className="absolute inset-0 z-20 bg-black/40 flex items-start justify-end p-2">
                          <Checkbox checked={!!selectedVideoKeys[video.id]} className="bg-background" />
                        </div>
                      )}

                      <div className="absolute top-1.5 left-1.5 z-10">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shadow-md bg-background/80">
                          {video._ownerName}{video._ownerManaged ? ' · sin cuenta' : ''}
                        </Badge>
                      </div>

                      {video.file_type === 'video' || video._source === 'videos' ? (
                        <>
                          {video.thumbnail_url ? (
                            <SignedLessonImg src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Video className="h-10 w-10 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-11 w-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                              <Play className="h-5 w-5 text-ivory ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <SignedLessonImg src={video.file_url} alt={video.title} className="w-full h-full object-cover" />
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        {video.title && <p className="text-[11px] text-ivory font-semibold truncate">{video.title}</p>}
                        <p className="text-[10px] text-ivory/60 truncate">
                          {format(new Date(video._effective_date || video.upload_date || video.uploaded_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Drills Tab */}
          <TabsContent value="drills" className="space-y-4">
            <DrillsLinksList studentId={studentId!} coachId={user?.id} isCoach={true} />
          </TabsContent>

          {/* Highlights Tab */}
          <TabsContent value="highlights" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {studentHighlights.length > 0 ? `${studentHighlights.length} highlight${studentHighlights.length !== 1 ? 's' : ''}` : 'No highlights yet'}
              </p>
              <Button
                size="sm"
                onClick={() => setHighlightUploadOpen(true)}
                className="bg-gold-accent hover:bg-gold-accent/90 text-black font-semibold gap-2"
              >
                <Upload className="h-4 w-4" />
                Add highlight
              </Button>
            </div>
            {studentHighlights.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {studentHighlights.map((h: any) => (
                  <div
                    key={h.id}
                    className="relative aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10 cursor-pointer"
                    onClick={() => setPreviewItem(h)}
                  >
                    {h.file_type === 'image' ? (
                      <SignedLessonImg src={h.file_url} alt={h.title || 'Highlight'} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        {h.thumbnail_url ? (
                          <SignedLessonImg src={h.thumbnail_url} alt={h.title || ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-11 w-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                            <Play className="h-5 w-5 text-ivory ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      {h.title && <p className="text-[11px] text-ivory font-semibold truncate">{h.title}</p>}
                      {h.caption && <p className="text-[10px] text-ivory/60 truncate">{h.caption}</p>}
                      <Badge className="bg-white/15 text-ivory/90 border-transparent text-[9px] px-1.5 py-0 mt-0.5">
                        {h.category === 'trophy' ? 'Trophy' : h.category === 'scorecard' ? 'Scorecard' : h.category === 'milestone' ? 'Milestone' : h.category === 'personal' ? 'Personal' : 'Highlight'}
                      </Badge>
                    </div>
                    {h.is_pinned && (
                      <div className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-gold-accent/90 flex items-center justify-center">
                        <Star className="h-3 w-3 text-black" fill="currentColor" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center space-y-4">
                  <Trophy className="h-16 w-16 text-muted-foreground mx-auto opacity-50" />
                  <p className="text-muted-foreground">This student hasn't added any highlights yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6">

      {/* Lightbox preview for media / highlights */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewItem(null)}
        >
          <button
            onClick={() => setPreviewItem(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-ivory text-xl z-50"
            aria-label="Close"
          >
            ✕
          </button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {previewItem.file_type === 'image' ? (
              <SignedLessonImg src={previewItem.file_url} alt={previewItem.title || ''} className="max-h-[80vh] w-auto mx-auto rounded-xl" />
            ) : (
              <SignedLessonVideo src={previewItem.file_url || previewItem.video_url} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-xl bg-black" />
            )}
            {(previewItem.title || previewItem.caption || previewItem.description) && (
              <div className="mt-3 text-center">
                {previewItem.title && <p className="text-ivory font-semibold">{previewItem.title}</p>}
                {(previewItem.caption || previewItem.description) && <p className="text-ivory/60 text-sm mt-1">{previewItem.caption || previewItem.description}</p>}
              </div>
            )}
          </div>
        </div>
      )}

            {/* Missing Revenue Warning */}
            {hasMissingRevenue && (
              <Card className="border-warning/50 bg-warning/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 text-warning">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">
                      Some lessons may have missing revenue data.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Student Revenue KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="card-elevated">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="stat-label">Month to Date</p>
                      <p className="text-3xl font-heading font-bold text-primary">{fmtMXN(revenueStats.mtd)}</p>
                      <p className="text-xs text-muted-foreground">{revenueStats.mtdCount} payments</p>
                    </div>
                    <div className="h-10 w-10 icon-container bg-primary/10 text-primary">
                      <Calendar className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-elevated">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="stat-label">Last 30 Days</p>
                      <p className="text-3xl font-heading font-bold text-info">{fmtMXN(revenueStats.last30)}</p>
                      <p className="text-xs text-muted-foreground">{revenueStats.last30Count} payments</p>
                    </div>
                    <div className="h-10 w-10 icon-container bg-info/10 text-info">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-elevated">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="stat-label">All Time</p>
                      <p className="text-3xl font-heading font-bold text-warning">{fmtMXN(revenueStats.allTime)}</p>
                      <p className="text-xs text-muted-foreground">{revenueStats.allTimeCount} payments</p>
                    </div>
                    <div className="h-10 w-10 icon-container bg-warning/10 text-warning">
                      <DollarSign className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ============= Accounts Receivable ============= */}
            <Card className="card-elevated border-warning/30">
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-warning" />
                      Accounts Receivable
                    </CardTitle>
                    <CardDescription>
                      Outstanding balances owed by this student. Matches the global AR breakdown.
                    </CardDescription>
                  </div>
                  <Link to="/admin/revenue" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    View in global AR <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-center">
                    <p className="text-2xl font-heading font-bold text-warning">{fmtMXN(studentAR.grandTotal)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Total owed</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/40 p-3 text-center">
                    <p className="text-2xl font-heading font-bold text-foreground">{studentAR.lessonsCount}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Lessons unpaid</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/40 p-3 text-center">
                    <p className="text-2xl font-heading font-bold text-foreground">{studentAR.packagesCount}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Packages w/ balance</p>
                  </div>
                </div>

                {/* Packages with outstanding balance */}
                {studentAR.packages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packages</p>
                    {studentAR.packages.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">
                              {p.package_name || `${p.package_size}-lesson package`}
                            </p>
                            <Badge className={p.arKind === 'pending'
                              ? 'bg-red-500/20 text-red-400 border-red-500/30 text-[10px]'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]'}>
                              {p.arKind === 'pending' ? 'Pending' : 'Partial'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Balance <span className="text-warning font-semibold">{fmtMXN(p.balance)}</span>
                            {' '}of {fmtMXN(Number(p.price) || 0)}
                            {Number(p.amount_paid) > 0 ? <> · paid {fmtMXN(Number(p.amount_paid))}</> : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setAddPaymentOpen(true)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add payment
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditingPackage(p)}
                            title="Edit package"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unpaid completed lessons */}
                {studentAR.unpaidLessons.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lessons</p>
                    {studentAR.unpaidLessons.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{l.lesson_type}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatLessonDate({ lesson_date: l.lesson_date, lesson_time: l.lesson_time }, 'short')}
                            {' · '}{formatLessonTime({ lesson_date: l.lesson_date, lesson_time: l.lesson_time })}
                            {' · '}<span className="text-warning font-semibold">{fmtMXN(l.amount)}</span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs shrink-0"
                          onClick={() => setArEditLesson(l)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {studentAR.packages.length === 0 && studentAR.unpaidLessons.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card/30 p-6 text-center">
                    <CheckCircle className="h-6 w-6 text-success mx-auto mb-1" />
                    <p className="text-sm text-muted-foreground">No outstanding balance</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* ============= /Accounts Receivable ============= */}

            {/* Revenue Table */}
            <Card className="card-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-warning" />
                      Payment History
                    </CardTitle>
                    <CardDescription>
                      {paymentEvents.length} payment{paymentEvents.length !== 1 ? 's' : ''} — Total: {fmtMXN(totalRevenue)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setAddPaymentOpen(true)}
                      size="sm"
                      className="gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                    >
                      <Plus className="h-4 w-4" />
                      Add Payment
                    </Button>
                    <Link to="/admin/revenue">
                      <Button variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Full Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-[70px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No payments recorded yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        paymentEvents.map((evt) => (
                          <TableRow key={evt.id}>
                            <TableCell className="font-medium">
                              {format(parseISO(evt.date), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{evt.label}</span>
                              <span className="text-xs text-muted-foreground ml-1.5">{evt.type}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${
                                paymentEventBucket(evt) === 'package' ? 'border-accent/40 text-accent' :
                                'border-warning/40 text-warning'
                              }`}>
                                {paymentEventBucket(evt) === 'package' ? '📦 Package' : '🏌️ Lesson'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-warning">
                              {fmtMXN(evt.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRevenueEntry(evt)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteRevenueEntry(evt)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            {studentId && <AdminLogRoundSection studentId={studentId} />}
            {studentId && (
              <CoachScoringReportButton
                studentId={studentId}
                studentName={student?.full_name || student?.email || 'Student'}
                handicap={student?.handicap ?? null}
              />
            )}
            {studentId && <RoundsList studentId={studentId} canEdit={false} emptyHint="This student hasn't logged any rounds yet." />}
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {studentId && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI Insights</h3>
                  <AiInsightsTab studentId={studentId} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reports</h3>
                  <StudentReportsTab studentId={studentId} studentName={student?.full_name || student?.email || 'Student'} />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="coach-notes" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {notesSelectMode ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedNoteKeys.size} selected
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedNoteKeys.size === 0 || bulkDeletingNotes}
                    onClick={() => setBulkDeleteNotesOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={exitNotesSelectMode} disabled={bulkDeletingNotes}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setNotesSelectMode(true)}>
                  Select
                </Button>
              )}
              {!notesSelectMode && (
                <AddStandaloneCoachNote
                  studentId={studentId!}
                  authorId={user?.id}
                  onAdded={() => queryClient.invalidateQueries({ queryKey: ['student-coach-notes', studentId] })}
                />
              )}
            </div>
            {(() => {
              type Entry = { key: string; kind: 'lesson' | 'video'; sortKey: string; node: JSX.Element };
              const entries: Entry[] = [];

              (standaloneCoachNotes || []).forEach((n: any) => {
                entries.push({
                  key: `note-${n.id}`,
                  kind: 'lesson',
                  sortKey: n.created_at || '',
                  node: (
                    <StandaloneCoachNoteCard
                      key={`note-${n.id}`}
                      note={n}
                      onChanged={() => queryClient.invalidateQueries({ queryKey: ['student-coach-notes', studentId] })}
                    />
                  ),
                });
              });

              (lessons || [])
                .filter((l: any) => l?.coach_notes && String(l.coach_notes).trim().length > 0)
                .forEach((l: any) => {
                  entries.push({
                    key: `lesson-${l.id}`,
                    kind: 'lesson',
                    sortKey: getLessonSortKey(l) || '',
                    node: (
                      <EditableCoachNoteCard
                        key={`lesson-${l.id}`}
                        table="lessons"
                        id={l.id}
                        field="coach_notes"
                        value={l.coach_notes}
                        title={<span className="font-semibold">{l.lesson_type || 'Lesson'}</span>}
                        meta={<>{formatLessonDate(l)}{l.lesson_time ? ` · ${formatLessonTime(l)}` : ''}</>}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] })}
                      />
                    ),
                  });
                });

              (videos || [])
                .filter((v: any) => v?.coach_feedback && String(v.coach_feedback).trim().length > 0)
                .forEach((v: any) => {
                  const linked = v.lessons;
                  const dateStr =
                    v.feedback_added_at ||
                    (linked?.lesson_date ? `${linked.lesson_date}T00:00:00` : null) ||
                    v.upload_date ||
                    v.created_at ||
                    '';
                  const displayDate = dateStr ? new Date(dateStr).toLocaleDateString() : '';
                  entries.push({
                    key: `video-${v.id}`,
                    kind: 'video',
                    sortKey: dateStr,
                    node: (
                      <EditableCoachNoteCard
                        key={`video-${v.id}`}
                        table="videos"
                        id={v.id}
                        field="coach_feedback"
                        value={v.coach_feedback}
                        title={
                          <button
                            type="button"
                            onClick={() => { setSelectedVideoId(v.id); setIsModalOpen(true); }}
                            className="flex items-center gap-2 text-left hover:underline"
                          >
                            {v.thumbnail_url && (
                              <SignedLessonImg src={v.thumbnail_url} alt="" className="h-8 w-12 rounded object-cover" />
                            )}
                            <span className="font-semibold">Feedback · {v.title || 'Untitled video'}</span>
                          </button>
                        }
                        meta={displayDate}
                        extra={v.next_steps && String(v.next_steps).trim().length > 0 ? (
                          <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</p>
                            <p className="whitespace-pre-wrap text-sm text-foreground">{v.next_steps}</p>
                          </div>
                        ) : undefined}
                        setExtraFields={() => ({ feedback_added_at: new Date().toISOString() })}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ['student-videos', studentId] })}
                      />
                    ),
                  });
                });

              if (entries.length === 0) {
                return (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      No coach notes yet.
                    </CardContent>
                  </Card>
                );
              }
              entries.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));
              return entries.map((e) => {
                if (!notesSelectMode) return e.node;
                const checked = selectedNoteKeys.has(e.key);
                return (
                  <div
                    key={e.key}
                    className={`flex items-start gap-2 rounded-lg border p-2 transition-colors cursor-pointer ${checked ? 'border-primary bg-primary/5' : 'border-transparent'}`}
                    onClick={() => toggleNoteSelected(e.key)}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleNoteSelected(e.key)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="mt-3"
                    />
                    <div className="flex-1 pointer-events-none">
                      {e.node}
                    </div>
                  </div>
                );
              });
            })()}
          </TabsContent>

          <AlertDialog open={bulkDeleteNotesOpen} onOpenChange={setBulkDeleteNotesOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedNoteKeys.size} note{selectedNoteKeys.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Standalone notes are removed permanently. Notes attached to lessons or videos will be cleared from those records. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkDeletingNotes}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleBulkDeleteNotes(); }}
                  disabled={bulkDeletingNotes}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {bulkDeletingNotes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Tabs>
      </main>
      
      <SocialFooter />

      {/* Report Modals */}
      <CreateReportModal
        open={createReportOpen}
        onOpenChange={setCreateReportOpen}
        studentId={studentId!}
        studentName={student?.full_name || student?.email || 'Student'}
        onScoringSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['student-reports', studentId] });
        }}
        onReportGenerated={(report, name, start, end) => {
          setReportPreview({ report, studentName: name, dateStart: start, dateEnd: end });
        }}
      />
      {reportPreview && (
        <ReportPreviewModal
          open={!!reportPreview}
          onOpenChange={(o) => !o && setReportPreview(null)}
          report={reportPreview.report}
          studentId={studentId!}
          studentName={reportPreview.studentName}
          dateStart={reportPreview.dateStart}
          dateEnd={reportPreview.dateEnd}
          onRegenerate={() => {
            setReportPreview(null);
            setCreateReportOpen(true);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['student-reports', studentId] });
          }}
        />
      )}

      {/* Video Detail Modal */}
      <VideoDetailModal
        videoId={selectedVideoId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVideoId(null);
        }}
        isCoach={true}
        onFeedbackSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['student-videos', studentId] });
        }}
      />

      {/* Video Upload Sheet (same modal as bottom FAB, with student preselected) */}
      {studentId && user && (
        <CoachVideoUploadSheet
          open={mediaUploadOpen}
          onOpenChange={(v) => { setMediaUploadOpen(v); if (!v) refetchMedia(); }}
          preselectedStudentId={studentId}
        />
      )}

      {/* Move selected videos to a linked family member */}
      {studentId && (
        <MoveVideosToFamilyDialog
          open={moveToFamilyOpen}
          onOpenChange={setMoveToFamilyOpen}
          studentId={studentId}
          items={selectedVideoItems}
          onMoved={() => { setSelectedVideoKeys({}); setVideoSelectMode(false); refetchMedia(); }}
        />
      )}

      {/* Highlight Upload Modal (coach posting on behalf of student) */}
      {studentId && (
        <AddHighlightModal
          open={highlightUploadOpen}
          onClose={() => setHighlightUploadOpen(false)}
          studentId={studentId}
          remainingSlots={Infinity}
          onUploaded={() => queryClient.invalidateQueries({ queryKey: ['student-highlights-admin', studentId] })}
        />
      )}

      {studentId && (
        <CancelSubscriptionDialog
          open={cancelSubOpen}
          onOpenChange={setCancelSubOpen}
          studentId={studentId}
          studentName={student?.full_name || student?.email}
          onCanceled={() => {
            queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-active-subscription', studentId] });
            queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
          }}
        />
      )}

      {studentId && (
        <PauseSubscriptionDialog
          open={pauseSubOpen}
          onOpenChange={setPauseSubOpen}
          studentId={studentId}
          studentName={student?.full_name || student?.email}
          isPaused={!!activeSubscription?.paused_at}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-active-subscription', studentId] });
            queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
          }}
        />
      )}

      {/* Media Edit Dialog */}
      <Dialog open={!!editMediaItem} onOpenChange={(o) => !o && setEditMediaItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Media</DialogTitle>
            <DialogDescription>Update the title for this media item.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="media-title">Title</Label>
            <Input
              id="media-title"
              value={editMediaTitle}
              onChange={(e) => setEditMediaTitle(e.target.value)}
              placeholder="Enter title"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMediaItem(null)} disabled={savingMedia}>Cancel</Button>
            <Button onClick={handleEditMedia} disabled={savingMedia}>
              {savingMedia ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Delete Confirmation */}
      <AlertDialog open={!!deleteMediaId} onOpenChange={(o) => !o && setDeleteMediaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this media?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. The file will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMedia}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMedia}
              disabled={deletingMedia}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingMedia ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Modal */}
      {studentId && user && (
        <AddPaymentModal
          open={addPaymentOpen}
          onOpenChange={setAddPaymentOpen}
          studentId={studentId}
          coachId={user.id}
          onPaymentAdded={() => refetchPayments()}
        />
      )}

      {/* AR — Edit unpaid lesson */}
      <EditLessonQuickModal
        open={!!arEditLesson}
        onOpenChange={(o) => { if (!o) setArEditLesson(null); }}
        lesson={arEditLesson}
      />

      {/* Edit Revenue Entry Modal */}
      <EditRevenueEntryModal
        open={!!editRevenueEntry}
        onOpenChange={(o) => { if (!o) setEditRevenueEntry(null); }}
        entry={editRevenueEntry}
        onSaved={() => {
          refetchPayments();
          queryClient.invalidateQueries({ queryKey: ['student-package-payments', studentId] });
          queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
          queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
        }}
      />

      {/* Delete Revenue Entry Confirmation */}
      <AlertDialog open={!!deleteRevenueEntry} onOpenChange={(o) => { if (!o) setDeleteRevenueEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteRevenueEntry?.source === 'lesson' ? 'lesson revenue' : 'payment'} of {deleteRevenueEntry ? fmtMXN(deleteRevenueEntry.amount) : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingRevenue}
              onClick={async () => {
                if (!deleteRevenueEntry) return;
                setDeletingRevenue(true);
                try {
                  if (deleteRevenueEntry.source === 'package') {
                    const { error } = await supabase.from('package_payments').delete().eq('id', deleteRevenueEntry.rawId);
                    if (error) throw error;
                  } else if (deleteRevenueEntry.source === 'payment') {
                    const { error } = await supabase.from('payments').delete().eq('id', deleteRevenueEntry.rawId);
                    if (error) throw error;
                  } else if (deleteRevenueEntry.source === 'lesson') {
                    const { error } = await supabase.from('lessons').update({ revenue: 0 }).eq('id', deleteRevenueEntry.rawId);
                    if (error) throw error;
                  }
                  toast({ title: 'Deleted', description: 'Payment entry removed.' });
                  refetchPayments();
                  queryClient.invalidateQueries({ queryKey: ['student-package-payments', studentId] });
                  queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                  queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
                  setDeleteRevenueEntry(null);
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setDeletingRevenue(false);
                }
              }}
            >
              {deletingRevenue ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unmerge Modal */}
      {student && (
        <UnmergeStudentModal
          open={unmergeOpen}
          onOpenChange={setUnmergeOpen}
          student={student}
          lessons={lessons}
          packages={studentPackages}
          payments={payments}
          videos={videos}
          media={studentMedia}
          drills={drills}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-packages', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-payments', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-videos', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-media', studentId] });
            queryClient.invalidateQueries({ queryKey: ['student-drills', studentId] });
            queryClient.invalidateQueries({ queryKey: ['admin-student-points', studentId] });
          }}
        />
      )}

      {/* Archive Student Confirmation */}
      <ArchiveStudentDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        studentId={studentId || ''}
        studentName={(student as any)?.full_name || ''}
        onConfirm={handleArchiveStudent}
      />

      {/* Permanent Delete Confirmation */}
      {deletePermanentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !deletingPermanent && setDeletePermanentOpen(false)}>
          <div className="bg-card border border-destructive/40 rounded-xl p-6 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Eliminar permanentemente</h3>
                <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              <strong className="text-foreground">{(student as any)?.full_name || 'Este estudiante'}</strong> y todos sus datos se borrarán definitivamente:
            </p>
            <ul className="text-sm text-muted-foreground mb-5 list-disc pl-5 space-y-0.5">
              <li>Lecciones, paquetes, pagos y suscripciones</li>
              <li>Videos, notas, media e historial</li>
              <li>Cuenta de acceso (email queda libre)</li>
            </ul>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeletePermanentOpen(false)} disabled={deletingPermanent}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1 gap-2" onClick={handleDeletePermanent} disabled={deletingPermanent}>
                {deletingPermanent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deletingPermanent ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {student && (
        <MergeFromProfileModal
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          currentStudent={{ id: student.id, full_name: student.full_name, email: student.email }}
        />
      )}

      {/* Award Points Modal */}
      {student && (
        <AwardPointsModal
          open={awardPointsOpen}
          onOpenChange={setAwardPointsOpen}
          studentId={student.id}
          studentName={student.full_name || student.email}
          onSaved={() => {
            refetchPoints();
            queryClient.invalidateQueries({ queryKey: ['admin-point-transactions', studentId] });
          }}
        />
      )}

      {/* Monthly Streak Lessons Modal */}
      {studentId && (
        <MonthlyStreakModal
          open={streakModal.open}
          onOpenChange={(o) => setStreakModal((s) => ({ ...s, open: o }))}
          userId={studentId}
          monthStart={streakModal.monthStart}
          lessonsThisMonth={streakModal.lessons}
        />
      )}

      {/* Package Lessons Modal — mounted at page level so it opens from any tab */}
      {studentId && (
        <PackageLessonsModal
          open={!!viewingPackageLessons}
          onOpenChange={(v) => { if (!v) setViewingPackageLessons(null); }}
          pkg={viewingPackageLessons}
          studentId={studentId}
          onChanged={() => {
            refetchPackages();
            queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
          }}
        />
      )}

      {/* Delete Package Confirmation */}
      <AlertDialog
        open={!!deletingPackageId}
        onOpenChange={(o) => { if (!o && !isDeletingPkg) { setDeletingPackageId(null); setPackageAttachments(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This will permanently remove the package row and its payment history.</p>
                {packageAttachments === null ? (
                  <p className="text-xs text-muted-foreground">Checking attached items…</p>
                ) : (
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                    <li>
                      <span className="text-foreground font-medium">{packageAttachments.lessons}</span> lesson(s) attached — will be detached (kept) but no longer linked to this package.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">{packageAttachments.payments}</span> payment record(s) — will be deleted.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">{packageAttachments.members}</span> shared member(s) — will be removed.
                    </li>
                  </ul>
                )}
                <p className="text-xs text-destructive">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPkg}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingPkg || packageAttachments === null}
              onClick={async (e) => {
                e.preventDefault();
                if (!deletingPackageId) return;
                setIsDeletingPkg(true);
                try {
                  await deletePackageCascade(deletingPackageId);
                  toast({ title: 'Package deleted' });
                  setDeletingPackageId(null);
                  setPackageAttachments(null);
                  refetchPackages();
                  queryClient.invalidateQueries({ queryKey: ['student-package-payments', studentId] });
                  queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
                  queryClient.invalidateQueries({ queryKey: ['revenue-class-packages'] });
                  queryClient.invalidateQueries({ queryKey: ['revenue-package-payments'] });
                  queryClient.invalidateQueries({ queryKey: ['revenue-lessons'] });
                  queryClient.invalidateQueries({ queryKey: ['bulk-packages-fix'] });
                } catch (err: any) {
                  toast({
                    title: 'Could not delete package',
                    description: err?.message || 'Unknown error',
                    variant: 'destructive',
                  });
                } finally {
                  setIsDeletingPkg(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingPkg ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Redemptions Panel ── */
function RedemptionsPanel({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);

  const { data: redemptions = [] } = useQuery({
    queryKey: ['admin-student-redemptions', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_redemptions')
        .select('id, reward_type, reward_id, cost, status, fulfillment_status, fulfilled_at, admin_notes, created_at')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return [];
      const rows = (data || []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.reward_id).filter(Boolean)));
      let map: Record<string, { name: string; fulfillment_type: string }> = {};
      if (ids.length) {
        const { data: rs } = await supabase.from('point_rewards').select('id, name, fulfillment_type').in('id', ids);
        (rs || []).forEach((r: any) => { map[r.id] = { name: r.name, fulfillment_type: r.fulfillment_type }; });
      }
      return rows.map((r) => ({ ...r, _reward: map[r.reward_id] || null }));
    },
    enabled: !!studentId,
  });

  const markFulfilled = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('point_redemptions')
      .update({ fulfillment_status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: user?.id })
      .eq('id', id);
    if (error) { toast({ title: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Marked as fulfilled' });
    queryClient.invalidateQueries({ queryKey: ['admin-student-redemptions', studentId] });
  };

  if (redemptions.length === 0) return null;
  const visible = showAll ? redemptions : redemptions.slice(0, 5);

  return (
    <Card className="mt-3">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" fill="currentColor" /> Reward redemptions
          </p>
          <span className="text-[11px] text-muted-foreground">{redemptions.length} total</span>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {visible.map((r: any) => {
            const name = r._reward?.name || r.reward_type;
            const isManual = (r._reward?.fulfillment_type || 'manual') !== 'video_analysis';
            const isPending = isManual && r.fulfillment_status === 'pending';
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs py-2 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{name}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {format(new Date(r.created_at), 'MMM d, yyyy · HH:mm')} · {r.cost} pts
                  </p>
                </div>
                {isPending ? (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => markFulfilled(r.id)}>Mark fulfilled</Button>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">
                    {r.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'completed'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {redemptions.length > 5 && (
          <Button variant="ghost" size="sm" className="mt-2 text-[11px]" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : `Show all (${redemptions.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
