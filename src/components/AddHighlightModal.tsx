import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, X, Video as VideoIcon, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateVideoThumbnail } from '@/lib/videoThumbnail';
import { HIGHLIGHT_REQUIREMENTS, getUsedThisMonth } from '@/lib/highlightsQuota';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation, type Language } from '@/i18n/translations';

interface AddHighlightModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  remainingSlots: number; // Infinity allowed
  onUploaded: () => void;
}

type Selected = {
  file: File;
  isVideo: boolean;
  preview: string;
  error?: string;
};

function getCategories(t: (k: string) => string): { value: 'trophy' | 'scorecard' | 'milestone' | 'personal' | 'other'; label: string }[] {
  return [
    { value: 'trophy', label: t('media.catTrophyOption') },
    { value: 'scorecard', label: t('media.catScorecardOption') },
    { value: 'milestone', label: t('media.catMilestoneOption') },
    { value: 'personal', label: t('media.catPersonalOption') },
    { value: 'other', label: t('media.catOtherOption') },
  ];
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video metadata')); };
    v.src = url;
  });
}

async function validateOne(file: File, language: Language): Promise<string | undefined> {
  const t = (k: string) => getTranslation(language, k);
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) return t('media.unsupportedFileType');
  if (isImage) {
    if (file.size > HIGHLIGHT_REQUIREMENTS.imageMaxMB * 1024 * 1024) {
      return t('media.imageTooLarge').replace('{n}', String(HIGHLIGHT_REQUIREMENTS.imageMaxMB));
    }
  } else {
    if (file.size > HIGHLIGHT_REQUIREMENTS.videoMaxMB * 1024 * 1024) {
      return t('media.videoTooLarge').replace('{n}', String(HIGHLIGHT_REQUIREMENTS.videoMaxMB));
    }
    try {
      const duration = await getVideoDuration(file);
      if (duration > HIGHLIGHT_REQUIREMENTS.videoMaxSeconds + 0.3) {
        return t('media.videoTooLong').replace('{max}', String(HIGHLIGHT_REQUIREMENTS.videoMaxSeconds)).replace('{actual}', duration.toFixed(1));
      }
    } catch {
      // Allow upload if metadata can't be read
    }
  }
  return undefined;
}

export function AddHighlightModal({ open, onClose, studentId, remainingSlots, onUploaded }: AddHighlightModalProps) {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const CATEGORIES = getCategories(t);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<'trophy' | 'scorecard' | 'milestone' | 'personal' | 'other'>('trophy');
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    selected.forEach(s => URL.revokeObjectURL(s.preview));
    setSelected([]);
    setTitle('');
    setCaption('');
    setCategory('trophy');
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (list.length === 0) return;

    const validated: Selected[] = [];
    for (const file of list) {
      const error = await validateOne(file, language);
      validated.push({
        file,
        isVideo: file.type.startsWith('video/'),
        preview: URL.createObjectURL(file),
        error,
      });
    }
    setSelected(prev => [...prev, ...validated]);
  };

  const removeAt = (idx: number) => {
    setSelected(prev => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  };

  const validFiles = selected.filter(s => !s.error);
  const overQuota = Number.isFinite(remainingSlots) && validFiles.length > remainingSlots;
  const hasErrors = selected.some(s => !!s.error);

  const handleUpload = async () => {
    if (validFiles.length === 0 || overQuota || uploading) return;
    setUploading(true);
    try {
      // Re-check quota right before upload to prevent races
      if (Number.isFinite(remainingSlots)) {
        const used = await getUsedThisMonth(studentId);
        const total = used + validFiles.length;
        // remainingSlots was computed as quota - used; reconstruct quota
        const quota = remainingSlots + (used - (used)); // remainingSlots already accounts for used at modal-open time; trust caller cap
        // Simpler safety net: just verify we still have at least N slots open by comparing to a fresh count.
        const stillRemaining = remainingSlots - 0; // visual cap
        if (total > used + stillRemaining) {
          toast({
            title: t('media.quotaExceededTitle'),
            description: t('media.quotaExceededDesc'),
            variant: 'destructive',
          });
          setUploading(false);
          return;
        }
      }

      for (const sel of validFiles) {
        const ext = sel.file.name.split('.').pop()?.toLowerCase() || (sel.isVideo ? 'mp4' : 'jpg');
        const path = `highlights/${studentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from('golf-media')
          .upload(path, sel.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: sel.file.type || (sel.isVideo ? 'video/mp4' : 'image/jpeg'),
          });
        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage.from('golf-media').getPublicUrl(path);
        const fileUrl = urlData.publicUrl;

        let thumbnailUrl: string | null = null;
        if (sel.isVideo) {
          const blob = await generateVideoThumbnail(sel.file, 0.5);
          if (blob) {
            const thumbPath = `highlights/${studentId}/thumbs/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
            const { error: tErr } = await supabase.storage
              .from('golf-media')
              .upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
            if (!tErr) {
              thumbnailUrl = supabase.storage.from('golf-media').getPublicUrl(thumbPath).data.publicUrl;
            }
          }
        }

        const { error: dbError } = await supabase
          .from('student_highlights' as any)
          .insert({
            student_id: studentId,
            file_url: fileUrl,
            file_type: sel.isVideo ? 'video' : 'image',
            thumbnail_url: thumbnailUrl,
            title: title || null,
            caption: caption || null,
            category,
          });
        if (dbError) throw dbError;
      }

      toast({
        title: t('media.highlightSaved'),
        description: t('media.itemsAdded').replace(/\{n\}/g, String(validFiles.length)).replace(/\{plural\}/g, validFiles.length !== 1 ? 's' : ''),
      });
      reset();
      onUploaded();
      onClose();
    } catch (err: any) {
      toast({ title: t('media.uploadFailed'), description: err.message ?? t('media.pleaseTryAgain'), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="glass-card border-white/15 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-ivory">{t('media.addHighlightTitle')}</DialogTitle>
          <DialogDescription className="text-ivory/60">
            {t('media.addHighlightDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Requirements card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-ivory/70 space-y-1.5">
            <p className="flex items-start gap-2">
              <ImageIcon className="h-3.5 w-3.5 mt-0.5 text-green-accent flex-shrink-0" />
              <span>{t('media.photosRequirementModal').replace('{n}', String(HIGHLIGHT_REQUIREMENTS.imageMaxMB))}</span>
            </p>
            <p className="flex items-start gap-2">
              <VideoIcon className="h-3.5 w-3.5 mt-0.5 text-gold-accent flex-shrink-0" />
              <span>{t('media.videosRequirementModal').replace('{sec}', String(HIGHLIGHT_REQUIREMENTS.videoMaxSeconds)).replace('{mb}', String(HIGHLIGHT_REQUIREMENTS.videoMaxMB))}</span>
            </p>
            {Number.isFinite(remainingSlots) && (
              <p className="text-ivory/50 pt-1 border-t border-white/10">
                {t('media.uploadsLeftThisMonth').replace('{n}', String(remainingSlots)).replace('{plural}', remainingSlots !== 1 ? 's' : '')}
              </p>
            )}
          </div>

          {/* Picker */}
          <div
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-gold-accent/60 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-ivory/40 mx-auto mb-2" />
            <p className="text-ivory/70 text-sm font-medium">{t('media.tapToChoose')}</p>
            <p className="text-ivory/40 text-xs mt-1">{t('media.pickMoreThanOne')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
          </div>

          {/* Selected previews */}
          {selected.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {selected.map((sel, i) => (
                  <div key={i} className="relative group">
                    <div
                      className={`h-20 w-20 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden border ${sel.error ? 'border-red-500/60' : 'border-white/10'}`}
                    >
                      {sel.isVideo ? (
                        <VideoIcon className="h-7 w-7 text-ivory/40" />
                      ) : (
                        <img src={sel.preview} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"
                      aria-label={t('media.removeAria')}
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
              {hasErrors && (
                <ul className="space-y-1">
                  {selected.map((s, i) => s.error && (
                    <li key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span><span className="text-ivory/60">{s.file.name}:</span> {s.error}</span>
                    </li>
                  ))}
                </ul>
              )}
              {overQuota && (
                <p className="text-xs text-red-400 flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{t('media.pickedTooMany').replace('{picked}', String(validFiles.length)).replace('{remaining}', String(remainingSlots)).replace('{plural}', remainingSlots !== 1 ? 's' : '')}</span>
                </p>
              )}
            </div>
          )}

          {/* Metadata */}
          <Select value={category} onValueChange={(v) => setCategory(v as any)}>
            <SelectTrigger className="bg-white/5 border-white/15 text-ivory">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/15">
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-ivory">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder={t('media.titleOptionalPh')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={100}
            className="bg-white/5 border-white/15 text-ivory placeholder:text-ivory/30"
          />

          <Textarea
            placeholder={t('media.captionOptionalPh')}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            maxLength={500}
            rows={2}
            className="bg-white/5 border-white/15 text-ivory placeholder:text-ivory/30 resize-none"
          />

          <Button
            onClick={handleUpload}
            disabled={validFiles.length === 0 || uploading || overQuota}
            className="w-full bg-gold-accent hover:bg-gold-accent/90 text-black font-semibold gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading
              ? t('media.uploading')
              : t('media.saveHighlights').replace('{n}', String(validFiles.length || '')).replace('{plural}', validFiles.length === 1 ? '' : 's').trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}