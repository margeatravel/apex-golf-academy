import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sortByPickerOrder, isTodayInCancun, TODAY_LESSON_TEXT_CLASS } from '@/lib/cancunDate';
import { ArrowLeft, Upload, Loader2, Video, AlertCircle, X } from 'lucide-react';

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { SocialFooter } from '@/components/SocialFooter';
import { useFileValidation } from '@/hooks/useFileValidation';
import { generateVideoThumbnail } from '@/lib/videoThumbnail';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { FamilyTargetSelect } from '@/components/family/FamilyTargetSelect';
import { lessonClassNumberLabel } from '@/lib/lessonClassNumber';
import { useLanguage } from '@/contexts/LanguageContext';

const uploadSchema = z.object({
  title: z.string().max(100, 'Title must be less than 100 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  studentId: z.string().min(1, 'Please select a student'),
  tags: z.string().max(200, 'Tags must be less than 200 characters').optional(),
});

export default function AdminUploadVideo() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    studentId: '',
    lessonId: '',
    tags: '',
  });
  
  // Destination of the upload: the selected student, or one of their linked
  // family members (managed child, partner…).
  const [targetStudentId, setTargetStudentId] = useState('');
  const uploadTargetId = targetStudentId || formData.studentId;
  const uploadingForFamily = !!uploadTargetId && uploadTargetId !== formData.studentId;

  const { validateFile, validating, fileError, setFileError, showValidationError, MAX_VIDEO_DURATION } = useFileValidation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearSelectedFiles = () => {
    setFiles([]);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFileAt = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Pre-fill student ID from URL parameter
  useEffect(() => {
    const studentIdParam = searchParams.get('studentId');
    if (studentIdParam) {
      setFormData(prev => ({ ...prev, studentId: studentIdParam }));
    }
  }, [searchParams]);


  // Lessons available to link the video to:
  // 1) All lessons where the selected student is the lesson owner.
  // 2) Lessons attached to packages the student is a SHARED member of
  //    (via package_members), so e.g. Benito + Andrade can pick lessons
  //    booked under "Obregón Hijos" — the package owner.
  const { data: lessons = [] } = useQuery({
    queryKey: ['student-lessons-for-upload', formData.studentId],
    queryFn: async () => {
      if (!formData.studentId) return [];

      // Owned lessons (today's behavior).
      const { data: ownedLessons } = await supabase
        .from('lessons')
        .select('*')
        .eq('student_id', formData.studentId)
        .order('lesson_date', { ascending: false })

      // Shared-package lesson lookup.
      const { data: memberRows } = await supabase
        .from('package_members' as any)
        .select('package_id')
        .eq('student_id', formData.studentId);
      const sharedPackageIds = ((memberRows || []) as any[])
        .map((m: any) => m.package_id)
        .filter(Boolean);

      let sharedLessons: any[] = [];
      if (sharedPackageIds.length > 0) {
        const { data: shared } = await supabase
          .from('lessons')
          .select('*')
          .in('package_id', sharedPackageIds)
          .neq('student_id', formData.studentId)
          .neq('status', 'cancelled')
          .order('lesson_date', { ascending: false })
        sharedLessons = shared || [];
      }

      // Look up owner names for shared lessons so the dropdown can label them.
      const ownerIds = Array.from(
        new Set(sharedLessons.map((l: any) => l.student_id).filter(Boolean))
      );
      let ownerNameById: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds);
        for (const o of owners || []) {
          ownerNameById[o.id] = o.full_name || o.email || 'shared package';
        }
      }

      const all = [
        ...((ownedLessons || []) as any[]).map((l: any) => ({ ...l, _shared: false })),
        ...sharedLessons.map((l: any) => ({
          ...l,
          _shared: true,
          _ownerName: ownerNameById[l.student_id] || 'shared package',
        })),
      ];

      // Dedupe by id (just in case) and resort.
      const dedup = Array.from(new Map(all.map((l: any) => [l.id, l])).values());
      return sortByPickerOrder(dedup);
    },
    enabled: !!formData.studentId,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    setFileError(null);

    // Validate every selected file. If any fail, reject the whole batch.
    const accepted: File[] = [];
    for (const f of selected) {
      const result = await validateFile(f);
      if (!result.isValid) {
        showValidationError(`${f.name}: ${result.error}`);
        e.target.value = '';
        return;
      }
      accepted.push(f);
    }

    // Append to any already-selected files so the coach can keep adding.
    setFiles(prev => [...prev, ...accepted]);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !user) return;

    setLoading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      uploadSchema.parse(formData);

      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      // Determine category based on whether lesson is linked
      const videoCategory = formData.lessonId ? 'lesson' : 'analysis';
      // Default title when the coach leaves it empty: the lesson's class number.
      const classLabel = await lessonClassNumberLabel(
        uploadingForFamily ? null : formData.lessonId,
        language
      );
      const total = files.length;
      const uploadedIds: string[] = [];
      let firstTitle = '';

      for (let i = 0; i < total; i++) {
        const f = files[i];
        setUploadProgress({ current: i + 1, total });

        const fileExt = f.name.split('.').pop();
        const fileName = `${uploadTargetId}/${Date.now()}-${i}.${fileExt}`;
        const isVideo = f.type.startsWith('video/');

        const { error: uploadError } = await supabase.storage
          .from('golf-media')
          .upload(fileName, f, {
            cacheControl: '3600',
            upsert: false,
            contentType: f.type || 'application/octet-stream',
          });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('golf-media')
          .getPublicUrl(fileName);

        // Thumbnail for videos
        let thumbnailUrl: string | null = null;
        if (isVideo) {
          try {
            const thumbnailBlob = await generateVideoThumbnail(f, 1.0);
            if (thumbnailBlob) {
              const thumbnailPath = `${uploadTargetId}/thumbs/${Date.now()}-${i}-thumb.jpg`;
              const { error: thumbErr } = await supabase.storage
                .from('golf-media')
                .upload(thumbnailPath, thumbnailBlob, {
                  contentType: 'image/jpeg',
                  cacheControl: '3600',
                });
              if (!thumbErr) {
                const { data: thumbUrl } = supabase.storage
                  .from('golf-media')
                  .getPublicUrl(thumbnailPath);
                thumbnailUrl = thumbUrl.publicUrl;
              }
            }
          } catch (e) {
            console.warn('[Upload] thumbnail failed for', f.name, e);
          }
        }

        // Per-file title:
        // - If coach typed a title and there are multiple files → "Title (1/N)"
        // - If coach typed a title and there's only one file → "Title"
        // - If no title → use the file name without extension
        const baseTitle = formData.title.trim();
        const filenameWithoutExt = f.name.replace(/\.[^.]+$/, '');
        const perFileTitle = baseTitle
          ? total > 1
            ? `${baseTitle} (${i + 1}/${total})`
            : baseTitle
          : (classLabel || filenameWithoutExt);
        if (i === 0) firstTitle = perFileTitle;

        const { data: videoData, error: dbError } = await supabase
          .from('videos')
          .insert({
            student_id: uploadTargetId,
            // A family member's video is never tied to the student's lesson.
            lesson_id: uploadingForFamily ? null : (formData.lessonId || null),
            title: perFileTitle,
            description: formData.description || null,
            file_url: urlData.publicUrl,
            file_type: isVideo ? 'video' : 'image',
            thumbnail_url: thumbnailUrl,
            tags: tags.length > 0 ? tags : null,
            uploaded_by: user.id,
            category: videoCategory,
          })
          .select('id')
          .single();
        if (dbError) throw dbError;
        if (videoData?.id) uploadedIds.push(videoData.id);
      }

      // Create in-app notification for student
      const summaryTitle = total === 1
        ? `New video uploaded`
        : `${total} new videos uploaded`;
      const summaryMessage = total === 1
        ? `A new video "${firstTitle}" is ready to view.`
        : `${total} new videos are ready to view (starting with "${firstTitle}").`;

      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: uploadTargetId,
          title: summaryTitle,
          message: summaryMessage,
          link: '/videos',
          type: 'video_uploaded',
          metadata: {
            video_ids: uploadedIds,
            video_id: uploadedIds[0],
            student_id: uploadTargetId,
            uploaded_by: 'coach',
            count: total,
            video_title: firstTitle,
          },
        });

      if (notifError) {
        console.error('Failed to create notification:', notifError);
      }

      // Get student profile for email (always send for transactional emails)
      const { data: studentProfile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', uploadTargetId)
        .single();

      // Send email notification (always for transactional events)
      if (studentProfile?.email) {
        try {
          const emailVideoTitle = total === 1
            ? firstTitle
            : `${firstTitle} +${total - 1} more`;
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: studentProfile.email,
              studentName: studentProfile.full_name || 'Student',
              videoTitle: emailVideoTitle,
              uploadedBy: 'coach',
            },
          });
        } catch (emailError) {
          console.warn('Email notification failed:', emailError);
        }
      }

      toast({
        title: total === 1 ? 'Upload successful!' : `Uploaded ${total} videos!`,
        description:
          total === 1
            ? "Video has been added to student's library."
            : `${total} videos have been added to the student's library.`,
      });

      // Navigate back to student detail if we came from there, otherwise admin dashboard
      navigate(formData.studentId ? `/admin/student/${formData.studentId}` : '/admin');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation Error',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Upload failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="app-bg min-h-screen">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to={formData.studentId ? `/admin/student/${formData.studentId}` : '/admin'}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {formData.studentId ? 'Back to Student' : 'Back'}
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-secondary to-warning flex items-center justify-center">
              <Video className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold">Upload Student Video</h1>
              <p className="text-xs text-muted-foreground">Add a video for a student</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Upload Video for Student</CardTitle>
            <CardDescription>Add swing analysis video or images for your students</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="student">Select Student *</Label>
                <SearchableStudentSelect
                  value={formData.studentId}
                  onValueChange={(value) => { setFormData({ ...formData, studentId: value, lessonId: '' }); setTargetStudentId(''); }}
                  variant="light"
                />
              </div>

              {formData.studentId && (
                <FamilyTargetSelect
                  studentId={formData.studentId}
                  value={uploadTargetId}
                  onChange={(id) => { setTargetStudentId(id); setFormData((p) => ({ ...p, lessonId: '' })); }}
                  variant="light"
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="file">Videos or Images * <span className="text-xs text-muted-foreground font-normal">(you can pick multiple)</span></Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="file"
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm"
                    onChange={handleFileChange}
                    required={files.length === 0}
                    disabled={validating}
                    className="bg-muted/50"
                  />
                  {validating && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking...
                    </div>
                  )}
                </div>
                {files.length > 0 && !validating && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{files.length} file{files.length !== 1 ? 's' : ''} selected</span>
                      <button
                        type="button"
                        onClick={clearSelectedFiles}
                        className="text-destructive hover:underline"
                      >
                        Remove all
                      </button>
                    </div>
                    <div className="space-y-2">
                      {files.map((f, idx) => (
                        <div
                          key={`${f.name}-${idx}`}
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                        >
                          <Upload className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(f.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeFileAt(idx)}
                            className="flex-shrink-0 h-9 px-3 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {fileError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Max file size: 100MB. Videos are limited to {MAX_VIDEO_DURATION} seconds max.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Note: Videos must be {MAX_VIDEO_DURATION} seconds or less to keep the library lightweight and focused on swing clips.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title *
                  {files.length > 1 && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      (each video will be titled "{formData.title || 'Title'} (1/{files.length})", "(2/{files.length})", …)
                    </span>
                  )}
                </Label>
                <Input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Swing Analysis - Week 3"
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Coach notes about this swing, areas to work on, etc."
                  className="bg-muted/50 min-h-[100px]"
                />
              </div>

              {formData.studentId && !uploadingForFamily && (
                <div className="space-y-2">
                  <Label htmlFor="lesson">Link to Lesson (Optional)</Label>
                  <Select value={formData.lessonId} onValueChange={(value) => setFormData({ ...formData, lessonId: value })}>
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Select a lesson" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-2 border-border z-[100] shadow-lg">
                      {lessons.map((lesson: any) => (
                        <SelectItem key={lesson.id} value={lesson.id} className="hover:bg-accent cursor-pointer">
                          <span className={isTodayInCancun(lesson.lesson_date) ? TODAY_LESSON_TEXT_CLASS : undefined}>
                          {format(new Date(lesson.lesson_date + 'T12:00:00'), 'MMM dd, yyyy')} - {lesson.lesson_type}
                          {lesson._shared && (
                            <span className="text-xs text-muted-foreground ml-1">
                              · with {lesson._ownerName} (shared)
                            </span>
                          )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {lessons.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No lessons found for this student. The video will be uploaded without a lesson link.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="analysis, driver, improvement"
                  className="bg-muted/50"
                />
              </div>

              <Button
                type="submit"
                className="w-full font-semibold bg-primary hover:bg-primary/90 text-primary-foreground relative overflow-hidden"
                disabled={loading || files.length === 0 || validating || !!fileError}
              >
                {loading && (
                  <div className="absolute inset-0 bg-white/15 animate-pulse" />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploadProgress
                        ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                        : 'Uploading…'}
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {files.length > 1 ? `Upload ${files.length} files for Student` : 'Upload for Student'}
                    </>
                  )}
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
      
      <SocialFooter />
    </div>
  );
}
