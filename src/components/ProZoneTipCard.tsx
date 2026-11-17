import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export interface ProZoneTip {
  id: string;
  category: string;
  title: string;
  description: string | null;
  media_url: string | null;
  media_type: 'video' | 'image' | null;
}

interface ProZoneTipCardProps {
  tip: ProZoneTip;
  userId: string;
  isCompleted: boolean;
  onToggle: (tipId: string, nowCompleted: boolean) => void;
  tourAttr?: boolean;
}

/** Convert a YouTube/Vimeo URL into an embed URL, or null if not recognized. */
function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video${u.pathname}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function ProZoneTipCard({ tip, userId, isCompleted, onToggle, tourAttr }: ProZoneTipCardProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (isCompleted) {
        const { error } = await supabase
          .from('pro_zone_tip_progress')
          .delete()
          .eq('user_id', userId)
          .eq('tip_id', tip.id);
        if (error) throw error;
        onToggle(tip.id, false);
      } else {
        const { error } = await supabase
          .from('pro_zone_tip_progress')
          .insert({ user_id: userId, tip_id: tip.id });
        if (error) throw error;
        onToggle(tip.id, true);
        toast.success(t('prozone.tipCompleteToast'));
      }
    } catch (err: any) {
      toast.error(err.message || t('prozone.tipUpdateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const embedUrl = tip.media_type === 'video' && tip.media_url ? getEmbedUrl(tip.media_url) : null;

  return (
    <div
      data-tour={tourAttr ? 'pro-zone-first-tip' : undefined}
      className="rounded-xl p-4 border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={handleToggle}
          disabled={busy}
          className="shrink-0 mt-0.5"
          aria-label={isCompleted ? t('prozone.markIncomplete') : t('prozone.markComplete')}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-ivory/60" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-5 w-5 text-green-accent" />
          ) : (
            <Circle className="h-5 w-5 text-ivory/40 hover:text-ivory/70" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <h4
            className={`font-medium text-ivory text-[15px] leading-snug ${
              isCompleted ? 'line-through opacity-60' : ''
            }`}
          >
            {tip.title}
          </h4>
          {(expanded || !tip.description) && tip.description && (
            <p className="text-ivory/70 text-sm mt-2 leading-relaxed whitespace-pre-line">
              {tip.description}
            </p>
          )}
          {!expanded && tip.description && (
            <p className="text-ivory/60 text-sm mt-1 line-clamp-2">{tip.description}</p>
          )}

          {expanded && embedUrl && (
            <div className="mt-3 aspect-video rounded-lg overflow-hidden border border-white/10">
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={tip.title}
              />
            </div>
          )}
          {expanded && tip.media_type === 'image' && tip.media_url && (
            <img src={tip.media_url} alt={tip.title} className="mt-3 rounded-lg max-h-80 w-auto" />
          )}

          {!expanded && tip.media_url && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-gold-accent">
              <Play className="h-3 w-3" />
              <span>{tip.media_type === 'video' ? t('prozone.tapToViewVideo') : t('prozone.tapToViewImage')}</span>
            </div>
          )}

          {expanded && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggle}
              disabled={busy}
              className="mt-3 h-8 text-xs gap-1.5 text-ivory/80 hover:text-ivory hover:bg-white/10"
            >
              {isCompleted ? (
                <>
                  <Circle className="h-3.5 w-3.5" /> {t('prozone.markIncomplete')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('prozone.markComplete')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}