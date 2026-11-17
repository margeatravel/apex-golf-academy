import { useState } from 'react';
import { MoreVertical, Pencil, Share2, Trash2, ArrowRightLeft, Copy, ExternalLink, Send, Play, CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { formatLessonDate, formatLessonTime } from '@/lib/formatLessonDateTime';
import { ReclassifyVideoModal } from '@/components/ReclassifyVideoModal';
import { Button } from '@/components/ui/button';
import { SignedMediaImg } from '@/components/SignedMedia';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import ApexBrand from '@/components/ApexBrand';
import { downloadVideo } from '@/lib/downloadVideo';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useLanguage } from '@/contexts/LanguageContext';

interface Video {
  id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  file_url: string;
  student_id: string;
  category?: string | null;
  lesson_id?: string | null;
  thumbnail_url?: string | null;
  upload_date?: string | null;
}

interface VideoCardMenuProps {
  video: Video;
  studentId?: string;
}

export function VideoCardMenu({ video, studentId }: VideoCardMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description || '');
  const [tags, setTags] = useState(video.tags?.join(', ') || '');
  const [lessonId, setLessonId] = useState<string>(video.lesson_id || 'none');
  const [videoDate, setVideoDate] = useState<Date | undefined>(
    video.upload_date ? new Date(video.upload_date) : undefined
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const signedFileUrl = useSignedMediaUrl(video.file_url);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await downloadVideo(signedFileUrl ?? video.file_url, `${video.title || 'video'}.mp4`);
  };

  const { data: lessons = [] } = useQuery({
    queryKey: ['video-edit-lessons', video.student_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type')
        .eq('student_id', video.student_id)
        .order('lesson_date', { ascending: false })
        .order('lesson_time', { ascending: false });
      return data || [];
    },
    enabled: editOpen,
  });

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const shareUrl = `${SUPABASE_URL}/functions/v1/video-share?id=${video.id}`;
  const shareTitle = video.title || 'Apex Golf Academy video';
  const shareText = `${shareTitle} — Apex Golf Academy`;

  const handleNativeShare = async () => {
    const nav: any = navigator;
    if (nav?.share) {
      try {
        await nav.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    await handleCopy();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: t('media.linkCopiedTitle'), description: t('media.linkCopiedDesc') });
    } catch {
      toast({ title: t('media.couldNotCopyTitle'), description: t('media.tryAgain'), variant: 'destructive' });
    }
  };

  const handleEdit = async () => {
    if (!title.trim()) {
      toast({
        title: t('media.titleRequiredTitle'),
        description: t('media.titleRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const tagsArray = tags.trim() 
        ? tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : null;

      const linkedLessonId = lessonId && lessonId !== 'none' ? lessonId : null;
      const { error } = await supabase
        .from('videos')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          tags: tagsArray,
          lesson_id: linkedLessonId,
          category: linkedLessonId ? 'lesson' : (video.category === 'analysis' ? 'analysis' : 'profile'),
          upload_date: videoDate ? videoDate.toISOString() : undefined,
        })
        .eq('id', video.id);

      if (error) throw error;

      toast({
        title: t('media.videoUpdatedTitle'),
        description: t('media.videoUpdatedDesc'),
      });

      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['student-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      queryClient.invalidateQueries({ queryKey: ['recent-videos'] });
      queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] });
      setEditOpen(false);
    } catch (error: any) {
      toast({
        title: t('media.updateFailed'),
        description: error.message || t('media.couldNotUpdate'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('videos')
        .delete()
        .eq('id', video.id);

      if (dbError) throw dbError;

      // Try to delete from storage (extract path from URL)
      try {
        const url = new URL(video.file_url);
        const pathParts = url.pathname.split('/storage/v1/object/public/');
        if (pathParts.length > 1) {
          const fullPath = pathParts[1];
          const [bucket, ...fileParts] = fullPath.split('/');
          const filePath = fileParts.join('/');
          if (bucket && filePath) {
            await supabase.storage.from(bucket).remove([filePath]);
          }
        }
      } catch (storageError) {
        console.warn('Could not delete file from storage:', storageError);
        // Don't fail the operation - DB record is already deleted
      }

      toast({
        title: t('media.videoDeletedTitle'),
        description: t('media.videoDeletedDesc'),
      });

      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['student-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-analysis-videos'] });
      queryClient.invalidateQueries({ queryKey: ['student-lesson-videos'] });
      queryClient.invalidateQueries({ queryKey: ['recent-videos'] });
      queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] });
      setDeleteOpen(false);
    } catch (error: any) {
      toast({
        title: t('media.deleteFailedTitle'),
        description: error.message || t('media.couldNotDeleteVideo'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = () => {
    // Reset form with current video data
    setTitle(video.title);
    setDescription(video.description || '');
    setTags(video.tags?.join(', ') || '');
    setLessonId(video.lesson_id || 'none');
    setVideoDate(video.upload_date ? new Date(video.upload_date) : undefined);
    setEditOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-background/80 hover:bg-background shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">{t('media.videoActions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 bg-popover text-popover-foreground border border-border shadow-xl backdrop-blur-md z-[60]">
          <DropdownMenuItem onClick={openEditDialog} className="gap-2 cursor-pointer">
            <Pencil className="h-4 w-4" />
            {t('media.editItem')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)} className="gap-2 cursor-pointer">
            <Share2 className="h-4 w-4" />
            {t('media.shareItem')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload} className="gap-2 cursor-pointer">
            <Download className="h-4 w-4" />
            {t('common.download')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReclassifyOpen(true)} className="gap-2 cursor-pointer">
            <ArrowRightLeft className="h-4 w-4" />
            {t('media.reclassifyItem')}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setDeleteOpen(true)} 
            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {t('media.deleteItem')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('media.editVideoTitle')}</DialogTitle>
            <DialogDescription>
              {t('media.editVideoDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('media.titleField')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('media.enterVideoTitle')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('media.descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('media.enterVideoDescription')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">{t('media.tagsLabel')}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t('media.tagsExamplePh')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('media.linkToLessonLabel')}</Label>
              <Select
                value={lessonId}
                onValueChange={(val) => {
                  setLessonId(val);
                  // Auto-align video date to the lesson's date so it sorts correctly
                  if (val && val !== 'none') {
                    const l: any = lessons.find((x: any) => x.id === val);
                    if (l?.lesson_date) {
                      const [y, m, d] = String(l.lesson_date).split('-').map(Number);
                      if (y && m && d) setVideoDate(new Date(y, m - 1, d));
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('media.noneProfileVideo')} />
                </SelectTrigger>
                <SelectContent className="max-h-72 bg-popover z-[70]">
                  <SelectItem value="none">{t('media.noneKeepProfileVideo')}</SelectItem>
                  {lessons.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {formatLessonDate(l, 'short')} · {formatLessonTime(l)} · {l.lesson_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('media.linkLessonNote')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('media.videoDateLabel')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !videoDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {videoDate ? format(videoDate, 'PPP') : t('media.pickADate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[70] bg-popover" align="start">
                  <Calendar
                    mode="single"
                    selected={videoDate}
                    onSelect={setVideoDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {t('media.videoDateNote')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSubmitting}>
              {t('media.cancel')}
            </Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting ? t('media.saving') : t('media.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('media.deleteVideoTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('media.deleteVideoDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{t('media.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? t('media.saving') : t('media.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReclassifyVideoModal
        open={reclassifyOpen}
        onOpenChange={setReclassifyOpen}
        videoId={video.id}
        videoTitle={video.title}
        currentCategory={video.category || null}
        currentLessonId={video.lesson_id || null}
        studentId={video.student_id}
      />

      {/* Share Dialog with rich preview */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('media.shareVideoTitle')}</DialogTitle>
            <DialogDescription>
              {t('media.shareVideoDesc')}
            </DialogDescription>
          </DialogHeader>

          {/* Preview card — mimics how the link will unfurl */}
          <div className="rounded-xl overflow-hidden border border-border bg-card">
            <div className="relative aspect-video bg-black">
              {video.thumbnail_url ? (
                <SignedMediaImg
                  src={video.thumbnail_url}
                  alt={shareTitle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#1a2e1f]">
                  <ApexBrand size="sm" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2">{shareTitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-apex tracking-[0.18em] uppercase">Apex Golf Academy</p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono break-all text-muted-foreground">
            {shareUrl}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => window.open(`/v/${video.id}`, '_blank')} className="gap-2">
              <ExternalLink className="h-4 w-4" /> {t('media.open')}
            </Button>
            <Button variant="outline" onClick={handleCopy} className="gap-2">
              <Copy className="h-4 w-4" /> {t('media.copyLink')}
            </Button>
            <Button onClick={handleNativeShare} className="gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
              <Send className="h-4 w-4" /> {t('media.shareEllipsis')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
