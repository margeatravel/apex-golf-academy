import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Image as ImageIcon, GitCompare, Trophy, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { isDirectVideoFile } from '@/lib/proZoneCategories';
import { Button } from '@/components/ui/button';
import { ProZoneMediaPlayer } from '@/components/ProZoneMediaPlayer';
import { SignedGolfMediaImg } from '@/components/SignedGolfMedia';
import { useLanguage } from '@/contexts/LanguageContext';

export interface ProZoneMediaItem {
  id: string;
  title: string | null;
  caption: string | null;
  file_url: string;
  file_type: 'image' | 'video' | 'link';
  thumbnail_url: string | null;
  pro_name?: string | null;
  /** When set (2+ urls), item renders as a carousel post; first url is the cover. */
  gallery_urls?: string[] | null;
}

interface Props {
  items: ProZoneMediaItem[];
  /** When provided, renders a "Compare" CTA on each video card. */
  onCompare?: (item: ProZoneMediaItem) => void;
  /** Label for the compare button. */
  compareLabel?: string;
}

/** Responsive grid of Pro Zone media. Videos play inline; images open in a lightbox. */
export function ProZoneMediaGrid({ items, onCompare, compareLabel }: Props) {
  const { t } = useLanguage();
  const resolvedCompareLabel = compareLabel ?? t('prozone.compareWithMySwing');
  const [lightbox, setLightbox] = useState<ProZoneMediaItem | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const openLightbox = (item: ProZoneMediaItem) => {
    setLightbox(item);
    setLightboxIdx(0);
  };

  const galleryOf = (item: ProZoneMediaItem): string[] => {
    const g = (item.gallery_urls ?? []).filter(Boolean);
    return g.length > 1 ? g : [item.file_url];
  };

  if (items.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div
          className="h-12 w-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <ImageIcon className="h-5 w-5 text-ivory/40" />
        </div>
        <p className="text-ivory/60 text-sm">
          {t('prozone.noCoachContentYet')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="glass-card overflow-hidden flex flex-col"
          >
            {item.file_type === 'image' ? (
              <button
                type="button"
                onClick={() => openLightbox(item)}
                className="relative w-full bg-black/30 group"
                style={{ aspectRatio: '4 / 3' }}
                aria-label={item.title ?? t('prozone.openImage')}
              >
                <SignedGolfMediaImg
                  src={item.file_url}
                  alt={item.title ?? t('prozone.proZoneMediaAlt')}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                />
                {(item.gallery_urls?.length ?? 0) > 1 && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-ivory">
                    <Images className="h-3 w-3" /> {item.gallery_urls!.length}
                  </span>
                )}
              </button>
            ) : (
              <ProZoneMediaPlayer
                fileType={item.file_type}
                fileUrl={item.file_url}
                thumbnailUrl={item.thumbnail_url}
                title={item.title}
              />
            )}
            {(item.title || item.caption || item.pro_name || onCompare) && (
              <div className="p-3 space-y-2">
                {item.pro_name && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-gold-accent bg-gold-accent/10 border border-gold-accent/20 rounded-full px-2 py-0.5">
                    <Trophy className="h-3 w-3" /> {item.pro_name}
                  </span>
                )}
                {item.title && (
                  <p className="text-ivory text-sm font-medium leading-tight">{item.title}</p>
                )}
                {item.caption && (
                  <p className="text-ivory/60 text-xs leading-snug">{item.caption}</p>
                )}
                {onCompare && item.file_type === 'video' && (
                  isDirectVideoFile(item.file_url) ? (
                    <Button
                      size="sm"
                      onClick={() => onCompare(item)}
                      className="w-full h-8 text-xs bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-1.5"
                    >
                      <GitCompare className="h-3.5 w-3.5" /> {resolvedCompareLabel}
                    </Button>
                  ) : (
                    <p className="text-[10px] text-ivory/40 italic text-center pt-1">
                      {t('prozone.compareRequiresDirect')}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl bg-black/95 border-white/10 p-2">
          {lightbox && (
            (() => {
              const gallery = galleryOf(lightbox);
              const idx = Math.min(lightboxIdx, gallery.length - 1);
              const currentUrl = gallery[idx];
              const hasMany = gallery.length > 1;
              return (
            <div className="space-y-2">
              <div className="relative">
                <SignedGolfMediaImg
                  key={currentUrl}
                  src={currentUrl}
                  alt={lightbox.title ?? t('prozone.proZoneMediaAlt')}
                  className="w-full h-auto max-h-[80vh] object-contain rounded"
                />
                {hasMany && (
                  <>
                    <button
                      type="button"
                      aria-label={t('prozone.previous')}
                      onClick={() => setLightboxIdx((i) => (i - 1 + gallery.length) % gallery.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-ivory flex items-center justify-center"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('prozone.next')}
                      onClick={() => setLightboxIdx((i) => (i + 1) % gallery.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-ivory flex items-center justify-center"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1">
                      {gallery.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all ${
                            i === idx ? 'w-4 bg-ivory' : 'w-1.5 bg-ivory/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {(lightbox.title || lightbox.caption) && (
                <div className="px-2 pb-2">
                  {lightbox.title && (
                    <p className="text-ivory text-sm font-medium">{lightbox.title}</p>
                  )}
                  {lightbox.caption && (
                    <p className="text-ivory/60 text-xs mt-0.5">{lightbox.caption}</p>
                  )}
                </div>
              )}
            </div>
              );
            })()
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}