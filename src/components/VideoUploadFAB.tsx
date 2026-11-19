import { useState, useRef, useEffect } from 'react';
import { Video, X, Upload, Loader2, Camera, DollarSign, BarChart3, Flag, Sparkles, Infinity as InfinityIcon } from 'lucide-react';
import { useAuth, hasVideosAccess, hasProZoneAccess } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sortByPickerOrder, isTodayInCancun, TODAY_LESSON_TEXT_CLASS } from '@/lib/cancunDate';
import { lessonClassNumberLabel } from '@/lib/lessonClassNumber';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { generateVideoThumbnail } from '@/lib/videoThumbnail';
import { LogRoundModal } from '@/components/LogRoundModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AiCoachChatModal } from '@/components/AiCoachChatModal';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type UploadMode = 'normal' | 'analysis' | 'analysis-credit-upload';
type LinkTo = 'lesson' | 'profile';

export function VideoUploadFAB() {
  const { user, profile, effectivePlan, graceUntil, trialEndsAt } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<UploadMode | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logRoundOpen, setLogRoundOpen] = useState(false);
  const [roundUpsellOpen, setRoundUpsellOpen] = useState(false);
  const [aiCoachOpen, setAiCoachOpen] = useState(false);

  // Normal upload state
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [linkTo, setLinkTo] = useState<LinkTo>('profile');
  const [lessonId, setLessonId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [analysisPaying, setAnalysisPaying] = useState(false);

  // Credit-aware analysis state
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisTitle, setAnalysisTitle] = useState('');
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [analysisUploading, setAnalysisUploading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const analysisFileInputRef = useRef<HTMLInputElement>(null);

  // Listen for global event to open analysis flow from anywhere (e.g. dashboard card)
  useEffect(() => {
    const openAnalysis = () => {
      setMenuOpen(false);
      setMode('analysis');
      setSheetOpen(true);
    };
    const openNormal = () => {
      setMenuOpen(false);
      setMode('normal');
      setSheetOpen(true);
    };
    window.addEventListener('open-video-analysis', openAnalysis);
    window.addEventListener('open-video-upload', openNormal);
    return () => {
      window.removeEventListener('open-video-analysis', openAnalysis);
      window.removeEventListener('open-video-upload', openNormal);
    };
  }, []);

  const authRoutes = ['/auth', '/auth/callback', '/auth/forgot', '/auth/reset'];
  const isAuthPage = authRoutes.some(r => location.pathname.startsWith(r));
  const isCoachRoute = location.pathname.startsWith('/admin');
  const hiddenRoutes = ['/plans', '/videos/upload'];
  const isHiddenStudentRoute = hiddenRoutes.includes(location.pathname);

  // Free / Member tier cannot upload videos — they see a teaser on /videos instead.
  const canAccessVideos = hasVideosAccess(
    effectivePlan,
    graceUntil,
    trialEndsAt,
  );

  const { data: lessons = [] } = useQuery({
    queryKey: ['fab-lessons', profile?.id],
    queryFn: async () => {
      // 1) Lessons owned by the student.
      const { data: owned } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_type')
        .eq('student_id', profile!.id)
        .order('lesson_date', { ascending: false })

      // 2) Lessons attached to packages the student is a shared member of
      //    (e.g. Andrade / Benito on an "Obregón Hijos" package).
      const { data: memberRows } = await supabase
        .from('package_members')
        .select('package_id')
        .eq('student_id', profile!.id);
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
          .neq('student_id', profile!.id)
          .order('lesson_date', { ascending: false })

        // 2b) Lessons under the package owner's student_id (covers lessons
        //     where package_id was never set).
        const { data: pkgs } = await supabase
          .from('class_packages')
          .select('user_id')
          .in('id', sharedPackageIds);
        const ownerIds = Array.from(
          new Set((pkgs || []).map((p: any) => p.user_id).filter(Boolean))
        ).filter((id) => id !== profile!.id);

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
    enabled: !!profile?.id && sheetOpen && mode === 'normal',
  });

  // ── Profile-video monthly upload limit (configured by Coach in Settings) ──
  const { data: videoLimits } = useQuery({
    queryKey: ['video-upload-limits'],
    queryFn: async () => {
      const { data } = await supabase
        .from('academy_settings')
        .select('value')
        .eq('key', 'video_upload_limits')
        .maybeSingle();
      return (data?.value as { free?: number | null; member?: number | null; scratch?: number | null; pro?: number | null; apex?: number | null } | null) ?? null;
    },
    enabled: !!profile?.id && sheetOpen && mode === 'normal',
    staleTime: 60_000,
  });

  // Resolve current user's monthly cap. `null` means unlimited; `0` for plans
  // that aren't on the limits map (e.g. Member/Free) — they can't reach this
  // sheet anyway because of `canAccessVideos`, but we keep the guard tight.
  // Upload limits by plan removed: unlimited for everyone with video access.
  void videoLimits;
  const planLimit: number | null = null;

  const startOfMonthISO = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  })();

  // Count this month's profile-category videos for the student.
  const { data: monthlyProfileCount = 0 } = useQuery({
    queryKey: ['profile-video-count-month', profile?.id, startOfMonthISO],
    queryFn: async () => {
      const { count } = await supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', profile!.id)
        .eq('category', 'profile')
        .gte('created_at', startOfMonthISO);
      return count ?? 0;
    },
    enabled: !!profile?.id && sheetOpen && mode === 'normal',
    staleTime: 30_000,
  });

  const profileQuotaReached =
    linkTo === 'profile' && planLimit !== null && monthlyProfileCount >= planLimit;

  // Detect unused free Video Analysis credits (redeemed with SC Points)
  const { data: analysisCredits = [] } = useQuery({
    queryKey: ['analysis-credits', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_requests')
        .select('id, created_at')
        .eq('student_id', profile!.id)
        .eq('payment_status', 'comped')
        .is('video_id', null)
        .eq('delivery_status', 'pending')
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!profile?.id && sheetOpen && (mode === 'analysis' || mode === 'analysis-credit-upload'),
  });
  const hasCredit = analysisCredits.length > 0;

  // Points balance — for in-sheet redemption shortcut
  const { data: pointsRow } = useQuery({
    queryKey: ['student-points-fab', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('student_points')
        .select('total_points')
        .eq('user_id', profile!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.id && sheetOpen && mode === 'analysis',
  });
  const pointsBalance = pointsRow?.total_points ?? 0;
  const canRedeemNow = !hasCredit && pointsBalance >= 200;
  const [redeeming, setRedeeming] = useState(false);

  const handleRedeemNow = async () => {
    if (redeeming) return;
    setRedeeming(true);
    try {
      const { error } = await supabase.functions.invoke('redeem-reward', {
        body: { reward_type: 'video_analysis' },
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis-credits', profile?.id] }),
        queryClient.invalidateQueries({ queryKey: ['student-points-fab', profile?.id] }),
        queryClient.invalidateQueries({ queryKey: ['student-points', profile?.id] }),
      ]);
      toast({
        title: 'Free credit unlocked',
        description: 'Upload your swing — no payment needed.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not redeem',
        description: err.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setRedeeming(false);
    }
  };

  const resetForm = () => {
    setFiles([]);
    setTitle('');
    setLinkTo('profile');
    setLessonId('');
    setNotes('');
    setProgress(0);
    setMode(null);
    setAnalysisFile(null);
    setAnalysisTitle('');
    setAnalysisNotes('');
    setAnalysisProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (analysisFileInputRef.current) analysisFileInputRef.current.value = '';
  };

  const handleClose = () => {
    setSheetOpen(false);
    resetForm();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(
      (f) => f.type.startsWith('video/') || f.type.startsWith('image/')
    );
    if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
    if (e.target) e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const isFormValid = files.length > 0 && (linkTo === 'profile' || (linkTo === 'lesson' && lessonId));

  const handleUpload = async () => {
    if (files.length === 0 || !user || !profile?.id) return;
    if (linkTo === 'lesson' && !lessonId) {
      toast({ title: 'Please select a lesson', variant: 'destructive' });
      return;
    }

    // Enforce monthly profile-upload cap for paid tiers (admin-configurable).
    if (linkTo === 'profile' && planLimit !== null && monthlyProfileCount + files.length > planLimit) {
      toast({
        title: 'Monthly upload limit reached',
        description: `You've used ${monthlyProfileCount}/${planLimit} profile videos this month. You're trying to upload ${files.length}.`,
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pctBase = Math.round((i / files.length) * 100);
        const pctSlice = Math.round(100 / files.length);
        setProgress(pctBase + Math.round(pctSlice * 0.2));

        const fileExt = file.name.split('.').pop();
        const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const isVideo = file.type.startsWith('video/');

        const { error: uploadError } = await supabase.storage
          .from('lesson-videos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          });

        if (uploadError) throw uploadError;

        setProgress(pctBase + Math.round(pctSlice * 0.6));

        const { data: urlData } = supabase.storage
          .from('lesson-videos')
          .getPublicUrl(fileName);

        let thumbnailUrl: string | null = null;
        if (isVideo) {
          try {
            const thumbnailBlob = await generateVideoThumbnail(file, 1.0);
            if (thumbnailBlob) {
              const thumbPath = `${profile.id}/thumbs/${Date.now()}-${Math.random().toString(36).slice(2)}-thumb.jpg`;
              const { error: thumbErr } = await supabase.storage
                .from('lesson-videos')
                .upload(thumbPath, thumbnailBlob, { contentType: 'image/jpeg' });
              if (!thumbErr) {
                const { data: thumbUrl } = supabase.storage
                  .from('lesson-videos')
                  .getPublicUrl(thumbPath);
                thumbnailUrl = thumbUrl.publicUrl;
              }
            }
          } catch { /* continue without thumbnail */ }
        }

        setProgress(pctBase + Math.round(pctSlice * 0.8));

        const fileTitle = title.trim()
          || (linkTo === 'lesson' && lessonId ? await lessonClassNumberLabel(lessonId, language) : null)
          || file.name.replace(/\.[^.]+$/, '');

        const { error: dbError } = await supabase.from('videos').insert({
          student_id: profile.id,
          title: files.length === 1 ? fileTitle : `${fileTitle} (${i + 1})`,
          description: notes.trim() || null,
          file_url: urlData.publicUrl,
          file_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
          category: linkTo === 'lesson' ? 'lesson' : 'profile',
          lesson_id: lessonId || null,
          uploaded_by: user.id,
        });

        if (dbError) throw dbError;
      }

      setProgress(100);

      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      queryClient.invalidateQueries({ queryKey: ['profile-video-count-month', profile?.id] });

      toast({ title: `${files.length} file${files.length !== 1 ? 's' : ''} uploaded successfully!` });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleAnalysisCheckout = async () => {
    if (!user || !profile?.id) return;
    setAnalysisPaying(true);
    try {
      // Create analysis request record first
      const { data: analysisReq, error: arError } = await supabase
        .from('analysis_requests')
        .insert({ student_id: profile.id, payment_status: 'pending', amount: 550 })
        .select('id')
        .single();

      if (arError) throw arError;

      // Start Stripe checkout
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          priceId: 'price_1TKlAhRw8gEMe8Y791V28Dm4',
          mode: 'payment',
          metadata: { analysis_request_id: analysisReq.id },
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: 'Payment error', description: err.message, variant: 'destructive' });
    } finally {
      setAnalysisPaying(false);
    }
  };

  // Upload using a free credit (no Stripe checkout)
  const handleAnalysisCreditUpload = async () => {
    if (!analysisFile || !user || !profile?.id || !hasCredit) return;
    if (!analysisTitle.trim()) {
      toast({ title: 'Please add a title', variant: 'destructive' });
      return;
    }
    const creditId = analysisCredits[0].id;
    setAnalysisUploading(true);
    setAnalysisProgress(10);
    try {
      const fileExt = analysisFile.name.split('.').pop();
      const fileName = `${profile.id}/${Date.now()}.${fileExt}`;
      const isVideo = analysisFile.type.startsWith('video/');

      setAnalysisProgress(20);
      const { error: uploadError } = await supabase.storage
        .from('lesson-videos')
        .upload(fileName, analysisFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: analysisFile.type || 'application/octet-stream',
        });
      if (uploadError) throw uploadError;

      setAnalysisProgress(60);
      const { data: urlData } = supabase.storage.from('lesson-videos').getPublicUrl(fileName);

      let thumbnailUrl: string | null = null;
      if (isVideo) {
        try {
          const thumbnailBlob = await generateVideoThumbnail(analysisFile, 1.0);
          if (thumbnailBlob) {
            const thumbPath = `${profile.id}/thumbs/${Date.now()}-thumb.jpg`;
            const { error: thumbErr } = await supabase.storage
              .from('lesson-videos')
              .upload(thumbPath, thumbnailBlob, { contentType: 'image/jpeg' });
            if (!thumbErr) {
              const { data: thumbUrl } = supabase.storage.from('lesson-videos').getPublicUrl(thumbPath);
              thumbnailUrl = thumbUrl.publicUrl;
            }
          }
        } catch { /* continue */ }
      }

      setAnalysisProgress(80);
      const { data: videoRow, error: dbError } = await supabase
        .from('videos')
        .insert({
          student_id: profile.id,
          title: analysisTitle.trim(),
          description: analysisNotes.trim() || null,
          file_url: urlData.publicUrl,
          file_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
          category: 'analysis',
          uploaded_by: user.id,
        })
        .select('id')
        .single();
      if (dbError) throw dbError;

      // Link the new video to the comped analysis request
      const { error: linkError } = await supabase
        .from('analysis_requests')
        .update({ video_id: videoRow.id, delivery_status: 'in_review' })
        .eq('id', creditId);
      if (linkError) throw linkError;

      // Notify all admins (coaches) — non-blocking
      try {
        const studentName = profile.full_name || profile.email || 'A student';
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');
        if (admins && admins.length > 0) {
          const rows = admins.map((a: any) => ({
            user_id: a.user_id,
            type: 'analysis_request',
            title: '🎬 New swing analysis submitted',
            message: `${studentName} submitted a video for analysis (redeemed credit). Awaiting your review.`,
            link: `/admin/analysis-requests`,
            metadata: { student_id: profile.id, video_id: videoRow.id, source: 'credit_redemption' },
          }));
          await supabase.from('notifications').insert(rows);
        }
      } catch (notifErr) {
        console.warn('Failed to create admin notifications', notifErr);
      }

      // (a) Email the student — confirmation that their video was submitted
      try {
        if (profile.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: profile.email,
              studentName: profile.full_name || 'there',
              videoTitle: analysisTitle.trim(),
              notificationType: 'analysis_submitted',
            },
          });
        }
      } catch (emailErr) {
        console.warn('Student analysis-submitted email failed:', emailErr);
      }

      // (b) Email admin@margeagolfacademy.com — single canonical "video uploaded for analysis"
      try {
        await supabase.functions.invoke('notify-admin', {
          body: {
            eventType: 'video_uploaded_for_analysis',
            studentName: profile.full_name || profile.email || 'A student',
            studentEmail: profile.email,
            notes: analysisTitle.trim()
              ? `Video title: ${analysisTitle.trim()}${analysisNotes.trim() ? ` · ${analysisNotes.trim()}` : ''}`
              : undefined,
          },
        });
      } catch (adminNotifyError) {
        console.warn('Admin notify (video upload for analysis) failed:', adminNotifyError);
      }

      setAnalysisProgress(100);
      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-credits'] });

      toast({
        title: 'Video submitted for analysis!',
        description: 'Your coach will review it within 1 business day.',
      });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setAnalysisUploading(false);
    }
  };

  if (!user || isAuthPage || isCoachRoute || isHiddenStudentRoute) return null;

  // Video Analysis is paid per use and available to every plan.
  // Profile Video upload is now available to every member.
  const canLogRound = hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);

  const handleLogRoundClick = () => {
    setMenuOpen(false);
    if (canLogRound) {
      setLogRoundOpen(true);
    } else {
      setRoundUpsellOpen(true);
    }
  };

  return (
    <>
      {/*
        Visible green upload FAB + its radial menu were removed — the new
        Oura-style <StudentBottomNav /> owns all global quick actions now.
        We keep this component mounted because it still hosts the upload
        sheets that listen to global `open-video-upload` and
        `open-video-analysis` events fired from elsewhere (dashboard,
        Swing Analysis tile, redeem flow, etc.).
      */}

      {/* ───── Profile Video Upload Sheet ───── */}
      <Sheet open={sheetOpen && mode === 'normal'} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent
          side="bottom"
          className="border-t-0 rounded-t-2xl p-0"
          style={{
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            maxHeight: '85vh',
          }}
        >
          <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: '85vh' }}>
            <SheetHeader>
              <SheetTitle className="text-center" style={{ color: '#F5F0E8', fontSize: '18px', fontWeight: 600 }}>
                Profile Video
              </SheetTitle>
            </SheetHeader>

            {/* Link to */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                Link this video to <span style={{ color: '#f59e0b' }}>*</span>
              </label>
              <div className="flex gap-3">
                {(['profile', 'lesson'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setLinkTo(t); if (t === 'profile') setLessonId(''); }}
                    className="flex-1 py-2.5 rounded-full text-sm font-medium transition-all"
                    style={{
                      background: linkTo === t ? '#4a7c59' : 'transparent',
                      border: linkTo === t ? '1px solid #4a7c59' : '1px solid rgba(255,255,255,0.2)',
                      color: '#F5F0E8',
                    }}
                  >
                    {t === 'profile' ? '👤 My Profile' : '📅 A Lesson'}
                  </button>
                ))}
              </div>
              {/* Quota line for profile uploads */}
              {linkTo === 'profile' && (
                <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: profileQuotaReached ? '#f59e0b' : '#E8D5B0', opacity: profileQuotaReached ? 1 : 0.6 }}>
                  {planLimit === null ? (
                    <>
                      <InfinityIcon className="h-3 w-3" /> Unlimited profile uploads on your plan.
                    </>
                  ) : (
                    <>
                      {monthlyProfileCount} of {planLimit} profile videos used this month
                      {profileQuotaReached && ' — upgrade for more.'}
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Lesson selector */}
            {linkTo === 'lesson' && (
              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                  Select Lesson <span style={{ color: '#f59e0b' }}>*</span>
                </label>
                <select
                  value={lessonId}
                  onChange={(e) => setLessonId(e.target.value)}
                  className={`w-full rounded-lg px-3 py-3 text-sm ${lessons.some((l: any) => l.id === lessonId && isTodayInCancun(l.lesson_date)) ? TODAY_LESSON_TEXT_CLASS : ''}`}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: `1px solid ${!lessonId ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)'}`,
                    color: '#F5F0E8',
                  }}
                >
                  <option value="">Choose a lesson…</option>
                  {lessons.map((l: any) => (
                    <option key={l.id} value={l.id} className={isTodayInCancun(l.lesson_date) ? `${TODAY_LESSON_TEXT_CLASS} checked:!text-accent-foreground checked:bg-accent` : 'text-foreground'} style={{ background: '#1a1a1a' }}>
                      {format(new Date(l.lesson_date + 'T12:00:00'), 'MMM dd, yyyy')} — {l.lesson_type}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* File Picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                Videos or Photos <span style={{ color: '#f59e0b' }}>*</span>
              </label>
              <div
                className="rounded-lg px-3 py-4 flex flex-col items-center gap-2 cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                <span className="text-sm" style={{ color: 'rgba(245,240,232,0.5)' }}>
                  Tap to select videos or photos
                </span>
                <span className="text-[11px]" style={{ color: 'rgba(245,240,232,0.3)' }}>You can select multiple files</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,image/jpeg,image/png,image/heic,image/heif,.mp4,.mov,.avi,.jpg,.jpeg,.png,.heic"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              {files.length > 0 && (
                <div className="space-y-1.5 w-full">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {f.type.startsWith('video/') ? (
                        <Video className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                      ) : (
                        <Camera className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                      )}
                      <span className="text-xs truncate flex-1" style={{ color: '#F5F0E8' }}>{f.name}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#F5F0E8', opacity: 0.4 }}>
                        {(f.size / (1024 * 1024)).toFixed(1)}MB
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="flex-shrink-0 p-0.5 rounded-full hover:bg-white/10"
                      >
                        <X className="h-3.5 w-3.5" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                Title <span className="font-normal" style={{ color: '#F5F0E8', opacity: 0.4 }}>(optional)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={files.length > 1 ? 'Shared title for all files (optional)' : 'e.g. Driver swing — front view (optional)'}
                className="w-full rounded-lg px-3 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F5F0E8' }}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a description..."
                rows={2}
                className="w-full rounded-lg px-3 py-3 text-sm outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F5F0E8' }}
              />
            </div>

            {/* Progress */}
            {uploading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2 bg-white/10" />
                <p className="text-xs text-center" style={{ color: '#E8D5B0' }}>Uploading… {progress}%</p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button onClick={handleClose} disabled={uploading} className="w-full text-sm py-2" style={{ color: '#F5F0E8', opacity: 0.5 }}>Cancel</button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isFormValid || profileQuotaReached}
                className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: '#4a7c59', color: '#F5F0E8' }}
              >
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading… {progress}%</> : <><Upload className="h-4 w-4" /> Upload{files.length > 1 ? ` ${files.length} files` : ''}</>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ───── Video for Analysis Sheet ───── */}
      <Sheet open={sheetOpen && (mode === 'analysis' || mode === 'analysis-credit-upload')} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent
          side="bottom"
          className="border-t-0 rounded-t-2xl p-0"
          style={{
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            maxHeight: '85vh',
          }}
        >
          <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: '85vh' }}>
            <SheetHeader>
              <SheetTitle className="text-center" style={{ color: '#F5F0E8', fontSize: '18px', fontWeight: 600 }}>
                {mode === 'analysis-credit-upload' ? 'Upload Analysis Video' : 'Video for Analysis'}
              </SheetTitle>
            </SheetHeader>

            {/* Free credit banner */}
            {hasCredit && mode === 'analysis' && (
              <div
                className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(74,124,89,0.15)', border: '1px solid rgba(74,124,89,0.45)' }}
              >
                <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(74,124,89,0.25)' }}>
                  <span className="text-base">🎁</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>
                    You have {analysisCredits.length} free Video Analysis credit{analysisCredits.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#F5F0E8', opacity: 0.65 }}>
                    Redeemed with SC Points — no payment needed.
                  </p>
                </div>
              </div>
            )}

            {/* Credit upload form */}
            {mode === 'analysis-credit-upload' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                    Video <span style={{ color: '#f59e0b' }}>*</span>
                  </label>
                  <div
                    className="rounded-lg px-3 py-3 flex items-center gap-3 cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                    onClick={() => analysisFileInputRef.current?.click()}
                  >
                    {analysisFile?.type.startsWith('video/') ? (
                      <Video className="h-4 w-4 flex-shrink-0" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                    ) : (
                      <Upload className="h-4 w-4 flex-shrink-0" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                    )}
                    <span className="text-sm truncate" style={{ color: analysisFile ? '#F5F0E8' : 'rgba(245,240,232,0.4)' }}>
                      {analysisFile ? analysisFile.name : 'Tap to select your swing video'}
                    </span>
                    {analysisFile && (
                      <button onClick={(e) => { e.stopPropagation(); setAnalysisFile(null); if (analysisFileInputRef.current) analysisFileInputRef.current.value = ''; }} className="ml-auto flex-shrink-0">
                        <X className="h-4 w-4" style={{ color: '#F5F0E8', opacity: 0.5 }} />
                      </button>
                    )}
                  </div>
                  <input
                    ref={analysisFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setAnalysisFile(f); }}
                    className="hidden"
                  />
                  {analysisFile && (
                    <p className="text-xs" style={{ color: '#F5F0E8', opacity: 0.4 }}>
                      🎬 Video · {(analysisFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                    Title <span style={{ color: '#f59e0b' }}>*</span>
                  </label>
                  <input
                    value={analysisTitle}
                    onChange={(e) => setAnalysisTitle(e.target.value)}
                    placeholder="e.g. Driver swing — front view"
                    className="w-full rounded-lg px-3 py-3 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F5F0E8' }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: '#F5F0E8', opacity: 0.7 }}>Notes for your Coach</label>
                  <textarea
                    value={analysisNotes}
                    onChange={(e) => setAnalysisNotes(e.target.value)}
                    placeholder="What would you like feedback on?"
                    rows={3}
                    className="w-full rounded-lg px-3 py-3 text-sm outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#F5F0E8' }}
                  />
                </div>

                {analysisUploading && (
                  <div className="space-y-2">
                    <Progress value={analysisProgress} className="h-2 bg-white/10" />
                    <p className="text-xs text-center" style={{ color: '#E8D5B0' }}>Uploading… {analysisProgress}%</p>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <button onClick={handleClose} disabled={analysisUploading} className="w-full text-sm py-2" style={{ color: '#F5F0E8', opacity: 0.5 }}>Cancel</button>
                  <button
                    onClick={handleAnalysisCreditUpload}
                    disabled={analysisUploading || !analysisFile || !analysisTitle.trim()}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                    style={{ backgroundColor: '#4a7c59', color: '#F5F0E8' }}
                  >
                    {analysisUploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                    ) : (
                      <><Upload className="h-4 w-4" /> Upload & Use Free Credit</>
                    )}
                  </button>
                </div>
              </>
            )}

            {mode === 'analysis' && (
            <>
            {/* Info card */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <BarChart3 className="h-5 w-5" style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#F5F0E8' }}>Professional Swing Analysis</p>
                  <p className="text-xs" style={{ color: '#F5F0E8', opacity: 0.6 }}>Get detailed coach feedback on your swing</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" style={{ color: '#f59e0b' }} />
                  <span className="text-lg font-bold" style={{ color: '#f59e0b' }}>$550 MXN</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(74,124,89,0.2)', border: '1px solid rgba(74,124,89,0.3)' }}>
                  <span className="text-xs font-medium" style={{ color: '#4a7c59' }}>⏱ 1 business day delivery</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs" style={{ color: '#F5F0E8', opacity: 0.5 }}>What's included:</p>
                <ul className="space-y-1.5">
                  {[
                    'Detailed swing breakdown by your Coach',
                    'Key areas for improvement identified',
                    'Personalized drill recommendations',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#F5F0E8', opacity: 0.7 }}>
                      <span style={{ color: '#4a7c59' }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: '#F5F0E8', opacity: 0.4 }}>
              {hasCredit ? "Use your free credit to skip payment." : "After payment, you'll be prompted to upload your video."}
            </p>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button onClick={handleClose} className="w-full text-sm py-2" style={{ color: '#F5F0E8', opacity: 0.5 }}>Cancel</button>
              {hasCredit ? (
                <button
                  onClick={() => setMode('analysis-credit-upload')}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
                  style={{ backgroundColor: '#4a7c59', color: '#F5F0E8' }}
                >
                  <Upload className="h-4 w-4" /> Upload Video & Use Free Credit
                </button>
              ) : (
              <button
                onClick={handleAnalysisCheckout}
                disabled={analysisPaying}
                className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}
              >
                {analysisPaying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <><DollarSign className="h-4 w-4" /> Pay $550 MXN & Submit Video</>
                )}
              </button>
              )}
              {canRedeemNow && (
                <button
                  onClick={handleRedeemNow}
                  disabled={redeeming}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                  style={{
                    background: 'rgba(240,192,64,0.14)',
                    border: '1px solid rgba(240,192,64,0.4)',
                    color: '#F0C040',
                  }}
                >
                  {redeeming ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Redeeming…</>
                  ) : (
                    <>Use 200 SC Points instead</>
                  )}
                </button>
              )}
            </div>
            </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Log a Round modal — Pro Zone members */}
      {canLogRound && profile?.id && (
        <LogRoundModal
          open={logRoundOpen}
          onOpenChange={setLogRoundOpen}
          studentId={profile.id}
        />
      )}

      {/* Upsell dialog for non–Pro Zone members */}
      <Dialog open={roundUpsellOpen} onOpenChange={setRoundUpsellOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-sm p-6 glass-card">
          <DialogHeader className="space-y-3">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(240,192,64,0.15)' }}
            >
              <Flag className="h-6 w-6 text-gold-accent" />
            </div>
            <DialogTitle className="text-ivory font-heading text-center">
              Track your rounds with a Pro Zone membership
            </DialogTitle>
            <DialogDescription className="text-ivory/60 text-center text-sm">
              Log every round in 30 seconds — score, GIR, FIR, putts, and trends. Your coach sees
              the same data to help you improve faster.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setRoundUpsellOpen(false)}
              className="flex-1 bg-white/5 border-white/10 text-ivory hover:bg-white/10"
            >
              Not now
            </Button>
            <Button
              onClick={() => {
                setRoundUpsellOpen(false);
                navigate('/plans');
              }}
              className="flex-1 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
            >
              <Sparkles className="h-4 w-4" /> See plans
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Margea AI chat modal */}
      <AiCoachChatModal open={aiCoachOpen} onOpenChange={setAiCoachOpen} />
    </>
  );
}
