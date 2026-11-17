import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Link2, Loader2 } from 'lucide-react';
import { detectMediaType, isValidUrl, getDomain } from '@/lib/proZoneCategories';

interface Props {
  category: string;
  nextSortOrder: number;
  onAdded: () => void;
}

/** Paste-a-URL form — adds an external link/video to a Pro Zone category. */
export function ProZoneLinkAdder({ category, nextSortOrder, onAdded }: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [proName, setProName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = url.trim();
  const valid = trimmed.length > 0 && isValidUrl(trimmed);
  const detectedType = valid ? detectMediaType(trimmed) : null;

  const reset = () => {
    setUrl('');
    setTitle('');
    setCaption('');
    setProName('');
  };

  const handleAdd = async () => {
    if (!user || !valid) return;
    setSubmitting(true);
    try {
      const fileType = detectMediaType(trimmed);
      const { error } = await supabase.from('pro_zone_media').insert({
        category,
        title: title.trim() || null,
        caption: caption.trim() || null,
        file_url: trimmed,
        file_type: fileType,
        sort_order: nextSortOrder,
        uploaded_by: user.id,
        pro_name: category === 'tour_pros' ? (proName.trim() || null) : null,
      } as any);
      if (error) throw error;
      toast.success('Link added');
      reset();
      onAdded();
    } catch (e: any) {
      toast.error(`Failed to add link — ${e.message ?? 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-gold-accent" />
        <p className="text-ivory text-xs font-medium">Add by link</p>
        <p className="text-ivory/40 text-[11px]">YouTube, Vimeo, Instagram, TikTok, articles…</p>
      </div>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="h-9 text-xs bg-white/5 border-white/10 text-ivory"
      />
      {category === 'tour_pros' && (
        <Input
          value={proName}
          onChange={(e) => setProName(e.target.value)}
          placeholder="Pro name (e.g. Rory McIlroy)"
          className="h-8 text-xs bg-gold-accent/5 border-gold-accent/20 text-ivory placeholder:text-gold-accent/50"
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="h-8 text-xs bg-white/5 border-white/10 text-ivory"
        />
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption (optional)"
          rows={1}
          className="text-xs bg-white/5 border-white/10 text-ivory min-h-0 py-1.5"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ivory/40 truncate">
          {valid ? (
            <>
              <span className="text-ivory/70">{getDomain(trimmed)}</span> · stored as{' '}
              <span className="text-gold-accent">{detectedType}</span>
            </>
          ) : trimmed.length > 0 ? (
            <span className="text-red-400">Enter a valid http(s) URL</span>
          ) : (
            'Paste a URL above to enable Add link'
          )}
        </p>
        <Button
          onClick={handleAdd}
          disabled={!valid || submitting}
          size="sm"
          className="h-8 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add link'}
        </Button>
      </div>
    </div>
  );
}