import { ExternalLink, Link2, PlayCircle } from 'lucide-react';
import { getDomain, getEmbedUrl, isDirectVideoFile } from '@/lib/proZoneCategories';
import { SignedGolfMediaImg, SignedGolfMediaVideo } from '@/components/SignedGolfMedia';

/** Friendly platform label for known hosts (used on external preview cards). */
function platformLabel(url: string): string {
  const d = getDomain(url).toLowerCase();
  if (d.includes('instagram.com')) return 'Instagram';
  if (d.includes('tiktok.com')) return 'TikTok';
  if (d.includes('youtube.com') || d === 'youtu.be') return 'YouTube';
  if (d.includes('vimeo.com')) return 'Vimeo';
  return d || 'External link';
}

interface Props {
  fileType: 'image' | 'video' | 'link';
  fileUrl: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  /** Aspect ratio for the player container. Defaults to 16/9 for videos, 4/3 for images. */
  aspectRatio?: string;
  /** When true, image is rendered (only used by inline grid; lightbox is handled outside). */
  imageAsImg?: boolean;
}

/**
 * Renders the right "viewer" for a Pro Zone media item:
 * - YouTube/Vimeo video → embedded iframe
 * - Direct video file (mp4/mov/webm) → native <video controls>
 * - External video link we can't embed → clickable preview card
 * - link → clickable preview card
 * - image → <img> (when imageAsImg=true) or button-less plain img
 */
export function ProZoneMediaPlayer({
  fileType,
  fileUrl,
  thumbnailUrl,
  title,
  aspectRatio,
  imageAsImg = true,
}: Props) {
  const ratio = aspectRatio ?? (fileType === 'image' ? '4 / 3' : '16 / 9');

  if (fileType === 'video') {
    const embed = getEmbedUrl(fileUrl);
    if (embed) {
      return (
        <div className="relative w-full bg-black/40" style={{ aspectRatio: ratio }}>
          <iframe
            src={embed}
            title={title ?? 'Pro Zone video'}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      );
    }
    if (isDirectVideoFile(fileUrl)) {
      return (
        <div className="relative w-full bg-black/40" style={{ aspectRatio: ratio }}>
          <SignedGolfMediaVideo
            src={fileUrl}
            poster={thumbnailUrl ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="w-full h-full object-contain"
          />
        </div>
      );
    }
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative w-full bg-gradient-to-br from-gold-accent/15 to-black/50 flex flex-col items-center justify-center gap-2 p-6 hover:from-gold-accent/25 transition-colors group"
        style={{ aspectRatio: ratio }}
      >
        {thumbnailUrl ? (
          <SignedGolfMediaImg
            src={thumbnailUrl}
            alt={title ?? 'Video preview'}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
          />
        ) : null}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <PlayCircle className="h-10 w-10 text-gold-accent drop-shadow-lg" />
          <p className="text-ivory text-xs font-semibold uppercase tracking-wide">
            Watch on {platformLabel(fileUrl)}
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] text-ivory/70 group-hover:text-ivory">
            Open <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </a>
    );
  }

  if (fileType === 'link') {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative w-full bg-gradient-to-br from-gold-accent/10 to-black/40 flex flex-col items-center justify-center gap-2 p-6 hover:from-gold-accent/20 transition-colors group"
        style={{ aspectRatio: ratio }}
      >
        <Link2 className="h-7 w-7 text-gold-accent" />
        <p className="text-ivory/80 text-xs font-medium uppercase tracking-wide">
          {getDomain(fileUrl) || 'External link'}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-ivory/60 group-hover:text-ivory">
          Open <ExternalLink className="h-3 w-3" />
        </span>
      </a>
    );
  }

  // image
  if (!imageAsImg) return null;
  return (
    <div className="relative w-full bg-black/30" style={{ aspectRatio: ratio }}>
      <SignedGolfMediaImg
        src={fileUrl}
        alt={title ?? 'Pro Zone media'}
        loading="lazy"
        className="w-full h-full object-contain"
      />
    </div>
  );
}