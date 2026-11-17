import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Play, Image, X } from 'lucide-react';
import { format } from 'date-fns';
import { formatLessonDate } from '@/lib/formatLessonDateTime';
import { SignedGolfMediaImg, SignedGolfMediaVideo } from '@/components/SignedGolfMedia';

interface MediaItem {
  id: string;
  file_url: string;
  file_type: string;
  title: string | null;
  is_general: boolean;
  uploaded_at: string;
  thumbnail_url: string | null;
  lesson_id: string | null;
  lessons?: { lesson_date: string; lesson_type: string } | null;
}

interface MediaGalleryProps {
  items: MediaItem[];
  emptyMessage?: string;
}

export function MediaGallery({ items, emptyMessage = 'No media yet' }: MediaGalleryProps) {
  const [viewItem, setViewItem] = useState<MediaItem | null>(null);

  if (items.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Image className="h-12 w-12 text-ivory/20 mx-auto mb-3" />
        <p className="text-ivory/50 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(item => (
          <div
            key={item.id}
            className="glass-card overflow-hidden cursor-pointer group hover:border-green-accent/30 transition-colors"
            onClick={() => setViewItem(item)}
          >
            {/* Thumbnail */}
            <div className="aspect-square bg-black/30 relative overflow-hidden">
              {item.file_type === 'video' ? (
                <>
                  {item.thumbnail_url ? (
                    <SignedGolfMediaImg src={item.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="h-10 w-10 text-ivory/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <Play className="h-5 w-5 text-ivory ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </>
              ) : (
                <SignedGolfMediaImg src={item.file_url} alt={item.title || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              )}
            </div>

            {/* Info */}
            <div className="p-2.5 space-y-1">
              {item.title && (
                <p className="text-ivory text-xs font-medium truncate">{item.title}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-ivory/40 text-[10px]">
                  {format(new Date(item.uploaded_at), 'MMM dd, yyyy')}
                </span>
                <Badge className={
                  item.is_general
                    ? 'bg-ivory/10 text-ivory/60 border-ivory/20 text-[10px] px-1.5 py-0'
                    : 'bg-green-accent/20 text-green-accent border-green-accent/30 text-[10px] px-1.5 py-0'
                }>
                  {item.is_general ? 'General' : (item.lessons ? item.lessons.lesson_type : 'Class')}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen viewer */}
      <Dialog open={!!viewItem} onOpenChange={(o) => { if (!o) setViewItem(null); }}>
        <DialogContent className="max-w-4xl bg-black/95 border-white/10 p-0">
          {viewItem && (
            <div className="relative">
              {/* Close button */}
              <button
                onClick={() => setViewItem(null)}
                className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"
              >
                <X className="h-4 w-4 text-white" />
              </button>

              {viewItem.file_type === 'video' ? (
                <SignedGolfMediaVideo
                  src={viewItem.file_url}
                  controls
                  autoPlay
                  className="w-full max-h-[80vh] object-contain"
                />
              ) : (
                <SignedGolfMediaImg
                  src={viewItem.file_url}
                  alt={viewItem.title || ''}
                  className="w-full max-h-[80vh] object-contain"
                />
              )}

              {/* Bottom info bar */}
              <div className="p-4 space-y-1">
                {viewItem.title && (
                  <p className="text-ivory font-medium">{viewItem.title}</p>
                )}
                <div className="flex items-center gap-3 text-ivory/50 text-sm">
                  <span>{format(new Date(viewItem.uploaded_at), 'MMM dd, yyyy')}</span>
                  <Badge className={
                    viewItem.is_general
                      ? 'bg-ivory/10 text-ivory/60 border-ivory/20'
                      : 'bg-green-accent/20 text-green-accent border-green-accent/30'
                  }>
                    {viewItem.is_general ? 'General' : (viewItem.lessons
                      ? `${viewItem.lessons.lesson_type} — ${formatLessonDate({ lesson_date: viewItem.lessons.lesson_date }, 'monthDay')}`
                      : 'Linked to class'
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
