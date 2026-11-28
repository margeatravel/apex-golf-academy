import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, hasProZoneAccess } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Lock, Sparkles, Upload, Save, Video as VideoIcon, Eye,
} from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ApexMark } from '@/components/ApexBrand';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import { SwingPickerModal, type PickItem } from '@/components/SwingPickerModal';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

interface Fault {
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}
interface NamedItem { name: string; description: string }
interface Metric {
  value: string;
  unit: string;
  rating: 'good' | 'average' | 'needs_work';
}
interface SwingMetrics {
  hip_rotation: Metric;
  spine_angle: Metric;
  tempo_ratio: Metric;
  club_path: Metric;
  weight_transfer: Metric;
}
interface SwingFeedback {
  overall_score: number;
  summary: string;
  metrics?: SwingMetrics;
  faults: Fault[];
  strengths: NamedItem[];
  drills: NamedItem[];
}

interface SavedAnalysis {
  id: string;
  video_url: string;
  notes: string | null;
  feedback: SwingFeedback;
  created_at: string;
}

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ACCEPT_ATTR = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm';
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export default function ProZoneSwingAnalysis() {
  const { user, effectivePlan, graceUntil, trialEndsAt, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickedSignedUrl = useSignedMediaUrl(picked?.file_url ?? null);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SwingFeedback | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [currentNotes, setCurrentNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedThisRun, setSavedThisRun] = useState(false);

  const { data: pastAnalyses, isLoading: loadingPast } = useQuery({
    queryKey: ['swing-analyses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('swing_analyses')
        .select('id, video_url, notes, feedback, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedAnalysis[];
    },
    enabled: !!user,
  });

  const resetForNew = () => {
    setFeedback(null);
    setCurrentVideoUrl(null);
    setCurrentNotes('');
    setSavedThisRun(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    setPicked(null); // a fresh upload replaces any picked video
    if (!ACCEPTED_TYPES.includes(f.type) && !/\.(mp4|mov|webm)$/i.test(f.name)) {
      toast.error(t('prozone.unsupportedFormat'));
      e.target.value = '';
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(t('prozone.videoTooLarge'));
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const handleAnalyze = async () => {
    if (!user) return;
    if (!file && !picked) {
      toast.error(t('prozone.chooseVideoFirst'));
      return;
    }
    resetForNew();

    try {
      let videoUrl: string; // URL the AI fetches (signed)
      let storedUrl: string; // URL saved with the analysis (raw path for picked videos, so replay re-signs fresh)
      if (picked) {
        // Video already in storage (own upload or class video) — sign it, no re-upload.
        if (!pickedSignedUrl) throw new Error(t('prozone.couldNotAnalyze'));
        videoUrl = pickedSignedUrl;
        storedUrl = picked.file_url;
      } else if (file) {
        // 1. Upload to storage
        setUploading(true);
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('swing-videos')
          .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false });
        if (upErr) throw upErr;

        // Signed URL so the AI gateway can fetch the (private) file
        const { data: signed, error: signErr } = await supabase.storage
          .from('swing-videos')
          .createSignedUrl(path, 60 * 60); // 1 hour
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error('Could not sign video URL');
        videoUrl = signed.signedUrl;
        storedUrl = signed.signedUrl;
        setUploading(false);
      } else {
        throw new Error(t('prozone.couldNotAnalyze'));
      }

      // 2. Invoke edge function
      setAnalyzing(true);
      const { data, error } = await supabase.functions.invoke('analyze-swing', {
        body: { video_url: videoUrl, notes: notes.trim() || undefined },
      });
      if (error) throw error;
      const fb = (data as { feedback?: SwingFeedback })?.feedback;
      if (!fb || typeof fb !== 'object') throw new Error('AI returned no feedback.');

      setFeedback(fb);
      setCurrentVideoUrl(storedUrl);
      setCurrentNotes(notes.trim());
      toast.success(t('prozone.swingAnalyzedToast'));
    } catch (err: any) {
      console.error('analyze swing failed', err);
      toast.error(err?.message || t('prozone.couldNotAnalyze'));
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!user || !feedback || !currentVideoUrl) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('swing_analyses').insert({
        user_id: user.id,
        video_url: currentVideoUrl,
        notes: currentNotes ? currentNotes : null,
        feedback: feedback as any,
      });
      if (error) throw error;
      setSavedThisRun(true);
      toast.success(t('prozone.analysisSavedToast'));
      queryClient.invalidateQueries({ queryKey: ['swing-analyses', user.id] });
      // Collapse results and reset for a new swing
      resetForNew();
      setFile(null);
      setPicked(null);
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('save analysis failed', err);
      toast.error(err?.message || t('prozone.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  const viewPast = (row: SavedAnalysis) => {
    setFeedback(row.feedback);
    setCurrentVideoUrl(row.video_url);
    setCurrentNotes(row.notes ?? '');
    setSavedThisRun(true); // already saved
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const busy = uploading || analyzing;
  const busyLabel = uploading ? t('prozone.uploading') : analyzing ? t('prozone.analyzing') : '';

  // ─── Render guards ───
  if (authLoading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (!hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt)) {
    return (
      <div className="app-bg min-h-screen px-4 py-12">
        <div className="max-w-md mx-auto glass-card p-8 text-center space-y-4">
          <Lock className="h-10 w-10 mx-auto text-gold-accent" />
          <h1 className="font-heading text-2xl font-bold text-ivory">{t('prozone.membersOnlyTitle')}</h1>
          <p className="text-ivory/70 text-sm">
            {t('prozone.swingAnalysisMembersOnlyBody')}
          </p>
          <Link to="/plans">
            <Button className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
              <Sparkles className="h-4 w-4" /> {t('prozone.seePlans')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/pro-zone" className="text-ivory/80 hover:text-ivory"><ArrowLeft className="h-4 w-4" /></Link>
            <Link to="/dashboard" aria-label="Home"><ApexMark size="md" /></Link>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ivory/40">Pro Zone</p>
            <p className="text-xs text-ivory/70">{t('prozone.swingAnalysisTitle')}</p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* Section A — Upload & Analyze */}
        <section className="glass-card p-5 space-y-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-ivory">{t('prozone.analyzeSwingTitle')}</h2>
            <p className="text-ivory/60 text-sm mt-1">
              {t('prozone.analyzeSwingSubtitle')}
            </p>
          </div>

          <div className="space-y-2">
            {picked ? (
              <>
                {pickedSignedUrl && !feedback && (
                  <video
                    src={pickedSignedUrl}
                    controls
                    muted
                    playsInline
                    className="w-full max-h-[220px] rounded-xl bg-black/40 border border-white/10"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ivory text-sm font-medium truncate min-w-0">
                    {picked.title}
                    {picked.source === 'class' && (
                      <span className="ml-2 inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-green-accent/15 text-green-accent border border-green-accent/30 align-middle">
                        {t('media.classVideo')}
                      </span>
                    )}
                  </p>
                  {!feedback && (
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="text-xs text-ivory/50 hover:text-ivory underline shrink-0"
                    >
                      {t('prozone.changeVideo')}
                    </button>
                  )}
                </div>
              </>
            ) : !file ? (
              <>
                <label
                  htmlFor="swing-video-input"
                  className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-ivory/70 text-sm cursor-pointer hover:bg-white/[0.06] transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  <span>{t('prozone.tapToChooseVideo')}</span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy}
                  className="w-full h-11 border-white/15 text-ivory hover:bg-white/5 gap-2"
                >
                  <VideoIcon className="h-4 w-4" />
                  {t('prozone.chooseFromMyVideos')}
                </Button>
              </>
            ) : (
              <>
                {filePreviewUrl && !feedback && (
                  <video
                    src={filePreviewUrl}
                    controls
                    muted
                    playsInline
                    className="w-full max-h-[220px] rounded-xl bg-black/40 border border-white/10"
                  />
                )}
                {!feedback && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-xs text-ivory/50 hover:text-ivory underline"
                  >
                    {t('prozone.changeVideo')}
                  </button>
                )}
              </>
            )}
            <input
              ref={fileInputRef}
              id="swing-video-input"
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileChange}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-ivory/50 font-semibold">
              {t('prozone.notesOptional')}
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('prozone.notesPlaceholder')}
              rows={3}
              disabled={busy}
              className="bg-white/[0.04] border-white/10 text-ivory text-sm"
            />
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={busy || (!file && !picked) || (picked && !pickedSignedUrl)}
            className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? busyLabel : t('prozone.analyzeSwingBtn')}
          </Button>
        </section>

        {/* Section B — Results */}
        {feedback && (
          <ResultsPanel
            feedback={feedback}
            videoUrl={currentVideoUrl}
            onSave={handleSave}
            saving={saving}
            saved={savedThisRun}
          />
        )}

        {/* Section C — Past Analyses */}
        <section className="glass-card p-5 space-y-3">
          <h2 className="font-heading text-lg font-bold text-ivory">{t('prozone.pastAnalyses')}</h2>
          {loadingPast ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-ivory/40" />
            </div>
          ) : (pastAnalyses?.length ?? 0) === 0 ? (
            <p className="text-ivory/50 text-sm py-3">{t('prozone.noSavedAnalyses')}</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {pastAnalyses!.map((row) => (
                <li key={row.id} className="py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <VideoIcon className="h-4 w-4 text-ivory/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ivory text-sm font-medium leading-tight">
                      {new Date(row.created_at).toLocaleDateString(localeFor(language), {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                      <span className="ml-2 text-gold-accent text-xs font-semibold">
                        {row.feedback?.overall_score ?? '–'}/10
                      </span>
                    </p>
                    {row.notes && (
                      <p className="text-ivory/50 text-xs truncate">{row.notes}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => viewPast(row)}
                    className="text-ivory/80 hover:text-ivory gap-1 h-8"
                  >
                    <Eye className="h-3.5 w-3.5" /> {t('prozone.viewBtn')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <SwingPickerModal
          open={pickerOpen}
          source="mine"
          onClose={() => setPickerOpen(false)}
          onPick={(_id, item) => {
            if (item) {
              setPicked(item);
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }
            setPickerOpen(false);
          }}
        />
      </main>
    </div>
  );
}

function ResultsPanel({
  feedback, videoUrl, onSave, saving, saved,
}: {
  feedback: SwingFeedback;
  videoUrl: string | null;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const { t } = useLanguage();
  // Picked class videos are stored as raw storage paths — sign them here so
  // replay works; uploaded clips are already signed URLs and pass through.
  const signedVideoUrl = useSignedMediaUrl(videoUrl);
  const sevLabels: Record<Fault['severity'], string> = {
    high: t('prozone.severityHigh'),
    medium: t('prozone.severityMedium'),
    low: t('prozone.severityLow'),
  };
  const sevStyles = useMemo(
    () => ({
      high: 'bg-red-500/15 text-red-300 border-red-500/30',
      medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
      low: 'bg-green-500/15 text-green-300 border-green-500/30',
    }),
    [],
  );

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left — video */}
      <div className="glass-card p-4 space-y-2 md:sticky md:top-20 self-start">
        <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold">
          {t('prozone.yourSwing')}
        </p>
        {videoUrl ? (
          <video
            src={signedVideoUrl ?? undefined}
            controls
            playsInline
            className="w-full rounded-xl bg-black/40 border border-white/10"
          />
        ) : (
          <div className="w-full aspect-video rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-ivory/40 text-xs">
            {t('prozone.videoUnavailable')}
          </div>
        )}
      </div>

      {/* Right — metrics + feedback */}
      <div className="glass-card p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold">
            {t('prozone.overallScore')}
          </p>
          <p className="font-heading text-4xl font-bold text-gold-accent leading-none mt-1">
            {feedback.overall_score}<span className="text-ivory/40 text-2xl">/10</span>
          </p>
        </div>
        <Button
          onClick={onSave}
          disabled={saving || saved}
          variant="outline"
          className="border-white/15 text-ivory hover:bg-white/5 gap-2 h-9"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? t('prozone.saved') : t('prozone.saveAnalysis')}
        </Button>
      </div>

      {feedback.metrics && <KeyMetricsCard metrics={feedback.metrics} />}

      {feedback.summary && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold mb-1">
            {t('prozone.summary')}
          </p>
          <p className="text-ivory/80 text-sm leading-relaxed">{feedback.summary}</p>
        </div>
      )}

      {feedback.faults?.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold mb-2">
            {t('prozone.faults')}
          </p>
          <ul className="space-y-2">
            {feedback.faults.map((f, i) => (
              <li key={i} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-ivory text-sm font-semibold">{f.name}</h4>
                  <span
                    className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${sevStyles[f.severity] ?? sevStyles.medium}`}
                  >
                    {sevLabels[f.severity] ?? f.severity}
                  </span>
                </div>
                <p className="text-ivory/70 text-xs mt-1 leading-relaxed">{f.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback.strengths?.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold mb-2">
            {t('prozone.strengths')}
          </p>
          <ul className="space-y-2">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <h4 className="text-ivory text-sm font-semibold">{s.name}</h4>
                <p className="text-ivory/70 text-xs mt-1 leading-relaxed">{s.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback.drills?.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold mb-2">
            {t('prozone.recommendedDrills')}
          </p>
          <ul className="space-y-2">
            {feedback.drills.map((d, i) => (
              <li key={i} className="rounded-xl border border-gold-accent/25 bg-gold-accent/[0.06] p-3">
                <h4 className="text-ivory text-sm font-semibold">{d.name}</h4>
                <p className="text-ivory/70 text-xs mt-1 leading-relaxed">{d.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </section>
  );
}

const METRIC_LABEL_KEYS: Array<{ key: keyof SwingMetrics; labelKey: string }> = [
  { key: 'hip_rotation', labelKey: 'hipRotation' },
  { key: 'spine_angle', labelKey: 'spineAngle' },
  { key: 'tempo_ratio', labelKey: 'tempoRatio' },
  { key: 'club_path', labelKey: 'clubPath' },
  { key: 'weight_transfer', labelKey: 'weightTransfer' },
];

const RATING_STYLE_BASE: Record<Metric['rating'], { bar: string; dot: string; labelKey: string }> = {
  good: { bar: 'bg-green-500', dot: 'text-green-300', labelKey: 'ratingGood' },
  average: { bar: 'bg-yellow-500', dot: 'text-yellow-300', labelKey: 'ratingAverage' },
  needs_work: { bar: 'bg-red-500', dot: 'text-red-300', labelKey: 'ratingNeedsWork' },
};
const RATING_WIDTH: Record<Metric['rating'], string> = {
  good: 'w-full',
  average: 'w-2/3',
  needs_work: 'w-1/3',
};

function KeyMetricsCard({ metrics }: { metrics: SwingMetrics }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-wide text-ivory/50 font-semibold mb-3">
        {t('prozone.keyMetrics')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {METRIC_LABEL_KEYS.map(({ key, labelKey }) => {
          const m = metrics[key];
          if (!m) return null;
          const r = RATING_STYLE_BASE[m.rating] ?? RATING_STYLE_BASE.average;
          const w = RATING_WIDTH[m.rating] ?? RATING_WIDTH.average;
          return (
            <div key={key} className="rounded-lg border border-white/8 bg-black/20 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ivory/50 font-semibold">
                {t(`prozone.${labelKey}`)}
              </p>
              <p className="text-ivory text-sm font-bold mt-0.5">
                {m.value}
                {m.unit && <span className="text-ivory/50 text-xs ml-0.5">{m.unit}</span>}
              </p>
              <div className="h-1 w-full bg-white/5 rounded-full mt-2 overflow-hidden">
                <div className={`h-full ${r.bar} ${w} rounded-full`} />
              </div>
              <p className={`text-[9px] uppercase font-bold tracking-wider mt-1 ${r.dot}`}>
                {t(`prozone.${r.labelKey}`)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}