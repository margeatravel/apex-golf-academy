import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import * as tus from 'tus-js-client';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  category: string;
  nextSortOrder: number;
  onUploaded: () => void;
}

interface PendingItem {
  id: string;
  file: File;
  title: string;
  caption: string;
  proName: string;
  preview: string;
  fileType: 'image' | 'video';
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
}

// 2GB cap — large enough for long mobile screen recordings.
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
// Files larger than this go through resumable (TUS) upload; smaller use direct upload.
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024; // 6MB
// Skip client-side poster extraction for very large videos to keep mobile memory safe.
const POSTER_MAX_BYTES = 150 * 1024 * 1024;
// How many files to upload in parallel.
const UPLOAD_CONCURRENCY = 3;

const VIDEO_EXTS = [
  'mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'mpeg', 'mpg', '3gp', '3g2',
  'ogv', 'ogg', 'wmv', 'flv', 'ts', 'mts', 'm2ts', 'qt', 'hevc', 'avchd',
];
const IMAGE_EXTS = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'heic', 'heif', 'avif',
];

const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;

/**
 * Resumable upload via TUS — survives flaky mobile networks, supports large files,
 * and reports real byte-level progress.
 */
async function tusUpload(opts: {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');
  if (!SUPABASE_URL) throw new Error('Storage endpoint not configured');

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // 6MB chunks — safe for mobile networks and within Supabase limits.
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.contentType,
        cacheControl: '3600',
      },
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        if (total > 0) opts.onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });
    // Resume any prior interrupted upload of the same file.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }).catch(() => upload.start());
  });
}

/**
 * Capture the first frame of a video file as a JPEG Blob, client-side.
 * Returns null on any error (CORS, decode failure, unsupported codec) so callers
 * can silently fall back to no thumbnail.
 */
async function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.src = url;

      const cleanup = () => URL.revokeObjectURL(url);
      const fail = () => {
        cleanup();
        resolve(null);
      };

      video.onloadedmetadata = () => {
        // Seek a tiny bit in so we don't get a blank first frame
        try {
          video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
        } catch {
          fail();
        }
      };
      video.onseeked = () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return fail();
          // Cap poster size to keep it small
          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return fail();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              resolve(blob);
            },
            'image/jpeg',
            0.8
          );
        } catch {
          fail();
        }
      };
      video.onerror = fail;
      // Safety timeout
      setTimeout(fail, 8000);
    } catch {
      resolve(null);
    }
  });
}

/** Drag-and-drop uploader for one Pro Zone category. */
export function ProZoneMediaUploader({ category, nextSortOrder, onUploaded }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groupImages, setGroupImages] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid: PendingItem[] = [];
    for (const f of arr) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} exceeds 200MB limit`);
        continue;
      }
      const ext = getExt(f.name);
      const mime = (f.type || '').toLowerCase();
      const isImage = mime.startsWith('image/') || IMAGE_EXTS.includes(ext);
      // Accept any video/* MIME OR any known video extension OR unknown MIME with video-like ext
      const isVideo =
        mime.startsWith('video/') ||
        VIDEO_EXTS.includes(ext) ||
        (!mime && VIDEO_EXTS.includes(ext));
      if (!isImage && !isVideo) {
        toast.error(`${f.name}: unsupported file type`);
        continue;
      }
      valid.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        title: '',
        caption: '',
        proName: '',
        preview: URL.createObjectURL(f),
        fileType: isImage ? 'image' : 'video',
        status: 'idle',
        progress: 0,
      });
    }
    setItems((prev) => [...prev, ...valid]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, patch: Partial<PendingItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const uploadOne = async (item: PendingItem, order: number): Promise<boolean> => {
    updateItem(item.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      const ext = item.file.name.split('.').pop() || 'bin';
      const path = `pro-zone/${category}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const contentType = item.file.type || (item.fileType === 'video' ? 'video/mp4' : 'image/jpeg');

      if (item.file.size > RESUMABLE_THRESHOLD) {
        // Large file → resumable TUS upload with real progress.
        await tusUpload({
          bucket: 'golf-media',
          path,
          file: item.file,
          contentType,
          onProgress: (pct) => updateItem(item.id, { progress: pct }),
        });
      } else {
        // Small file → direct upload (fast path).
        const { error: upErr } = await supabase.storage
          .from('golf-media')
          .upload(path, item.file, { upsert: false, contentType });
        if (upErr) throw upErr;
        updateItem(item.id, { progress: 95 });
      }

      const { data: pub } = supabase.storage.from('golf-media').getPublicUrl(path);

      // Best-effort poster for videos. Skipped on huge files to protect mobile memory.
      let thumbnailUrl: string | null = null;
      if (item.fileType === 'video' && item.file.size <= POSTER_MAX_BYTES) {
        const poster = await captureVideoPoster(item.file);
        if (poster) {
          const posterPath = `pro-zone/${category}/posters/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}.jpg`;
          const { error: pErr } = await supabase.storage
            .from('golf-media')
            .upload(posterPath, poster, { upsert: false, contentType: 'image/jpeg' });
          if (!pErr) {
            const { data: pPub } = supabase.storage.from('golf-media').getPublicUrl(posterPath);
            thumbnailUrl = pPub.publicUrl;
          }
        }
      }

      const { error: dbErr } = await supabase.from('pro_zone_media').insert({
        category,
        title: item.title.trim() || null,
        caption: item.caption.trim() || null,
        file_url: pub.publicUrl,
        file_type: item.fileType,
        thumbnail_url: thumbnailUrl,
        sort_order: order,
        uploaded_by: user!.id,
        pro_name: category === 'tour_pros' ? (item.proName.trim() || null) : null,
      } as any);
      if (dbErr) throw dbErr;

      updateItem(item.id, { status: 'done', progress: 100 });
      return true;
    } catch (e: any) {
      const msg = e?.message ?? 'unknown error';
      updateItem(item.id, { status: 'error', error: msg });
      toast.error(`${item.file.name}: ${msg}`);
      return false;
    }
  };

  /**
   * Uploads N image files and inserts a single grouped `pro_zone_media` row
   * whose `gallery_urls` array holds every uploaded photo. Card thumbnail
   * uses the first image.
   */
  const uploadGroupedImages = async (
    groupItems: PendingItem[],
    order: number,
  ): Promise<number> => {
    const meta = groupItems[0];
    groupItems.forEach((it) =>
      updateItem(it.id, { status: 'uploading', progress: 0, error: undefined }),
    );
    try {
      const urls: string[] = [];
      for (const it of groupItems) {
        const ext = it.file.name.split('.').pop() || 'jpg';
        const path = `pro-zone/${category}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const contentType = it.file.type || 'image/jpeg';
        if (it.file.size > RESUMABLE_THRESHOLD) {
          await tusUpload({
            bucket: 'golf-media',
            path,
            file: it.file,
            contentType,
            onProgress: (pct) => updateItem(it.id, { progress: pct }),
          });
        } else {
          const { error: upErr } = await supabase.storage
            .from('golf-media')
            .upload(path, it.file, { upsert: false, contentType });
          if (upErr) throw upErr;
          updateItem(it.id, { progress: 95 });
        }
        const { data: pub } = supabase.storage.from('golf-media').getPublicUrl(path);
        urls.push(pub.publicUrl);
        updateItem(it.id, { progress: 100 });
      }
      const { error: dbErr } = await supabase.from('pro_zone_media').insert({
        category,
        title: meta.title.trim() || null,
        caption: meta.caption.trim() || null,
        file_url: urls[0],
        gallery_urls: urls,
        file_type: 'image',
        thumbnail_url: null,
        sort_order: order,
        uploaded_by: user!.id,
        pro_name: category === 'tour_pros' ? (meta.proName.trim() || null) : null,
      } as any);
      if (dbErr) throw dbErr;
      groupItems.forEach((it) => updateItem(it.id, { status: 'done', progress: 100 }));
      return groupItems.length;
    } catch (e: any) {
      const msg = e?.message ?? 'unknown error';
      groupItems.forEach((it) => updateItem(it.id, { status: 'error', error: msg }));
      toast.error(`Grouped post: ${msg}`);
      return 0;
    }
  };

  const handleUploadAll = async () => {
    if (!user) return;
    const queue = items.filter((i) => i.status !== 'done');
    if (queue.length === 0) return;
    setSubmitting(true);

    let order = nextSortOrder;
    let succeeded = 0;

    const images = queue.filter((i) => i.fileType === 'image');
    const singles: PendingItem[] = queue.filter((i) => i.fileType !== 'image');
    if (groupImages && images.length >= 2) {
      succeeded += await uploadGroupedImages(images, order++);
    } else {
      singles.push(...images);
    }
    const assignments: { item: PendingItem; order: number }[] = singles.map((it) => ({
      item: it,
      order: order++,
    }));
    let cursor = 0;
    const worker = async () => {
      while (cursor < assignments.length) {
        const idx = cursor++;
        const { item, order: ord } = assignments[idx];
        const ok = await uploadOne(item, ord);
        if (ok) succeeded++;
      }
    };
    if (assignments.length > 0) {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, assignments.length) }, () => worker()),
      );
    }

    setSubmitting(false);
    if (succeeded > 0) {
      toast.success(`Uploaded ${succeeded} item${succeeded === 1 ? '' : 's'}`);
      // Remove only the successfully uploaded items; keep failures so user can retry.
      setItems((prev) => {
        const remaining = prev.filter((i) => i.status !== 'done');
        prev.forEach((i) => {
          if (i.status === 'done') URL.revokeObjectURL(i.preview);
        });
        return remaining;
      });
      setGroupImages(false);
      onUploaded();
    }
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={onDrop}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-gold-accent bg-gold-accent/5'
            : 'border-white/15 hover:border-white/30 bg-white/[0.02]'
        }`}
      >
        <Upload className="h-6 w-6 mx-auto text-ivory/50 mb-2" />
        <p className="text-ivory/80 text-sm font-medium">Drop files here or click to browse</p>
        <p className="text-ivory/40 text-[11px] mt-1">
          Images and videos · up to 2GB each · resumable uploads
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,.mkv,.mov,.m4v,.avi,.mpeg,.mpg,.3gp,.ogv,.wmv,.flv,.ts,.mts,.m2ts,.hevc,.heic,.heif,.avif"
          multiple
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.filter((i) => i.fileType === 'image').length >= 2 && (
            <label className="flex items-center gap-2 glass-card px-3 py-2 cursor-pointer select-none">
              <Checkbox
                checked={groupImages}
                onCheckedChange={(v) => setGroupImages(v === true)}
                disabled={submitting}
              />
              <span className="text-xs text-ivory/80">
                Agrupar fotos como un solo post (carrusel)
                <span className="text-ivory/40 ml-1">
                  · usa título/caption de la primera foto · los videos suben individualmente
                </span>
              </span>
            </label>
          )}
          {items.map((item) => (
            <div key={item.id} className="glass-card p-3 flex gap-3 items-start">
              {item.fileType === 'image' ? (
                <img
                  src={item.preview}
                  alt=""
                  className="h-20 w-20 object-cover rounded-lg flex-shrink-0 bg-black/30"
                />
              ) : (
                <video
                  src={item.preview}
                  className="h-20 w-20 object-cover rounded-lg flex-shrink-0 bg-black/30"
                  muted
                />
              )}
              <div className="flex-1 space-y-1.5 min-w-0">
                {category === 'tour_pros' && (
                  <Input
                    value={item.proName}
                    onChange={(e) => updateItem(item.id, { proName: e.target.value })}
                    placeholder="Pro name (e.g. Rory McIlroy)"
                    className="h-8 text-xs bg-gold-accent/5 border-gold-accent/20 text-ivory placeholder:text-gold-accent/50"
                  />
                )}
                <Input
                  value={item.title}
                  onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  placeholder="Title (optional)"
                  className="h-8 text-xs bg-white/5 border-white/10 text-ivory"
                />
                <Textarea
                  value={item.caption}
                  onChange={(e) => updateItem(item.id, { caption: e.target.value })}
                  placeholder="Caption (optional)"
                  rows={2}
                  className="text-xs bg-white/5 border-white/10 text-ivory min-h-0"
                />
                {item.status !== 'idle' && (
                  <div className="pt-1">
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          item.status === 'error'
                            ? 'bg-red-500'
                            : item.status === 'done'
                              ? 'bg-emerald-500'
                              : 'bg-gold-accent'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-ivory/60">
                      {item.status === 'uploading' && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading {item.progress}% · {(item.file.size / 1024 / 1024).toFixed(1)}MB
                        </>
                      )}
                      {item.status === 'done' && (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Uploaded
                        </>
                      )}
                      {item.status === 'error' && (
                        <>
                          <AlertCircle className="h-3 w-3 text-red-400" />
                          {item.error || 'Upload failed — tap Upload to retry'}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="text-ivory/40 hover:text-red-400 p-1"
                aria-label="Remove"
                disabled={item.status === 'uploading'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            onClick={handleUploadAll}
            disabled={submitting}
            className="w-full bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading…
              </>
            ) : (
              <>Upload {items.length} item{items.length === 1 ? '' : 's'}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}