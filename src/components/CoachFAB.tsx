import { useState, useRef, useEffect } from 'react';
import { Plus, X, Video, Package, Calendar, UserPlus, Upload, Loader2, Sparkles, CalendarIcon, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocation } from 'react-router-dom';
import { AddPackageModal } from '@/components/AddPackageModal';
import { AddLessonModal } from '@/components/AddLessonModal';
import { AddStudentModal } from '@/components/AddStudentModal';
import { AiInsightsModal } from '@/components/AiInsightsModal';
import { supabase } from '@/integrations/supabase/client';
import { sortByPickerOrder, isTodayInCancun, TODAY_LESSON_TEXT_CLASS } from '@/lib/cancunDate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { generateVideoThumbnail } from '@/lib/videoThumbnail';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { FamilyTargetSelect } from '@/components/family/FamilyTargetSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { lessonClassNumberLabel } from '@/lib/lessonClassNumber';

type CoachVideoType = 'lesson' | 'profile';

export function CoachFAB() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const authRoutes = ['/auth', '/auth/callback', '/auth/forgot', '/auth/reset'];
  const isAuthPage = authRoutes.some(r => location.pathname.startsWith(r));
  const isCoachRoute = location.pathname.startsWith('/admin');
  // Student preview lives under /admin/student-preview/* but is the STUDENT
  // portal rendered for the owner — the coach FAB must not appear there.
  const isStudentPreviewRoute = location.pathname.startsWith('/admin/student-preview');
  // Show the FAB for both the owner (role === 'admin') and non-owner coaches
  // (role === 'coach'). The student-scoped filters inside each modal already
  // restrict what a non-owner coach can act on.
  const isCoachUser = role === 'admin' || role === 'coach';

  if (!user || isAuthPage || !isCoachUser || !isCoachRoute || isStudentPreviewRoute) return null;

  const actions = [
    { icon: UserPlus, label: t('fab.addStudent'), color: '#f59e0b', onClick: () => { setMenuOpen(false); setStudentOpen(true); } },
    { icon: Video, label: t('fab.uploadVideo'), color: '#4a7c59', onClick: () => { setMenuOpen(false); setVideoOpen(true); } },
    { icon: Package, label: t('fab.addPackage'), color: '#E8D5B0', onClick: () => { setMenuOpen(false); setPackageOpen(true); } },
    { icon: Calendar, label: t('fab.addLesson'), color: '#60a5fa', onClick: () => { setMenuOpen(false); setLessonOpen(true); } },
    { icon: Sparkles, label: t('admin.aiInsights'), color: '#F0C040', onClick: () => { setMenuOpen(false); setAiOpen(true); } },
  ];

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMenuOpen(false)} />
      )}

      {menuOpen && (
        <div className="fixed z-50 flex flex-col gap-3 items-end" style={{ bottom: 90, right: 20 }}>
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
            >
              <span
                className="text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', color: '#F5F0E8' }}
              >
                {action.label}
              </span>
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: 'rgba(0,0,0,0.85)', border: `2px solid ${action.color}` }}
              >
                <action.icon className="h-5 w-5" style={{ color: action.color }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Botón + flotante — SOLO escritorio. En móvil el + vive dentro del
          menú inferior de Coach (CoachBottomNav) y este botón está oculto,
          para que no choque con la píldora. El menú y los modales de aquí
          solo se usan en escritorio. */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed z-50 hidden lg:flex items-center justify-center rounded-full transition-transform"
        style={{
          bottom: 20, right: 20, width: 56, height: 56,
          backgroundColor: '#4a7c59',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        {menuOpen ? <X className="h-6 w-6" style={{ color: '#F5F0E8' }} /> : <Plus className="h-6 w-6" style={{ color: '#F5F0E8' }} />}
      </button>

      {/* Coach Video Upload Sheet — Lesson Video or Profile Video only */}
      <CoachVideoUploadSheet open={videoOpen} onOpenChange={setVideoOpen} />
      <AddPackageModal open={packageOpen} onOpenChange={setPackageOpen} />
      <AddLessonModal open={lessonOpen} onOpenChange={setLessonOpen} />
      <AddStudentModal open={studentOpen} onOpenChange={setStudentOpen} />
      <AiInsightsModal open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}

export function CoachVideoUploadSheet({ open, onOpenChange, preselectedStudentId }: { open: boolean; onOpenChange: (v: boolean) => void; preselectedStudentId?: string }) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [videoType, setVideoType] = useState<CoachVideoType>('lesson');
  const [lessonId, setLessonId] = useState('');
  const [notes, setNotes] = useState('');
  const [videoDate, setVideoDate] = useState<Date | undefined>(undefined);
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId || '');
  // Destination of the upload: the student, or one of their linked family
  // members (managed child, partner…). Defaults to the student.
  const [targetStudentId, setTargetStudentId] = useState('');
  const uploadTargetId = targetStudentId || selectedStudentId;
  const uploadingForFamily = !!uploadTargetId && uploadTargetId !== selectedStudentId;
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && preselectedStudentId) setSelectedStudentId(preselectedStudentId);
  }, [open, preselectedStudentId]);

  // Picking another student resets the family destination.
  useEffect(() => {
    setTargetStudentId('');
  }, [selectedStudentId]);

  const { data: lessons = [] } = useQuery({
    queryKey: ['fab-lessons', selectedStudentId],
    queryFn: async () => {
      // 1) Lessons owned by the selected student.
      const { data: owned } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_type')
        .eq('student_id', selectedStudentId)
        .order('lesson_date', { ascending: false })

      // 2) Lessons attached to packages the student is a shared member of
      //    (e.g. Andrade / Benito on a shared "Obregón Hijos" package).
      const { data: memberRows } = await supabase
        .from('package_members')
        .select('package_id')
        .eq('student_id', selectedStudentId);
      const sharedPackageIds = (memberRows || [])
        .map((m: any) => m.package_id)
        .filter(Boolean);

      let shared: any[] = [];
      if (sharedPackageIds.length > 0) {
        // 2a) Lessons that have package_id set on the shared package.
        const { data: byPkg } = await supabase
          .from('lessons')
          .select('id, lesson_date, lesson_type')
          .in('package_id', sharedPackageIds)
          .neq('student_id', selectedStudentId)
          .order('lesson_date', { ascending: false })

        // 2b) Lessons under the package owner's student_id (covers lessons
        //     where package_id was never set on the lesson row).
        const { data: pkgs } = await supabase
          .from('class_packages')
          .select('user_id')
          .in('id', sharedPackageIds);
        const ownerIds = Array.from(
          new Set((pkgs || []).map((p: any) => p.user_id).filter(Boolean))
        ).filter((id) => id !== selectedStudentId);

        let byOwner: any[] = [];
        if (ownerIds.length > 0) {
          const { data } = await supabase
            .from('lessons')
            .select('id, lesson_date, lesson_type')
            .in('student_id', ownerIds)
            .order('lesson_date', { ascending: false })
          byOwner = data || [];
        }

        shared = [...(byPkg || []), ...byOwner];
      }

      const all = [...(owned || []), ...shared];
      const dedup = Array.from(new Map(all.map((l: any) => [l.id, l])).values());
      return sortByPickerOrder(dedup);
    },
    enabled: !!selectedStudentId && open && videoType === 'lesson',
  });

  const resetForm = () => {
    setFiles([]); setTitle(''); setVideoType('lesson'); setLessonId(''); setNotes(''); setVideoDate(undefined); setSelectedStudentId(preselectedStudentId || ''); setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (files.length === 0 || !user || !selectedStudentId) return;
    setUploading(true); setProgress(10);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pctBase = Math.round((i / files.length) * 100);
        const pctSlice = Math.round(100 / files.length);
        setProgress(pctBase + Math.round(pctSlice * 0.2));

        const fileExt = file.name.split('.').pop();
        const fileName = `${uploadTargetId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const isVideo = file.type.startsWith('video/');

        const { error: uploadError } = await supabase.storage.from('lesson-videos').upload(fileName, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;
        setProgress(pctBase + Math.round(pctSlice * 0.6));

        const { data: urlData } = supabase.storage.from('lesson-videos').getPublicUrl(fileName);
        let thumbnailUrl: string | null = null;
        if (isVideo) {
          try {
            const blob = await generateVideoThumbnail(file, 1.0);
            if (blob) {
              const tp = `${uploadTargetId}/thumbs/${Date.now()}-${Math.random().toString(36).slice(2)}-thumb.jpg`;
              const { error: te } = await supabase.storage.from('lesson-videos').upload(tp, blob, { contentType: 'image/jpeg' });
              if (!te) { const { data: tu } = supabase.storage.from('lesson-videos').getPublicUrl(tp); thumbnailUrl = tu.publicUrl; }
            }
          } catch {}
        }
        setProgress(pctBase + Math.round(pctSlice * 0.8));

        const fileTitle = title.trim()
          || (videoType === 'lesson' && !uploadingForFamily
            ? await lessonClassNumberLabel(lessonId, language)
            : null)
          || file.name.replace(/\.[^.]+$/, '');
        const noteText = notes.trim() || null;
        const { data: videoData, error: dbError } = await supabase.from('videos').insert({
          student_id: uploadTargetId,
          title: files.length === 1 ? fileTitle : `${fileTitle} (${i + 1})`,
          description: noteText,
          coach_feedback: noteText,
          feedback_added_at: noteText ? new Date().toISOString() : null,
          file_url: urlData.publicUrl,
          file_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
          category: videoType,
          // A family member's video is never tied to the student's own lesson.
          lesson_id: videoType === 'lesson' && !uploadingForFamily ? (lessonId || null) : null,
          video_date: videoDate ? format(videoDate, 'yyyy-MM-dd') : null,
          uploaded_by: user.id,
        }).select('id').single();
        if (dbError) throw dbError;

        // In-app notification for student (bell) — only on the last file to avoid spam
        if (i === files.length - 1) {
          try {
            await supabase.from('notifications').insert({
              user_id: uploadTargetId,
              title: '🎥 New video from your Coach',
              message: files.length === 1 ? `"${fileTitle}" is ready to view.` : `${files.length} new files are ready to view.`,
              link: '/videos',
              type: 'video_uploaded',
              metadata: { video_id: videoData?.id, student_id: uploadTargetId, uploaded_by: 'coach', video_title: fileTitle, category: videoType },
            });
          } catch (notifErr) {
            console.warn('Failed to create in-app notification:', notifErr);
          }

          // Notify student via email (non-blocking)
          try {
            const { data: studentProfile } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', uploadTargetId)
              .maybeSingle();
            if (studentProfile?.email) {
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  to: studentProfile.email,
                  studentName: studentProfile.full_name || 'there',
                  videoTitle: files.length === 1 ? fileTitle : `${files.length} new files`,
                  uploadedBy: 'coach',
                  notificationType: 'video_uploaded',
                },
              });
            }
          } catch (emailErr) {
            console.warn('Failed to send video upload email:', emailErr);
          }
        }
      }

      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      toast({ title: `${files.length} file${files.length !== 1 ? 's' : ''} uploaded successfully!` });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: t('admin.uploadFailed'), description: err.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const inputStyle = "bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold">{t('admin.uploadVideo')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Video Type — card-style selector matching Add Lesson */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.videoType')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'lesson' as CoachVideoType, icon: Video, label: t('admin.lessonVideo'), desc: t('admin.lessonVideoSubtitle') },
                { key: 'profile' as CoachVideoType, icon: User, label: t('admin.profileVideo'), desc: t('admin.profileVideoSubtitle') },
              ]).map((vt) => (
                <button
                  key={vt.key}
                  type="button"
                  onClick={() => { setVideoType(vt.key); if (vt.key === 'profile') setLessonId(''); if (vt.key === 'lesson') setVideoDate(undefined); }}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                  style={{
                    background: videoType === vt.key ? 'rgba(74,124,89,0.3)' : 'rgba(255,255,255,0.05)',
                    border: videoType === vt.key ? '2px solid #4a7c59' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <vt.icon className="h-5 w-5" style={{ color: videoType === vt.key ? '#4a7c59' : '#F5F0E8', opacity: videoType === vt.key ? 1 : 0.5 }} />
                  <span className="text-sm font-medium" style={{ color: '#F5F0E8' }}>{vt.label}</span>
                  <span className="text-[10px]" style={{ color: '#F5F0E8', opacity: 0.5 }}>{vt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Student Selector — searchable, consistent */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.student')} *</Label>
            <SearchableStudentSelect
              value={selectedStudentId}
              onValueChange={(id) => { setSelectedStudentId(id); setLessonId(''); }}
              variant="dark"
            />
          </div>

          {/* Family destination — only when the student has linked family */}
          {selectedStudentId && (
            <FamilyTargetSelect
              studentId={selectedStudentId}
              value={uploadTargetId}
              onChange={(id) => { setTargetStudentId(id); setLessonId(''); }}
            />
          )}

          {/* Lesson link — only for Lesson Video */}
          {videoType === 'lesson' && selectedStudentId && !uploadingForFamily && (
            <div className="space-y-1.5">
              <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.linkToLesson')}</Label>
              <Select value={lessonId} onValueChange={setLessonId}>
                <SelectTrigger className={inputStyle}>
                  <SelectValue placeholder={t('admin.selectLesson')} />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1f18] border-white/10">
                  {lessons.map((l: any) => (
                    <SelectItem key={l.id} value={l.id} className="text-[#F5F0E8]">
                      <span className={isTodayInCancun(l.lesson_date) ? TODAY_LESSON_TEXT_CLASS : undefined}>
                        {format(new Date(l.lesson_date + 'T12:00:00'), 'MMM dd, yyyy')} — {l.lesson_type}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* File */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.file')} *</Label>
            <div
              className="rounded-md px-3 py-2.5 flex items-center gap-3 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 text-[#F5F0E8]/50 shrink-0" />
              <span className={`text-sm truncate ${files.length > 0 ? 'text-[#F5F0E8]' : 'text-[#F5F0E8]/30'}`}>
                {files.length > 0
                  ? `${files.length} ${files.length === 1 ? t('admin.fileSelected') : t('admin.filesSelected')}`
                  : t('admin.selectVideosOrPhotos')}
              </span>
            </div>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,image/jpeg,image/png,image/heic,.mp4,.mov,.avi,.jpg,.jpeg,.png,.heic" multiple onChange={(e) => { const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/') || f.type.startsWith('image/')); if (selected.length > 0) setFiles(prev => [...prev, ...selected]); if (e.target) e.target.value = ''; }} className="hidden" />
          </div>

          {/* Selected files list */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/5 text-xs text-[#F5F0E8]/70">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-red-400 hover:text-red-300">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video Date (optional) — only for profile videos; lesson videos
              already inherit the lesson's date */}
          {videoType === 'profile' && (
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.videoDateOptional')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(
                  'w-full justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8] h-9',
                  !videoDate && 'text-[#F5F0E8]/40'
                )}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {videoDate ? format(videoDate, 'MMM dd, yyyy') : t('admin.pickDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
                <CalendarComponent
                  mode="single"
                  selected={videoDate}
                  onSelect={setVideoDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.title')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('admin.titlePlaceholder')} className={inputStyle} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[#F5F0E8]/70 text-sm">{t('admin.notesOptional')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('admin.notesPlaceholder')} className={inputStyle} />
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-white/10" />
              <p className="text-xs text-center text-[#E8D5B0]">{t('admin.uploadingPercent')} {progress}%</p>
            </div>
          )}

          {/* Save */}
          <Button
            onClick={handleUpload}
            disabled={uploading || files.length === 0 || !selectedStudentId}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading
              ? `${t('admin.uploadingPercent')} ${progress}%`
              : `${t('admin.uploadCta')}${files.length > 1 ? ` ${files.length}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
