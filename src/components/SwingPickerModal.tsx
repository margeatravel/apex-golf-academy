import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isDirectVideoFile } from '@/lib/proZoneCategories';
import { Loader2, Trophy, Video, VideoOff, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SignedMediaImg } from '@/components/SignedMedia';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useLanguage } from '@/contexts/LanguageContext';

export interface PickItem {
  id: string;
  title: string;
  file_url: string;
  thumbnail_url: string | null;
  pro_name?: string | null;
  /** 'own' = student's own upload (videos); 'class' = coach-uploaded class video (student_media). */
  source?: 'own' | 'class';
  date?: string;
}

function VideoThumb({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  const signed = useSignedMediaUrl(src);

  if (errored) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/60">
        <VideoOff className="h-6 w-6 text-ivory/40" />
      </div>
    );
  }

  return (
    <video
      src={signed ?? undefined}
      aria-label={alt}
      className="w-full h-full object-cover object-center"
      style={{ backgroundColor: '#111', zIndex: 0, position: 'relative', width: '100%', height: '100%', objectFit: 'cover' }}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      crossOrigin="anonymous"
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        v.currentTime = 0;
        v.play().catch(() => {});
      }}
      onCanPlay={(e) => {
        const v = e.currentTarget;
        v.play().catch(() => {});
      }}
      onError={() => setErrored(true)}
    />
  );
}

interface Props {
  open: boolean;
  source: 'tour_pros' | 'mine';
  onClose: () => void;
  onPick: (id: string, item?: PickItem) => void;
}

/** Reusable picker for either Tour Pro media or the student's own swing videos. */
export function SwingPickerModal({ open, source, onClose, onPick }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const { data: proItems, isLoading: loadingPros } = useQuery({
    queryKey: ['compare-picker-pros'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('id, title, file_url, thumbnail_url, pro_name')
        .eq('category', 'tour_pros')
        .eq('file_type', 'video')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((m) => isDirectVideoFile(m.file_url))
        .map((m) => {
          console.log('[SwingPickerModal] Tour pro object:', m);
          return {
            id: m.id,
            title: m.title || 'Untitled',
            file_url: m.file_url,
            thumbnail_url: m.thumbnail_url,
            pro_name: m.pro_name,
          };
        }) as PickItem[];
    },
    enabled: open && source === 'tour_pros',
  });

  const { data: myItems, isLoading: loadingMine } = useQuery({
    queryKey: ['compare-picker-mine', user?.id],
    queryFn: async () => {
      // Own uploads (videos table) + class videos the coach uploaded
      // for this student (student_media) — same two sources as Mis Videos.
      const [{ data: vids, error: vErr }, { data: media, error: mErr }] = await Promise.all([
        supabase
          .from('videos')
          .select('id, title, file_url, thumbnail_url, file_type, upload_date')
          .eq('student_id', user!.id)
          .eq('file_type', 'video')
          .order('upload_date', { ascending: false }),
        supabase
          .from('student_media' as any)
          .select('id, title, file_url, thumbnail_url, file_type, uploaded_at')
          .eq('student_id', user!.id)
          .order('uploaded_at', { ascending: false }),
      ]);
      if (vErr) throw vErr;
      if (mErr) throw mErr;
      const own: PickItem[] = ((vids ?? []) as any[])
        .filter((v) => isDirectVideoFile(v.file_url))
        .map((v) => ({
          id: v.id,
          title: v.title,
          file_url: v.file_url,
          thumbnail_url: v.thumbnail_url,
          source: 'own' as const,
          date: v.upload_date as string,
        }));
      const fromClass: PickItem[] = ((media ?? []) as any[])
        .filter((m) => isDirectVideoFile(m.file_url))
        .map((m) => ({
          id: m.id,
          title: m.title || 'Media',
          file_url: m.file_url,
          thumbnail_url: m.thumbnail_url,
          source: 'class' as const,
          date: m.uploaded_at as string,
        }));
      return [...own, ...fromClass].sort(
        (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
      );
    },
    enabled: open && source === 'mine' && !!user,
  });

  const items = source === 'tour_pros' ? proItems : myItems;
  const loading = source === 'tour_pros' ? loadingPros : loadingMine;

  const filteredItems = useMemo(() => {
    if (!items) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.pro_name ?? ''} ${it.title ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearch(''); onClose(); } }}>
      <DialogContent className="bg-zinc-950 border-white/10 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-ivory flex items-center gap-2">
            {source === 'tour_pros' ? (
              <><Trophy className="h-4 w-4 text-gold-accent" /> {t('media.pickTourProSwing')}</>
            ) : (
              <><Video className="h-4 w-4 text-green-accent" /> {t('media.pickYourSwingModal')}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ivory/40 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={source === 'tour_pros' ? t('media.searchByProName') : t('media.searchYourSwings')}
            className="pl-9 pr-9 bg-black/30 border-white/10 text-ivory placeholder:text-ivory/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('media.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ivory/60 hover:text-ivory hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-ivory/40" />
          </div>
        ) : !filteredItems || filteredItems.length === 0 ? (
          <div className="py-10 text-center text-ivory/60 text-sm">
            {search
              ? t('media.noSwingsMatch')
              : source === 'tour_pros'
              ? t('media.noTourProSwings')
              : t('media.noUploadedSwings')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 auto-rows-min overflow-y-auto pr-1 flex-1 min-h-0">
            {filteredItems.map((item) => {
              const displayName = item.pro_name?.trim() || item.title?.trim() || 'Untitled';

              return (
              <div
                key={item.id}
                className="glass-card overflow-hidden text-left hover:ring-2 hover:ring-gold-accent transition-all min-h-[140px] flex flex-col"
              >
                <div
                  className="h-[140px] min-h-[140px] relative"
                  style={{ backgroundColor: '#111', position: 'relative', height: '140px' }}
                >
                  <div className="absolute inset-0" style={{ zIndex: 0 }}>
                    {item.thumbnail_url ? (
                      <SignedMediaImg
                        src={item.thumbnail_url}
                        alt={item.title}
                        className="w-full h-full object-cover object-center"
                        style={{ backgroundColor: '#111', position: 'relative', zIndex: 0 }}
                      />
                    ) : (
                      <VideoThumb src={item.file_url} alt={item.title} />
                    )}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.9)',
                    padding: '6px 10px',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px', margin: 0 }}>
                    {displayName}
                  </p>
                  {item.source === 'class' && (
                    <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-green-accent/15 text-green-accent border border-green-accent/30">
                      {t('media.classVideo')}
                    </span>
                  )}
                </div>
                <div className="p-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => {
                      onPick(item.id, item);
                      setSearch('');
                      onClose();
                    }}
                    variant="outline"
                    className="min-h-[44px] border-gold-accent text-gold-accent hover:bg-gold-accent/10 hover:text-gold-accent font-semibold px-5"
                  >
                    {t('media.choose')}
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}