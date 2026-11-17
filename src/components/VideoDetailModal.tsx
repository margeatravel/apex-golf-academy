import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, User, CheckCircle, AlertCircle, GraduationCap, BarChart3, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadVideo } from '@/lib/downloadVideo';
import { useSignedMediaUrl as useSignedLessonVideoUrl } from '@/hooks/useSignedMediaUrl';
import { useLanguage } from '@/contexts/LanguageContext';

interface VideoWithFeedback {
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
  student_notified?: boolean | null;
  lessons?: {
    lesson_date: string;
    lesson_type: string;
  } | null;
  profiles?: {
    full_name: string | null;
  } | null;
}

interface VideoDetailModalProps {
  videoId: string | null;
  isOpen: boolean;
  onClose: () => void;
  isCoach: boolean;
  onFeedbackSaved?: () => void;
}

export function VideoDetailModal({ videoId, isOpen, onClose, isCoach, onFeedbackSaved }: VideoDetailModalProps) {
  const { t } = useLanguage();
  const [video, setVideo] = useState<VideoWithFeedback | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const signedFileUrl = useSignedLessonVideoUrl(video?.file_url ?? null);
  const signedPoster = useSignedLessonVideoUrl(video?.thumbnail_url ?? null);

  useEffect(() => {
    async function fetchVideo() {
      if (!videoId || !isOpen) {
        setVideo(null);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('videos')
          .select(`
            *,
            profiles:student_id (full_name),
            lessons:lesson_id (lesson_date, lesson_type)
          `)
          .eq('id', videoId)
          .single();

        if (error) throw error;

        setVideo(data);
        setFeedback(data.coach_feedback || '');
        setNextSteps(data.next_steps || '');
      } catch (error) {
        console.error('Error fetching video:', error);
        toast.error(t('media.failedToLoadVideo'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchVideo();
  }, [videoId, isOpen]);

  const handleSaveFeedback = async () => {
    if (!video) return;

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('videos')
        .update({
          coach_feedback: feedback.trim() || null,
          next_steps: nextSteps.trim() || null,
          feedback_added_at: new Date().toISOString(),
          student_notified: false
        })
        .eq('id', video.id);

      if (updateError) throw updateError;

      const { data: updatedVideo } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:student_id (full_name, email),
          lessons:lesson_id (lesson_date, lesson_type)
        `)
        .eq('id', video.id)
        .single();

      if (updatedVideo) {
        setVideo(updatedVideo);
        setFeedback(updatedVideo.coach_feedback || '');
        setNextSteps(updatedVideo.next_steps || '');

        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: video.student_id,
            title: 'Coach feedback added',
            message: `Your coach has reviewed "${video.title}" and left feedback.`,
            link: '/videos',
            type: 'feedback_added',
            metadata: { video_id: video.id, student_id: video.student_id },
          });

        if (notifError) {
          console.error('Failed to create feedback notification:', notifError);
        }

        const studentEmail = (updatedVideo.profiles as any)?.email;
        const studentName = (updatedVideo.profiles as any)?.full_name;
        if (studentEmail) {
          try {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: studentEmail,
                studentName: studentName || 'Student',
                videoTitle: video.title,
                notificationType: 'feedback_added',
                feedbackPreview: feedback.trim(),
              },
            });
          } catch (emailError) {
            console.warn('Feedback email notification failed:', emailError);
          }
        }
      }

      toast.success(t('media.feedbackSavedTitle'));
      onFeedbackSaved?.();

    } catch (error) {
      console.error('Error saving feedback:', error);
      toast.error(t('media.failedToSaveFeedback'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setVideo(null);
    setFeedback('');
    setNextSteps('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass-card border-white/15 bg-[#0d1f18]/95 backdrop-blur-xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
          </div>
        ) : !video ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-ivory/60">{t('media.videoNotFound')}</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                {video.category === 'analysis' ? (
                  <Badge className="gap-1 bg-green-accent/20 text-green-accent border-green-accent/30">
                    <AlertCircle className="h-3 w-3" />
                    {t('ui.videoDetail.forAnalysis')}
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-gold-accent/20 text-gold-accent border-gold-accent/30">
                    <GraduationCap className="h-3 w-3" />
                    {t('ui.videoDetail.lessonVideo')}
                  </Badge>
                )}
                {video.coach_feedback && (
                  <Badge className="gap-1 bg-green-accent/20 text-green-accent border-green-accent/30">
                    <CheckCircle className="h-3 w-3" />
                    {t('ui.videoDetail.reviewed')}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-heading text-ivory">{video.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Video Player */}
              <div className="relative">
                <div className="aspect-video bg-black/40 rounded-xl overflow-hidden">
                  <video controls className="w-full h-full" src={signedFileUrl ?? undefined} poster={signedPoster ?? undefined}>
                    {t('ui.videoDetail.browserNoVideo')}
                  </video>
                </div>
                <button
                  onClick={() => downloadVideo(signedFileUrl ?? video.file_url, `${video.title}.mp4`)}
                  className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
                  title={t('media.downloadVideo')}
                >
                  <Download className="h-4 w-4 text-gold-accent" />
                </button>
              </div>

              {/* Video Info */}
              <div className="flex flex-wrap gap-4 text-sm text-ivory/60">
                {video.profiles?.full_name && (
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {video.profiles.full_name}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(video.upload_date), 'MMM dd, yyyy')}
                </div>
                {video.tags && video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {video.tags.map((tag, i) => (
                      <Badge key={i} className="bg-white/10 text-ivory/70 border-white/15 text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {video.description && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm font-medium text-ivory/80 mb-1">{t('ui.videoDetail.studentNotes')}</p>
                  <p className="text-ivory/60">{video.description}</p>
                </div>
              )}

              {video.lessons && (
                <div className="bg-green-accent/10 rounded-xl p-4 border border-green-accent/20">
                  <p className="text-sm font-medium text-ivory/80 mb-1">{t('ui.videoDetail.linkedLesson')}</p>
                  <p className="text-green-accent">
                    {format(new Date(video.lessons.lesson_date + 'T12:00:00'), 'MMM dd, yyyy')} - {video.lessons.lesson_type}
                  </p>
                </div>
              )}

              {/* Coach Feedback Section */}
              {isCoach && (
                <div className="space-y-4 border-t border-white/10 pt-6">
                  <h3 className="text-lg font-heading font-semibold text-ivory flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-green-accent flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-ivory" />
                    </span>
                    {t('ui.videoDetail.coachFeedback')}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-ivory/80 mb-2">{t('ui.videoDetail.swingAnalysisFeedback')}</label>
                      <Textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder={t('ui.videoDetail.feedbackPh')}
                        className="glass-input min-h-[120px] resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ivory/80 mb-2">{t('ui.videoDetail.nextStepsDrills')}</label>
                      <Textarea
                        value={nextSteps}
                        onChange={(e) => setNextSteps(e.target.value)}
                        placeholder={t('ui.videoDetail.drillsPh')}
                        className="glass-input min-h-[100px] resize-y"
                      />
                    </div>
                    {video.feedback_added_at && (
                      <div className="bg-green-accent/10 border border-green-accent/20 rounded-xl p-3">
                        <p className="text-sm text-green-accent">
                          <strong>{t('media.lastUpdated')}</strong> {format(new Date(video.feedback_added_at), 'MMM dd, yyyy \'at\' h:mm a')}
                          {video.student_notified && ` • ${t('media.studentNotified')}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Student View — Display Feedback */}
              {!isCoach && (video.coach_feedback || video.next_steps) && (
                <div className="space-y-4 border-t border-white/10 pt-6">
                  <h3 className="text-lg font-heading font-semibold text-ivory flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-green-accent flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-ivory" />
                    </span>
                    {t('ui.videoDetail.coachFeedback')}
                  </h3>

                  {video.coach_feedback && (
                    <div className="bg-green-accent/10 border border-green-accent/20 rounded-xl p-4">
                      <p className="text-sm font-medium text-green-accent mb-2">{t('ui.videoDetail.swingAnalysis')}</p>
                      <p className="text-ivory/80 whitespace-pre-wrap">{video.coach_feedback}</p>
                    </div>
                  )}

                  {video.next_steps && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-sm font-medium text-blue-400 mb-2">{t('ui.videoDetail.nextSteps')}</p>
                      <p className="text-ivory/80 whitespace-pre-wrap">{video.next_steps}</p>
                    </div>
                  )}

                  {video.feedback_added_at && (
                    <p className="text-xs text-ivory/40">
                      {t('media.feedbackAddedOn').replace('{date}', format(new Date(video.feedback_added_at), 'MMM dd, yyyy'))}
                    </p>
                  )}
                </div>
              )}

              {/* Pending review */}
              {!isCoach && !video.coach_feedback && !video.next_steps && video.category === 'analysis' && (
                <div className="border-t border-white/10 pt-6">
                  <div className="bg-gold-accent/10 border border-gold-accent/20 rounded-xl p-4 text-center">
                    <AlertCircle className="h-8 w-8 text-gold-accent mx-auto mb-2" />
                    <p className="text-sm text-gold-accent font-medium">{t('media.pendingReview')}</p>
                    <p className="text-xs text-ivory/40 mt-1">{t('media.pendingReviewDesc')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <Button onClick={handleClose} className="btn-glass">
                {t('ui.videoDetail.close')}
              </Button>

              {isCoach && (
                <Button onClick={handleSaveFeedback} disabled={isSaving} className="btn-green">
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('media.savingBtn')}</>
                  ) : t('media.saveFeedback')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
