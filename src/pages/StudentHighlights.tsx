import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import {
  Trophy, Plus, Play, Trash2, Pin, PinOff, Sparkles, Lock, Pencil,
  Image as ImageIcon, Video as VideoIcon, Info, ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { AddHighlightModal } from '@/components/AddHighlightModal';
import { SignedGolfMediaImg, SignedGolfMediaVideo } from '@/components/SignedGolfMedia';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  getMonthlyQuota,
  getQuotaResetDate,
  getUsedThisMonth,
  HIGHLIGHT_REQUIREMENTS,
  type HighlightPlan,
} from '@/lib/highlightsQuota';
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

interface Highlight {
  id: string;
  student_id: string;
  file_url: string;
  file_type: 'image' | 'video';
  thumbnail_url: string | null;
  title: string | null;
  caption: string | null;
  category: string;
  is_pinned: boolean;
  created_at: string;
}

function categoryLabel(t: (k: string) => string, cat: string): string {
  const map: Record<string, string> = {
    trophy: t('media.catTrophy'),
    scorecard: t('media.catScorecard'),
    milestone: t('media.catMilestone'),
    personal: t('media.catPersonal'),
    other: t('media.catHighlight'),
  };
  return map[cat] ?? t('media.catHighlight');
}

export default function StudentHighlights() {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const { profile, effectivePlan } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showRequirements, setShowRequirements] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editHighlight, setEditHighlight] = useState<Highlight | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const plan = (effectivePlan ?? 'free') as HighlightPlan;
  const monthlyQuota = getMonthlyQuota(plan);
  const isLocked = monthlyQuota === 0;
  const isUnlimited = !Number.isFinite(monthlyQuota);

  // All highlights for this student
  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ['student-highlights', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_highlights' as any)
        .select('*')
        .eq('student_id', profile!.id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Highlight[];
    },
    enabled: !!profile?.id,
  });

  // Combined monthly usage across highlights + non-analysis videos.
  const { data: usedThisMonth = 0 } = useQuery({
    queryKey: ['video-quota-used', profile?.id],
    queryFn: () => getUsedThisMonth(profile!.id),
    enabled: !!profile?.id,
  });
  const remainingSlots = isUnlimited ? Infinity : Math.max(0, monthlyQuota - usedThisMonth);
  const canUpload = !isLocked && (isUnlimited || remainingSlots > 0);
  const resetDate = getQuotaResetDate();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['student-highlights', profile?.id] });
    queryClient.invalidateQueries({ queryKey: ['video-quota-used', profile?.id] });
  };

  const handleEditHighlight = async () => {
    if (!editHighlight) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('student_highlights' as any)
        .update({ title: editTitle.trim() || null, caption: editCaption.trim() || null })
        .eq('id', editHighlight.id);
      if (error) throw error;
      toast({ title: t('media.highlightUpdated') });
      refresh();
      setEditHighlight(null);
    } catch (err: any) {
      toast({ title: t('media.updateFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleTogglePin = async (h: Highlight) => {
    const { error } = await supabase
      .from('student_highlights' as any)
      .update({ is_pinned: !h.is_pinned })
      .eq('id', h.id);
    if (error) {
      toast({ title: t('media.couldNotUpdate'), description: error.message, variant: 'destructive' });
      return;
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    // Try to remove file from storage too (best-effort)
    const h = highlights.find(x => x.id === id);
    if (h) {
      const paths: string[] = [];
      const tryExtract = (url: string) => {
        const m = url.match(/\/golf-media\/(.+)$/);
        if (m) paths.push(decodeURIComponent(m[1].split('?')[0]));
      };
      tryExtract(h.file_url);
      if (h.thumbnail_url) tryExtract(h.thumbnail_url);
      if (paths.length) {
        await supabase.storage.from('golf-media').remove(paths).catch(() => {});
      }
    }
    const { error } = await supabase.from('student_highlights' as any).delete().eq('id', id);
    if (error) {
      toast({ title: t('media.couldNotDelete'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('media.highlightRemoved') });
    setConfirmDeleteId(null);
    refresh();
  };

  const previewItem = highlights.find(h => h.id === previewId) || null;

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.myHighlightsTitle" subtitleKey="admin.myHighlightsSub" backTo="/dashboard" />

      <main className="container mx-auto px-4 py-6 max-w-3xl pb-24">
        {/* Quota / status card */}
        <div className="glass-card p-5 mb-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(240,192,64,0.15)' }}>
                <Trophy className="h-6 w-6 text-gold-accent" />
              </div>
              <div className="min-w-0">
                <h1 className="font-heading text-xl font-bold text-ivory leading-tight">{t('media.yourHighlights')}</h1>
                <p className="text-ivory/55 text-sm mt-0.5">
                  {isLocked
                    ? t('media.upgradeToShareWins')
                    : isUnlimited
                    ? t('media.unlimitedUploads')
                    : t('media.usedThisMonth').replace('{used}', String(usedThisMonth)).replace('{total}', String(monthlyQuota))}
                </p>
              </div>
            </div>

            {!isLocked && (
              <Button
                onClick={() => setUploadOpen(true)}
                disabled={!canUpload}
                className="bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-1.5 flex-shrink-0"
                size="sm"
              >
                <Plus className="h-4 w-4" /> {t('media.addBtn')}
              </Button>
            )}
          </div>

          {!isLocked && !isUnlimited && (
            <>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gold-accent transition-all"
                  style={{ width: `${Math.min(100, (usedThisMonth / monthlyQuota) * 100)}%` }}
                />
              </div>
              <p className="text-ivory/40 text-[11px] mt-2">
                {t('media.resetsOn').replace('{date}', new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(resetDate))}
              </p>
            </>
          )}

          {/* Requirements expandable */}
          {!isLocked && (
            <button
              onClick={() => setShowRequirements(s => !s)}
              className="mt-3 flex items-center gap-1.5 text-xs text-ivory/55 hover:text-ivory/80 transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
              {showRequirements ? t('media.hideUploadRequirements') : t('media.seeUploadRequirements')}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showRequirements ? 'rotate-90' : ''}`} />
            </button>
          )}
          {showRequirements && (
            <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-ivory/70 space-y-1.5">
              <p className="flex items-start gap-2">
                <ImageIcon className="h-3.5 w-3.5 mt-0.5 text-green-accent flex-shrink-0" />
                <span>{t('media.photosRequirement').replace('{n}', String(HIGHLIGHT_REQUIREMENTS.imageMaxMB))}</span>
              </p>
              <p className="flex items-start gap-2">
                <VideoIcon className="h-3.5 w-3.5 mt-0.5 text-gold-accent flex-shrink-0" />
                <span>{t('media.videosRequirement').replace('{sec}', String(HIGHLIGHT_REQUIREMENTS.videoMaxSeconds)).replace('{mb}', String(HIGHLIGHT_REQUIREMENTS.videoMaxMB))}</span>
              </p>
              <p className="text-ivory/50">{t('media.perUploadNote')}</p>
            </div>
          )}
        </div>

        {/* Locked state for Free tier */}
        {isLocked ? (
          <div className="glass-card p-8 text-center space-y-4">
            <div className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(240,192,64,0.15)' }}>
              <Lock className="h-7 w-7 text-gold-accent" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-ivory">{t('media.saveGolfWins')}</h2>
              <p className="text-ivory/60 text-sm mt-2 max-w-sm mx-auto">
                {t('media.upgradeHighlightsDesc')}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-md mx-auto pt-2 text-xs">
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <p className="font-semibold text-ivory">Scratch</p>
                <p className="text-ivory/50 mt-0.5">{t('media.perMonth').replace('{n}', '5')}</p>
              </div>
              <div className="rounded-lg bg-gold-accent/10 border border-gold-accent/30 p-2">
                <p className="font-semibold text-gold-accent">Pro</p>
                <p className="text-ivory/60 mt-0.5">{t('media.perMonth').replace('{n}', '10')}</p>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <p className="font-semibold text-ivory">Apex</p>
                <p className="text-ivory/50 mt-0.5">{t('media.unlimited')}</p>
              </div>
            </div>
            <Link to="/plans" className="inline-block">
              <Button className="h-11 px-5 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
                <Sparkles className="h-4 w-4" /> {t('media.seePlans')}
              </Button>
            </Link>
          </div>
        ) : isLoading ? (
          <div className="glass-card p-12 text-center text-ivory/50">{t('media.loadingEllipsis')}</div>
        ) : highlights.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-white/5 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-ivory/30" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-ivory">{t('media.noHighlightsYet')}</h3>
              <p className="text-ivory/50 text-sm mt-1 max-w-sm mx-auto">
                {t('media.noHighlightsDesc')}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {[t('media.chipTournamentWin'), t('media.chipHoleInOne'), t('media.chipPersonalBest'), t('media.chipBestSwing')].map(c => (
                <span key={c} className="text-[11px] text-ivory/60 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">{c}</span>
              ))}
            </div>
            <Button
              onClick={() => setUploadOpen(true)}
              disabled={!canUpload}
              className="bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
            >
              <Plus className="h-4 w-4" /> {t('media.addFirstHighlight')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {highlights.map((h) => (
              <div
                key={h.id}
                className="group relative aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10 cursor-pointer"
                onClick={() => setPreviewId(h.id)}
              >
                {h.file_type === 'image' ? (
                  <SignedGolfMediaImg src={h.file_url} alt={h.title || t('media.highlightAlt')} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <>
                    {h.thumbnail_url ? (
                      <SignedGolfMediaImg src={h.thumbnail_url} alt={h.title || t('media.videoHighlightAlt')} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon className="h-10 w-10 text-ivory/25" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                      <div className="h-11 w-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                        <Play className="h-5 w-5 text-ivory ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  </>
                )}

                {/* Bottom gradient + label */}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      {h.title && (
                        <p className="text-[11px] text-ivory font-semibold truncate">{h.title}</p>
                      )}
                      <Badge className="bg-white/15 text-ivory/90 border-transparent text-[9px] px-1.5 py-0 mt-0.5">
                        {categoryLabel(t, h.category)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Action chips */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditHighlight(h); setEditTitle(h.title || ''); setEditCaption(h.caption || ''); }}
                    className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80"
                    title={t('media.editTooltip')}
                  >
                    <Pencil className="h-3.5 w-3.5 text-ivory" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTogglePin(h); }}
                    className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80"
                    title={h.is_pinned ? t('media.unpinTooltip') : t('media.pinTooltip')}
                  >
                    {h.is_pinned ? <PinOff className="h-3.5 w-3.5 text-ivory" /> : <Pin className="h-3.5 w-3.5 text-ivory" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(h.id); }}
                    className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-red-600/80"
                    title={t('media.deleteTooltip')}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-ivory" />
                  </button>
                </div>

                {h.is_pinned && (
                  <div className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-gold-accent/90 flex items-center justify-center">
                    <Pin className="h-3 w-3 text-black" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <SocialFooter />

      {/* Upload modal */}
      {profile?.id && (
        <AddHighlightModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          studentId={profile.id}
          remainingSlots={remainingSlots}
          onUploaded={refresh}
        />
      )}

      {/* Lightbox preview */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewId(null)}
        >
          <button
            onClick={() => setPreviewId(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-ivory text-xl"
            aria-label={t('media.close')}
          >
            ✕
          </button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {previewItem.file_type === 'image' ? (
              <SignedGolfMediaImg src={previewItem.file_url} alt={previewItem.title || ''} className="max-h-[80vh] w-auto mx-auto rounded-xl" />
            ) : (
              <SignedGolfMediaVideo src={previewItem.file_url} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-xl bg-black" />
            )}
            {(previewItem.title || previewItem.caption) && (
              <div className="mt-3 text-center">
                {previewItem.title && <p className="text-ivory font-semibold">{previewItem.title}</p>}
                {previewItem.caption && <p className="text-ivory/60 text-sm mt-1">{previewItem.caption}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {/* Edit highlight dialog */}
      <Dialog open={!!editHighlight} onOpenChange={(o) => !o && setEditHighlight(null)}>
        <DialogContent className="glass-card border-white/15 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ivory">{t('media.editHighlightTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-ivory/70">{t('media.titleField')}</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t('media.titlePlaceholderHighlight')}
                className="bg-white/5 border-white/15 text-ivory placeholder:text-ivory/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-ivory/70">{t('media.captionField')}</Label>
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder={t('media.captionPlaceholder')}
                rows={3}
                className="bg-white/5 border-white/15 text-ivory placeholder:text-ivory/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditHighlight(null)} disabled={savingEdit} className="border-white/15 text-ivory/70">{t('media.cancel')}</Button>
            <Button onClick={handleEditHighlight} disabled={savingEdit} className="bg-gold-accent text-black hover:bg-gold-accent/90">
              {savingEdit ? t('media.saving') : t('media.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent className="glass-card border-white/15">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">{t('media.deleteHighlightTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              {t('media.deleteHighlightDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 text-ivory border-white/15 hover:bg-white/10">{t('media.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              {t('media.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}