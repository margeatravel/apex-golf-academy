import { useState, useEffect } from 'react';
import { useAuth, hasVideosAccess, isInTrial } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Video, Upload, Play, BarChart3, GraduationCap, CheckCircle, AlertCircle, Download, GitCompare, Lock, Sparkles, Check, Clock } from 'lucide-react';
import { downloadVideo } from '@/lib/downloadVideo';
import { isDirectVideoFile } from '@/lib/proZoneCategories';
import { useNavigate } from 'react-router-dom';
import { InternalHeader } from '@/components/InternalHeader';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { SocialFooter } from '@/components/SocialFooter';
import { VideoCardMenu } from '@/components/VideoCardMenu';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { useSignedMediaUrl as useSignedLessonVideoUrl } from '@/hooks/useSignedMediaUrl';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import { usePlanColors, resolvePlanColor } from '@/hooks/usePlanColors';

async function fetchStudentLessonIds(studentId: string | undefined): Promise<string[]> {
  if (!studentId) return [];
  const { data } = await supabase
    .from('lessons')
    .select('id')
    .eq('student_id', studentId);
  return (data || []).map((l) => l.id);
}

/**
 * Only the student's own videos. Videos attached to one of their lessons but
 * owned by somebody else (shared/group lessons) belong to that other person
 * and must never appear in this gallery.
 */
function buildStudentVideoOr(studentId: string, _lessonIds: string[]): string {
  return `student_id.eq.${studentId}`;
}

interface VideoWithLesson {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  category: string | null;
  tags: string[] | null;
  upload_date: string;
  lesson_id: string | null;
  student_id: string;
  thumbnail_url: string | null;
  coach_feedback?: string | null;
  next_steps?: string | null;
  feedback_added_at?: string | null;
  lessons?: {
    lesson_date: string;
    lesson_type: string;
  } | null;
}

interface LockedVideoInventory {
  videoCount: number;
  analysisCount: number;
  recentItems: VideoWithLesson[];
}

function LockedVideoCard({
  video,
  locale,
  fallbackTitle,
  membersOnly,
}: {
  video: VideoWithLesson | null;
  locale: string;
  fallbackTitle: string;
  membersOnly: string;
}) {
  const signedThumbnail = useSignedLessonVideoUrl(video?.thumbnail_url);
  const date = video?.upload_date
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(video.upload_date))
    : null;

  return (
    <div className="glass-card overflow-hidden opacity-75">
      <div className="aspect-[16/10] bg-black/30 flex items-center justify-center relative overflow-hidden">
        {signedThumbnail ? (
          <img
            src={signedThumbnail}
            alt=""
            className="h-full w-full object-cover blur-[2px] scale-[1.02]"
          />
        ) : (
          <Video className="h-16 w-16 text-ivory/20" />
        )}
      </div>
      <div className="p-4 space-y-1.5">
        <h3 className="font-heading font-semibold text-ivory truncate">
          {video?.title || fallbackTitle}
        </h3>
        {date && <p className="text-xs text-ivory/65">{date}</p>}
        <p className="text-sm text-ivory/60">{membersOnly}</p>
      </div>
    </div>
  );
}

async function fetchLockedVideoInventory(studentId: string): Promise<LockedVideoInventory> {
  const lessonIds = await fetchStudentLessonIds(studentId);
  const orFilter = buildStudentVideoOr(studentId, lessonIds);
  const [{ data: videos }, { data: media }] = await Promise.all([
    supabase
      .from('videos')
      .select('id, title, description, file_url, file_type, category, tags, upload_date, video_date, lesson_id, student_id, thumbnail_url, coach_feedback, next_steps, feedback_added_at, lessons(lesson_date, lesson_type)')
      .or(orFilter)
      .order('upload_date', { ascending: false }),
    supabase
      .from('student_media' as any)
      .select('id, title, file_url, file_type, thumbnail_url, uploaded_at, lesson_id, student_id, lessons(lesson_date, lesson_type)')
      .eq('student_id', studentId)
      .order('uploaded_at', { ascending: false }),
  ]);

  const videoRows = ((videos || []) as any[]).map((video) => ({
    ...video,
    upload_date: video.video_date
      ? `${video.video_date}T12:00:00`
      : video.upload_date,
  })) as VideoWithLesson[];
  const mediaRows = ((media || []) as any[]).map((item) => ({
    id: item.id,
    title: item.title || 'Media',
    description: null,
    file_url: item.file_url,
    file_type: item.file_type || 'image',
    category: 'lesson',
    tags: null,
    upload_date: item.lessons?.lesson_date
      ? `${item.lessons.lesson_date}T12:00:00`
      : item.uploaded_at,
    lesson_id: item.lesson_id,
    student_id: item.student_id,
    thumbnail_url: item.thumbnail_url || null,
    coach_feedback: null,
    next_steps: null,
    feedback_added_at: null,
    lessons: item.lessons || null,
  })) as VideoWithLesson[];

  const lessonVideos = videoRows.filter((video) => video.category !== 'analysis');
  return {
    videoCount: lessonVideos.length + mediaRows.length,
    analysisCount: videoRows.filter((video) => video.category === 'analysis').length,
    recentItems: [...videoRows, ...mediaRows]
      .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())
      .slice(0, 3),
  };
}

export default function StudentVideos() {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const { profile, session, effectivePlan, graceUntil, trialEndsAt } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canAccessVideos = hasVideosAccess(
    effectivePlan,
    graceUntil,
    trialEndsAt,
  );
  const planColors = usePlanColors();
  const planAccentColor = resolvePlanColor(planColors, effectivePlan);
  const inTrial = isInTrial(trialEndsAt);

  const { data: lockedInventory } = useQuery({
    queryKey: ['student-locked-video-inventory', profile?.id],
    queryFn: () => fetchLockedVideoInventory(profile?.id || ''),
    enabled: !!profile?.id && !canAccessVideos,
  });

  const hasLockedVideos = !!lockedInventory && lockedInventory.videoCount > 0;
  const showVideosWaitingTitle = !inTrial && trialEndsAt && hasLockedVideos;
  const waitingTitleParts = showVideosWaitingTitle
    ? t('media.videosWaitingTitle').split('{n}')
    : [];

  const isOwnStudentPortal = session?.user.id === profile?.id;
  const inventoryLine = lockedInventory && lockedInventory.videoCount > 0
    ? (isOwnStudentPortal
      ? t('media.lockedInventoryOwn')
      : t('media.lockedInventoryStudent'))
        .replace('{n}', String(lockedInventory.videoCount))
        .replace('{m}', String(lockedInventory.analysisCount))
        .replace('{name}', profile?.full_name || profile?.email || t('media.studentFallback'))
    : null;

  const { data: analysisVideos = [] } = useQuery({
    queryKey: ['student-analysis-videos', profile?.id],
    queryFn: async () => {
      const lessonIds = await fetchStudentLessonIds(profile?.id);
      const orFilter = buildStudentVideoOr(profile?.id!, lessonIds);
      const { data } = await supabase
        .from('videos')
        .select('*, lessons(lesson_date, lesson_type)')
        .eq('category', 'analysis')
        .or(orFilter)
        .order('upload_date', { ascending: false });
      return (data || []) as VideoWithLesson[];
    },
    enabled: !!profile?.id && canAccessVideos,
  });

  const { data: lessonVideos = [] } = useQuery({
    queryKey: ['student-lesson-videos', profile?.id],
    queryFn: async () => {
      const lessonIds = await fetchStudentLessonIds(profile?.id);
      const orFilter = buildStudentVideoOr(profile?.id!, lessonIds);
      const { data } = await supabase
        .from('videos')
        .select('*, lessons(lesson_date, lesson_type)')
        .in('category', ['lesson', 'profile'])
        .or(orFilter)
        .order('upload_date', { ascending: false });

      const videoRows = (data || []) as VideoWithLesson[];

      // Also include coach-uploaded items in student_media (Media button on coach profile)
      const { data: mediaData } = await supabase
        .from('student_media' as any)
        .select('*, lessons(lesson_date, lesson_type)')
        .eq('student_id', profile?.id)
        .order('uploaded_at', { ascending: false });

      const mediaRows: VideoWithLesson[] = ((mediaData || []) as any[]).map((m: any) => ({
        id: m.id,
        title: m.title || 'Media',
        description: null,
        file_url: m.file_url,
        file_type: m.file_type || 'image',
        category: 'lesson',
        tags: null,
        upload_date: m.uploaded_at,
        lesson_id: m.lesson_id,
        student_id: m.student_id,
        thumbnail_url: m.thumbnail_url || null,
        coach_feedback: null,
        next_steps: null,
        feedback_added_at: null,
        lessons: m.lessons || null,
      }));

      const effective = (v: any): string => {
        const ld = v?.lessons?.lesson_date;
        return ld ? `${ld}T12:00:00` : v.upload_date;
      };
      const combined = [...videoRows, ...mediaRows].sort(
        (a, b) => new Date(effective(b)).getTime() - new Date(effective(a)).getTime()
      );
      return combined;
    },
    enabled: !!profile?.id && canAccessVideos,
  });

  // Realtime: refresh when coach uploads new videos or media for this student
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student-videos-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos', filter: `student_id=eq.${profile.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['student-analysis-videos', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['student-lesson-videos', profile.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_media', filter: `student_id=eq.${profile.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['student-lesson-videos', profile.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, queryClient]);

  const VideoCard = ({ video }: { video: VideoWithLesson }) => {
    const signedThumb = useSignedLessonVideoUrl(video.thumbnail_url);
    const signedFile = useSignedLessonVideoUrl(video.file_url);
    return (
    <div
      className="glass-card overflow-hidden group cursor-pointer"
      onClick={() => {
        setSelectedVideoId(video.id);
        setIsModalOpen(true);
      }}
    >
      {/* Thumbnail — 60% top */}
      <div className="aspect-[16/10] bg-black/30 flex items-center justify-center relative overflow-hidden">
        {/* 3-dot menu */}
        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
          <VideoCardMenu video={video} studentId={profile?.id} />
        </div>

        {/* Category badge */}
        <div className="absolute top-2 left-2 z-10">
          <Badge
            className={video.category === 'analysis'
              ? 'bg-green-accent/80 text-ivory border-green-accent/40'
              : 'bg-gold-accent/80 text-black border-gold-accent/40'
            }
          >
            {video.category === 'analysis' ? (
              <><BarChart3 className="h-3 w-3 mr-1" /> {t('media.analysisBadge')}</>
            ) : (
              <><GraduationCap className="h-3 w-3 mr-1" /> {t('media.lessonBadge')}</>
            )}
          </Badge>
        </div>

        {/* Feedback status badge */}
        {video.coach_feedback ? (
          <div className="absolute top-2 right-12 z-10">
            <Badge className="bg-green-accent/80 text-ivory gap-1">
              <CheckCircle className="w-3 h-3" />
              {t('media.reviewedBadge')}
            </Badge>
          </div>
        ) : video.category === 'analysis' && (
          <div className="absolute top-2 right-12 z-10">
            <Badge className="bg-gold-accent/80 text-black gap-1">
              <AlertCircle className="w-3 h-3" />
              {t('media.pendingBadge')}
            </Badge>
          </div>
        )}

        {video.file_type === 'video' ? (
          <>
            {signedThumb ? (
              <img
                src={signedThumb}
                alt={video.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <Video className="h-16 w-16 text-ivory/20" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
              <div className="h-14 w-14 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="h-6 w-6 text-ivory ml-1" fill="currentColor" />
              </div>
            </div>
          </>
        ) : (
          <img src={signedFile ?? video.file_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-heading font-semibold text-ivory truncate">{video.title}</h3>
        {video.description && (
          <p className="text-sm text-ivory/60 line-clamp-2">{video.description}</p>
        )}
        {video.category === 'lesson' && video.lessons && (
          <p className="text-xs text-ivory/50">
            {t('media.fromLesson').replace('{date}', new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(video.lessons.lesson_date))).replace('{type}', video.lessons.lesson_type)}
          </p>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-xs text-ivory/50">
            {new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(video.lessons?.lesson_date ? `${video.lessons.lesson_date}T12:00:00` : video.upload_date))}
          </span>
          <div className="flex items-center gap-2">
            {video.file_type === 'video' && (
              <button
                onClick={(e) => { e.stopPropagation(); downloadVideo(video.file_url, `${video.title}.mp4`); }}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                title={t('media.downloadVideo')}
              >
                <Download className="h-3.5 w-3.5 text-gold-accent" />
              </button>
            )}
            {video.file_type === 'video' && isDirectVideoFile(video.file_url) && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/pro-zone/compare?mine=${video.id}`); }}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                title={t('media.compareWithTourPro')}
              >
                <GitCompare className="h-3.5 w-3.5 text-gold-accent" />
              </button>
            )}
            {video.coach_feedback && (
              <span className="text-xs text-green-accent font-medium">{t('media.feedbackAvailable')}</span>
            )}
            {video.tags && video.tags.length > 0 && (
              <Badge className="bg-green-accent/20 text-green-accent border-green-accent/30 text-xs">
                #{video.tags[0]}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  };

  const triggerUpload = (type: 'analysis' | 'lesson') => {
    const eventName = type === 'analysis' ? 'open-video-analysis' : 'open-video-upload';
    window.dispatchEvent(new Event(eventName));
  };

  const EmptyState = ({ type }: { type: 'analysis' | 'lesson' }) => (
    <div className="glass-card p-16 text-center">
      <div className="h-20 w-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
        {type === 'analysis' ? <BarChart3 className="h-10 w-10 text-ivory/30" /> : <GraduationCap className="h-10 w-10 text-ivory/30" />}
      </div>
      <h3 className="font-heading font-semibold text-xl text-ivory mb-2">
        {type === 'analysis' ? t('media.noAnalysisVideos') : t('media.noLessonVideos')}
      </h3>
      <p className="text-ivory/50 mb-8 max-w-sm mx-auto">
        {type === 'analysis'
          ? t('media.submitForAnalysis')
          : t('media.addLessonVideoDesc')
        }
      </p>
      <Button
        className={type === 'analysis'
          ? 'bg-gold-accent text-black hover:bg-gold-accent/90 px-6 py-3'
          : 'btn-green px-6 py-3'
        }
        onClick={() => triggerUpload(type)}
      >
        <Upload className="h-4 w-4 mr-2" />
        {type === 'analysis' ? t('media.uploadVideoForAnalysis') : t('media.addLessonVideo')}
      </Button>
    </div>
  );

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.myVideosTitle" subtitleKey="admin.myVideosSub" backTo="/dashboard" />

      <main className="container mx-auto px-4 py-6">
        {!canAccessVideos ? (
          <div className="space-y-6">
            {inventoryLine && (
              <p className="text-center text-sm font-medium text-ivory/80">
                {inventoryLine}
              </p>
            )}
            {/* Hero */}
            <div className="glass-card p-6 text-center space-y-3">
              <div
                className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(240,192,64,0.15)' }}
              >
              {inTrial ? <Clock className="h-7 w-7 text-gold-accent" /> : <Sparkles className="h-7 w-7 text-gold-accent" />}
              </div>
              <div>
                {showVideosWaitingTitle ? (
                  <>
                    <p className="text-ivory/60 text-sm max-w-md mx-auto">
                      {t('media.videosWaitingSubtitle')}
                    </p>
                    <h1 className="font-heading text-2xl font-bold text-ivory tracking-tight mt-1">
                      {waitingTitleParts[0]}
                      <span style={{ color: planAccentColor, fontSize: '1.35em' }}>
                        {lockedInventory!.videoCount}
                      </span>
                      {waitingTitleParts[1]}
                    </h1>
                  </>
                ) : (
                  <>
                    <h1 className="font-heading text-2xl font-bold text-ivory tracking-tight">
                      {inTrial
                        ? t('media.comingSoonTitle')
                        : trialEndsAt
                          ? t('media.trialEndedTitle')
                          : t('media.personalLibraryTitle')}
                    </h1>
                    <p className="text-ivory/60 text-sm mt-1 max-w-md mx-auto">
                      {inTrial
                        ? t('media.comingSoonDesc')
                        : t('media.personalLibraryDesc')}
                    </p>
                  </>
                )}
              </div>
              <div className="pt-2">
                <Link to="/plans" className="inline-block">
                  <Button className="h-11 px-5 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
                    <Sparkles className="h-4 w-4" /> {inTrial ? t('media.viewPlans') : t('media.seePlans')}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Blurred teaser */}
            <div className="relative">
              <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pointer-events-none select-none">
                {(lockedInventory?.recentItems.length
                  ? lockedInventory.recentItems
                  : [null, null, null]
                ).map((video, index) => (
                  <LockedVideoCard
                    key={video?.id || index}
                    video={video}
                    locale={locale}
                    fallbackTitle={t('media.lessonSwing')}
                    membersOnly={t('media.membersOnly')}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label={t('media.seePlansToUnlock')}
                onClick={() => navigate('/plans')}
                className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl"
              >
                <span className="bg-gold-accent text-black px-4 py-2 rounded-full flex items-center gap-2 font-semibold shadow-lg text-sm">
                  <Lock className="h-4 w-4" />
                  {t('media.membersOnlySeePlans')}
                </span>
              </button>
            </div>

            {/* Conversion strip */}
            <div className="glass-card p-5 space-y-4">
              <ul className="space-y-2.5">
                {[
                  t('media.perkSaveRevisit'),
                  t('media.perkBuildLibrary'),
                  t('media.perkCompareSideBySide'),
                  t('media.perkCancelAnytime'),
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-ivory/80 text-sm">
                    <Check className="h-4 w-4 text-green-accent mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link to="/plans" className="block">
                <Button className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
                  <Sparkles className="h-4 w-4" /> {t('media.seeMembershipPlans')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
        <Tabs defaultValue="lessons" className="w-full">
          <TabsList className="glass-pill-tabs grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="analysis" className="glass-pill-tab gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              <span>{t('media.analysisTab').replace('{n}', String(analysisVideos.length))}</span>
            </TabsTrigger>
            <TabsTrigger value="lessons" className="glass-pill-tab gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              <span>{t('media.lessonVideosTab').replace('{n}', String(lessonVideos.length))}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis">
            {analysisVideos.length > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    className="bg-gold-accent text-black hover:bg-gold-accent/90"
                    onClick={() => triggerUpload('analysis')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('media.uploadVideoForAnalysis')}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {analysisVideos.map((video) => (
                    <VideoCard key={video.id} video={video} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState type="analysis" />
            )}
          </TabsContent>

          <TabsContent value="lessons">
            {lessonVideos.length > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button className="btn-green" onClick={() => triggerUpload('lesson')}>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('media.addLessonVideo')}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {lessonVideos.map((video) => (
                    <VideoCard key={video.id} video={video} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState type="lesson" />
            )}
          </TabsContent>
        </Tabs>
        )}
      </main>

      <SocialFooter />

      <VideoDetailModal
        videoId={selectedVideoId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVideoId(null);
        }}
        isCoach={false}
      />
    </div>
  );
}
