import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2, Video, AlertCircle, Info, X } from 'lucide-react';
import { InternalHeader } from '@/components/InternalHeader';
import { isTodayInCancun, TODAY_LESSON_TEXT_CLASS } from '@/lib/cancunDate';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useFileValidation } from '@/hooks/useFileValidation';
import { generateVideoThumbnail } from '@/lib/videoThumbnail';
import { getMonthlyQuota, getUsedThisMonth, type HighlightPlan } from '@/lib/highlightsQuota';
import { Lock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';

const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  tags: z.string().max(200, 'Tags must be less than 200 characters').optional(),
  category: z.enum(['lesson', 'analysis']),
  lessonId: z.string().optional(),
}).refine((data) => {
  if (data.category === 'lesson') {
    return !!data.lessonId;
  }
  return true;
}, {
  message: 'Please select a lesson for lesson videos',
  path: ['lessonId'],
});

export default function VideoUpload() {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const { profile, user, effectivePlan } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<'lesson' | 'analysis'>('analysis');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    lessonId: '',
    tags: '',
  });
  
  const { validateFile, validating, fileError, setFileError, showValidationError, MAX_VIDEO_DURATION } = useFileValidation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan = (effectivePlan ?? 'free') as HighlightPlan;
  const monthlyQuota = getMonthlyQuota(plan);
  const isUnlimited = !Number.isFinite(monthlyQuota);

  const { data: usedThisMonth = 0, refetch: refetchUsage } = useQuery({
    queryKey: ['video-quota-used', profile?.id],
    queryFn: () => getUsedThisMonth(profile!.id),
    enabled: !!profile?.id,
  });

  const remainingSlots = isUnlimited ? Infinity : Math.max(0, monthlyQuota - usedThisMonth);
  // Analysis videos are exempt from this quota.
  const overQuota = category !== 'analysis' && !isUnlimited && remainingSlots <= 0;

  const clearSelectedFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const { data: lessons = [] } = useQuery({
    queryKey: ['my-lessons', profile?.id],
    queryFn: async () => {
      // 1) Lessons owned by the student.
      const { data: owned } = await supabase
        .from('lessons')
        .select('*')
        .eq('student_id', profile?.id)
        .order('lesson_date', { ascending: false })
        .limit(20);

      // 2) Lessons attached to packages the student is a shared member of.
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
          .select('*')
          .in('package_id', sharedPackageIds)
          .neq('student_id', profile!.id)
          .order('lesson_date', { ascending: false })
          .limit(20);

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
            .select('*')
            .in('student_id', ownerIds)
            .order('lesson_date', { ascending: false })
            .limit(20);
          byOwner = data || [];
        }

        shared = [...(byPkg || []), ...byOwner];
      }

      const all = [...(owned || []), ...shared];
      const dedup = Array.from(new Map(all.map((l: any) => [l.id, l])).values());
      dedup.sort((a: any, b: any) => (a.lesson_date < b.lesson_date ? 1 : -1));
      return dedup.slice(0, 20);
    },
    enabled: !!profile?.id,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(null);
    setFileError(null);
    
    const result = await validateFile(selectedFile);
    
    if (!result.isValid) {
      showValidationError(result.error!);
      // Clear the input
      e.target.value = '';
      return;
    }
    
    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    // Re-check quota right before upload (skip for analysis videos).
    if (category !== 'analysis' && !isUnlimited) {
      const fresh = await getUsedThisMonth(user.id);
      if (fresh >= monthlyQuota) {
        toast({
          title: t('media.monthlyLimitReachedTitle'),
          description: t('media.monthlyLimitReachedDesc').replace('{n}', String(monthlyQuota)),
          variant: 'destructive',
        });
        refetchUsage();
        return;
      }
    }

    setLoading(true);

    try {
      // Validate form data
      uploadSchema.parse({ ...formData, category, lessonId: formData.lessonId });

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const isVideo = file.type.startsWith('video/');

      const { error: uploadError } = await supabase.storage
        .from('golf-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });

      if (uploadError) throw uploadError;

      // Get public URL for video
      const { data: urlData } = supabase.storage
        .from('golf-media')
        .getPublicUrl(fileName);

      // Generate and upload thumbnail for videos
      let thumbnailUrl: string | null = null;
      if (isVideo) {
        console.log('[Upload] Generating thumbnail for video...');
        const thumbnailBlob = await generateVideoThumbnail(file, 1.0);
        
        if (thumbnailBlob) {
          console.log('[Upload] Thumbnail generated, uploading...');
          const thumbnailPath = `${user.id}/thumbs/${Date.now()}-thumb.jpg`;
          
          const { error: thumbUploadError } = await supabase.storage
            .from('golf-media')
            .upload(thumbnailPath, thumbnailBlob, {
              contentType: 'image/jpeg',
              cacheControl: '3600',
            });

          if (!thumbUploadError) {
            const { data: thumbUrlData } = supabase.storage
              .from('golf-media')
              .getPublicUrl(thumbnailPath);
            thumbnailUrl = thumbUrlData.publicUrl;
            console.log('[Upload] Thumbnail uploaded:', thumbnailUrl);
          } else {
            console.warn('[Upload] Thumbnail upload failed:', thumbUploadError);
          }
        } else {
          console.warn('[Upload] Thumbnail generation returned null, continuing without thumbnail');
        }
      }

      // Create video record
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const { data: videoData, error: dbError } = await supabase
        .from('videos')
        .insert({
          student_id: profile?.id,
          lesson_id: category === 'lesson' ? formData.lessonId : null,
          title: formData.title,
          description: formData.description || null,
          file_url: urlData.publicUrl,
          file_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
          tags: tags.length > 0 ? tags : null,
          uploaded_by: user.id,
          category: category,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      // Create in-app notification for self
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: profile?.id,
          title: 'Video upload complete',
          message: `Your video "${formData.title}" has been uploaded successfully.`,
          link: '/videos',
          type: 'video_uploaded',
          metadata: { video_id: videoData?.id, student_id: profile?.id, uploaded_by: 'student' },
        });

      if (notifError) {
        console.error('Failed to create notification:', notifError);
      }

      // Send confirmation email to the student themselves (non-blocking).
      // For analysis uploads, send the dedicated "submitted for analysis" email.
      // Otherwise default to the generic "Upload Complete!" email.
      if (profile?.email) {
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: profile.email,
              studentName: profile.full_name || 'there',
              videoTitle: formData.title,
              uploadedBy: 'student',
              ...(category === 'analysis' ? { notificationType: 'analysis_submitted' } : {}),
            },
          });
        } catch (emailError) {
          console.warn('Student upload-complete email failed:', emailError);
        }
      }

      // Notify coach (admin) about student upload - get all admins
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        // Create in-app notification for each admin
        const adminNotifications = admins.map((admin) => ({
          user_id: admin.user_id,
          title: 'Student uploaded a video',
          message: `${profile?.full_name || 'A student'} uploaded "${formData.title}" for review.`,
          link: '/admin/analysis-requests',
          type: 'student_video_uploaded',
          metadata: { video_id: videoData?.id, student_id: profile?.id, uploaded_by: 'student', student_name: profile?.full_name || null, student_email: profile?.email || null, video_title: formData.title },
        }));

        const { error: adminNotifError } = await supabase
          .from('notifications')
          .insert(adminNotifications);

        if (adminNotifError) {
          console.error('Failed to create admin notifications:', adminNotifError);
        }

        // Send email to each admin
        for (const admin of admins) {
          const { data: adminProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', admin.user_id)
            .single();

          if (adminProfile?.email) {
            try {
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  to: adminProfile.email,
                  studentName: profile?.full_name || 'A student',
                  videoTitle: formData.title,
                  uploadedBy: 'student',
                  notificationType: 'student_upload',
                },
              });
            } catch (emailError) {
              console.warn('Admin email notification failed:', emailError);
            }
          }
        }

        // Single canonical admin notification to admin@margeagolfacademy.com
        try {
          await supabase.functions.invoke('notify-admin', {
            body: {
              eventType: 'video_uploaded_for_analysis',
              studentName: profile?.full_name || 'A student',
              studentEmail: profile?.email,
              notes: formData.title ? `Video title: ${formData.title}` : undefined,
            },
          });
        } catch (adminNotifyError) {
          console.warn('Admin notify (video upload) failed:', adminNotifyError);
        }
      }

      toast({
        title: t('media.uploadSuccessTitle'),
        description: t('media.uploadSuccessDesc'),
      });

      navigate('/videos');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: t('media.validationErrorTitle'),
          description: error.errors[0].message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('media.uploadFailedTitle'),
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <InternalHeader titleKey="admin.uploadVideoTitle" subtitleKey="admin.uploadVideoSub" backTo="/videos" />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('ui.videoUpload.heading')}</CardTitle>
            <CardDescription>{t('ui.videoUpload.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Video Type Selection */}
              <div className="space-y-3">
                <Label>{t('media.videoTypeLabel')}</Label>
                <RadioGroup 
                  value={category} 
                  onValueChange={(value: 'lesson' | 'analysis') => {
                    setCategory(value);
                    if (value === 'analysis') {
                      setFormData({ ...formData, lessonId: '' });
                    }
                  }}
                  className="grid grid-cols-1 gap-3"
                >
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${category === 'analysis' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="analysis" id="analysis" className="mt-0.5" />
                    <Label htmlFor="analysis" className="cursor-pointer flex-1">
                      <span className="font-semibold text-foreground">{t('media.forCoachAnalysisTitle')}</span>
                      <p className="text-sm text-muted-foreground mt-1">{t('media.forCoachAnalysisDesc')}</p>
                    </Label>
                  </div>
                  <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${category === 'lesson' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}>
                    <RadioGroupItem value="lesson" id="lesson" className="mt-0.5" />
                    <Label htmlFor="lesson" className="cursor-pointer flex-1">
                      <span className="font-semibold text-foreground">{t('media.lessonVideoTitle')}</span>
                      <p className="text-sm text-muted-foreground mt-1">{t('media.lessonVideoDesc')}</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Contextual info or lesson selector */}
              {category === 'analysis' && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-info/10 border border-info/20">
                  <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-info">
                    {t('media.analysisInfoNote')}
                  </p>
                </div>
              )}

              {/* Monthly upload quota status (skipped for analysis videos) */}
              {category !== 'analysis' && !isUnlimited && (
                overQuota ? (
                  <div className="flex flex-col gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-destructive">
                          {t('media.quotaReachedMonthly').replace('{n}', String(monthlyQuota))}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('media.upgradeToUploadMore')}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" className="w-full sm:w-auto self-start">
                      <Link to="/subscription">{t('media.viewPlansArrow')}</Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('media.remainingUploads').replace('{used}', String(Math.max(0, monthlyQuota - usedThisMonth))).replace('{total}', String(monthlyQuota))}
                  </p>
                )
              )}

              {category === 'lesson' && (
                <div className="space-y-2">
                  <Label htmlFor="lesson">{t('media.linkToLesson')}</Label>
                  <Select value={formData.lessonId} onValueChange={(value) => setFormData({ ...formData, lessonId: value })}>
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder={t('ui.videoUpload.selectLesson')} />
                    </SelectTrigger>
                    <SelectContent>
                      {lessons.map((lesson: any) => (
                        <SelectItem key={lesson.id} value={lesson.id}>
                          <span className={isTodayInCancun(lesson.lesson_date) ? TODAY_LESSON_TEXT_CLASS : undefined}>
                          {new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(lesson.lesson_date + 'T12:00:00'))} - {lesson.lesson_type}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {lessons.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('media.noLessonsFound')}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="file">{t('media.fileLabel')}</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="file"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm"
                    onChange={handleFileChange}
                    required={!file}
                    disabled={validating}
                    className="bg-muted/50"
                  />
                  {validating && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('media.checkingFile')}
                    </div>
                  )}
                </div>
                {file && !validating && (
                  <div className="flex items-center gap-3 mt-3 p-3 bg-muted/50 rounded-lg border border-border">
                    <Upload className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearSelectedFile}
                      className="flex-shrink-0 h-9 px-3 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t('media.removeFile')}
                    </Button>
                  </div>
                )}
                {fileError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('media.maxFileSizeNote').replace('{n}', String(MAX_VIDEO_DURATION))}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">{t('media.titleLabel')}</Label>
                <Input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('ui.videoUpload.titlePh')}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('media.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('ui.videoUpload.notesPh')}
                  className="bg-muted/50 min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">{t('media.tagsLabel')}</Label>
                <Input
                  id="tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder={t('media.tagsPlaceholder')}
                  className="bg-muted/50"
                />
              </div>

              <Button
                type="submit"
                className="w-full font-semibold bg-primary hover:bg-primary/90 text-primary-foreground relative overflow-hidden"
                disabled={loading || !file || validating || !!fileError || overQuota}
              >
                {loading && (
                  <div className="absolute inset-0 bg-white/15 animate-pulse" />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('media.uploading')}
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {t('media.uploadVideoBtn')}
                    </>
                  )}
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
