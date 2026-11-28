import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, hasProZoneAccess } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  ArrowLeft, Loader2, Lock, Sparkles, Play, Pause, ChevronLeft, ChevronRight,
  Volume2, VolumeX, Trophy, Video as VideoIcon, RefreshCcw, ZoomIn,
} from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { isDirectVideoFile } from '@/lib/proZoneCategories';
import { SwingPickerModal } from '@/components/SwingPickerModal';
import { ApexMark } from '@/components/ApexBrand';
import { useSignedGolfMediaUrl } from '@/hooks/useSignedGolfMediaUrl';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useLanguage } from '@/contexts/LanguageContext';

type Side = 'pro' | 'mine';

interface ClipMeta {
  id: string;
  title: string;
  file_url: string;
  pro_name?: string | null;
}

const SPEEDS = [0.25, 0.5, 1] as const;
const FRAME_STEP = 1 / 30;

export default function CompareSwings() {
  const { user, effectivePlan, graceUntil, trialEndsAt, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const proId = searchParams.get('pro') ?? '';
  const mineId = searchParams.get('mine') ?? '';

  const videoARef = useRef<HTMLVideoElement | null>(null); // pro
  const videoBRef = useRef<HTMLVideoElement | null>(null); // mine

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(0.5);
  const [muted, setMuted] = useState(true);
  const [pct, setPct] = useState(0); // 0..100
  const [offsetA, setOffsetA] = useState(0); // seconds
  const [offsetB, setOffsetB] = useState(0);
  const [zoomA, setZoomA] = useState(1);
  const [zoomB, setZoomB] = useState(1);
  const [panA, setPanA] = useState(0); // -50..50 (% of frame)
  const [panB, setPanB] = useState(0);
  const [panAY, setPanAY] = useState(0);
  const [panBY, setPanBY] = useState(0);
  const [pickerSide, setPickerSide] = useState<Side | null>(null);

  const { data: proClip, isLoading: loadingPro } = useQuery({
    queryKey: ['compare-pro', proId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('id, title, file_url, pro_name')
        .eq('id', proId)
        .maybeSingle();
      if (error) throw error;
      return data as ClipMeta | null;
    },
    enabled: !!proId,
  });

  const { data: mineClip, isLoading: loadingMine } = useQuery({
    queryKey: ['compare-mine', mineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('id, title, file_url')
        .eq('id', mineId)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as ClipMeta | null;
      // Class videos live in student_media, not videos — same fallback as the picker.
      const { data: media, error: mErr } = await supabase
        .from('student_media' as any)
        .select('id, title, file_url')
        .eq('id', mineId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!media) return null;
      const row = media as unknown as ClipMeta;
      return { id: row.id, title: row.title || 'Media', file_url: row.file_url };
    },
    enabled: !!mineId,
  });

  const setSide = (side: Side, id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(side === 'pro' ? 'pro' : 'mine', id);
    setSearchParams(next, { replace: true });
    // Reset playback
    setPlaying(false);
    setPct(0);
    if (videoARef.current) videoARef.current.currentTime = 0;
    if (videoBRef.current) videoBRef.current.currentTime = 0;
  };

  // Apply playback rate + mute when changed
  useEffect(() => {
    [videoARef.current, videoBRef.current].forEach((v) => {
      if (!v) return;
      v.playbackRate = speed;
      v.muted = muted;
    });
  }, [speed, muted, proClip, mineClip]);

  // Master play/pause
  useEffect(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a && !b) return;
    if (playing) {
      a?.play().catch(() => setPlaying(false));
      b?.play().catch(() => setPlaying(false));
    } else {
      a?.pause();
      b?.pause();
    }
  }, [playing]);

  // rAF loop to keep scrubber in sync
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = videoARef.current;
      const b = videoBRef.current;
      const dur = Math.max(a?.duration || 0, b?.duration || 0);
      const cur = Math.max(a?.currentTime || 0, b?.currentTime || 0);
      if (dur > 0) setPct(Math.min(100, (cur / dur) * 100));
      // Auto-stop when both ended
      const aDone = !a || a.ended;
      const bDone = !b || b.ended;
      if (aDone && bDone) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, proClip, mineClip]);

  const seekTo = (newPct: number) => {
    setPct(newPct);
    const frac = newPct / 100;
    const a = videoARef.current;
    const b = videoBRef.current;
    if (a && a.duration) a.currentTime = Math.max(0, Math.min(a.duration, frac * a.duration + offsetA));
    if (b && b.duration) b.currentTime = Math.max(0, Math.min(b.duration, frac * b.duration + offsetB));
  };

  // Apply offset live when sliders move (without changing the master scrubber position)
  const applyOffsetA = (v: number) => {
    setOffsetA(v);
    const a = videoARef.current;
    if (a && a.duration) {
      const frac = pct / 100;
      a.currentTime = Math.max(0, Math.min(a.duration, frac * a.duration + v));
    }
  };
  const applyOffsetB = (v: number) => {
    setOffsetB(v);
    const b = videoBRef.current;
    if (b && b.duration) {
      const frac = pct / 100;
      b.currentTime = Math.max(0, Math.min(b.duration, frac * b.duration + v));
    }
  };

  const stepFrame = (dir: -1 | 1) => {
    setPlaying(false);
    [videoARef.current, videoBRef.current].forEach((v) => {
      if (!v || !v.duration) return;
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + dir * FRAME_STEP));
    });
    // Refresh pct based on the longest
    const a = videoARef.current;
    const b = videoBRef.current;
    const dur = Math.max(a?.duration || 0, b?.duration || 0);
    const cur = Math.max(a?.currentTime || 0, b?.currentTime || 0);
    if (dur > 0) setPct(Math.min(100, (cur / dur) * 100));
  };

  const reset = () => {
    setPlaying(false);
    setPct(0);
    setOffsetA(0);
    setOffsetB(0);
    setZoomA(1);
    setZoomB(1);
    setPanA(0);
    setPanB(0);
    setPanAY(0);
    setPanBY(0);
    if (videoARef.current) videoARef.current.currentTime = 0;
    if (videoBRef.current) videoBRef.current.currentTime = 0;
  };

  const proPlayable = useMemo(() => !!proClip && isDirectVideoFile(proClip.file_url), [proClip]);
  const minePlayable = useMemo(() => !!mineClip && isDirectVideoFile(mineClip.file_url), [mineClip]);
  const proClipSignedSrc = useSignedGolfMediaUrl(proClip?.file_url ?? null);
  const mineClipSignedSrc = useSignedMediaUrl(mineClip?.file_url ?? null);

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
          <h1 className="font-heading text-2xl font-bold text-ivory">{t('media.membersOnlyTitle')}</h1>
          <p className="text-ivory/70 text-sm">
            {t('media.compareMembersDesc')}
          </p>
          <Link to="/plans">
            <Button className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
              <Sparkles className="h-4 w-4" /> {t('media.seePlans')}
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
            <p className="text-[10px] uppercase tracking-widest text-ivory/40">{t('media.compareSwings')}</p>
            <p className="text-xs text-ivory/70">{t('media.sideBySide')}</p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-5xl space-y-4">
        {/* Two video panes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* PRO side */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-gold-accent">
                <Trophy className="h-3.5 w-3.5" /> {t('media.tourPro')}
              </span>
              <button
                onClick={() => setPickerSide('pro')}
                className="text-[11px] text-ivory/60 hover:text-ivory underline underline-offset-2"
              >
                {proClip ? t('media.change') : t('media.pick')}
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
              {loadingPro ? (
                <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
              ) : proClip && proPlayable ? (
                <video
                  ref={videoARef}
                  src={proClipSignedSrc ?? undefined}
                  className="w-full h-full object-contain"
                  style={{
                    transform: `scale(${zoomA}) translate(${panA}%, ${panAY}%)`,
                    transformOrigin: 'center',
                    transition: 'transform 0.05s linear',
                  }}
                  autoPlay
                  loop
                  playsInline
                  muted={muted}
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    v.currentTime = 0;
                    v.play().catch(() => {});
                  }}
                  onCanPlay={(e) => {
                    const v = e.currentTarget;
                    v.play().catch(() => {});
                  }}
                />
              ) : proClip && !proPlayable ? (
                <p className="text-ivory/60 text-xs px-4 text-center">
                  {t('media.externalEmbedNote')}
                </p>
              ) : (
                <button
                  onClick={() => setPickerSide('pro')}
                  className="text-ivory/60 text-sm hover:text-ivory flex flex-col items-center gap-2"
                >
                  <Trophy className="h-8 w-8 text-gold-accent/60" />
                  {t('media.pickTourPro')}
                </button>
              )}
            </div>
            {proClip && (
              <div className="px-3 py-2 text-xs text-ivory/70 truncate">
                {proClip.pro_name && <span className="text-gold-accent font-semibold">{proClip.pro_name} · </span>}
                {proClip.title}
              </div>
            )}
            {proClip && proPlayable && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                <div className="flex items-center justify-between text-[10px] text-ivory/50">
                  <span className="inline-flex items-center gap-1 uppercase tracking-wide"><ZoomIn className="h-3 w-3" /> {t('media.zoom')}</span>
                  <span>{zoomA.toFixed(2)}×</span>
                </div>
                <Slider value={[zoomA]} min={1} max={3} step={0.05} onValueChange={(v) => setZoomA(v[0])} />
                {zoomA > 1 && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <p className="text-[10px] text-ivory/40 mb-1">{t('media.panHorizontal')}</p>
                      <Slider value={[panA]} min={-50} max={50} step={1} onValueChange={(v) => setPanA(v[0])} />
                    </div>
                    <div>
                      <p className="text-[10px] text-ivory/40 mb-1">{t('media.panVertical')}</p>
                      <Slider value={[panAY]} min={-50} max={50} step={1} onValueChange={(v) => setPanAY(v[0])} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MINE side */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-green-accent">
                <VideoIcon className="h-3.5 w-3.5" /> {t('media.mySwing')}
              </span>
              <button
                onClick={() => setPickerSide('mine')}
                className="text-[11px] text-ivory/60 hover:text-ivory underline underline-offset-2"
              >
                {mineClip ? t('media.change') : t('media.pick')}
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
              {loadingMine ? (
                <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
              ) : mineClip && minePlayable ? (
                <video
                  ref={videoBRef}
                  src={mineClipSignedSrc ?? undefined}
                  className="w-full h-full object-contain"
                  style={{
                    transform: `scale(${zoomB}) translate(${panB}%, ${panBY}%)`,
                    transformOrigin: 'center',
                    transition: 'transform 0.05s linear',
                  }}
                  autoPlay
                  loop
                  playsInline
                  muted={muted}
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    v.currentTime = 0;
                    v.play().catch(() => {});
                  }}
                  onCanPlay={(e) => {
                    const v = e.currentTarget;
                    v.play().catch(() => {});
                  }}
                />
              ) : mineClip && !minePlayable ? (
                <p className="text-ivory/60 text-xs px-4 text-center">
                  {t('media.cannotPlaySync')}
                </p>
              ) : (
                <button
                  onClick={() => setPickerSide('mine')}
                  className="text-ivory/60 text-sm hover:text-ivory flex flex-col items-center gap-2"
                >
                  <VideoIcon className="h-8 w-8 text-green-accent/60" />
                  {t('media.pickYourSwing')}
                </button>
              )}
            </div>
            {mineClip && (
              <div className="px-3 py-2 text-xs text-ivory/70 truncate">{mineClip.title}</div>
            )}
            {mineClip && minePlayable && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                <div className="flex items-center justify-between text-[10px] text-ivory/50">
                  <span className="inline-flex items-center gap-1 uppercase tracking-wide"><ZoomIn className="h-3 w-3" /> {t('media.zoom')}</span>
                  <span>{zoomB.toFixed(2)}×</span>
                </div>
                <Slider value={[zoomB]} min={1} max={3} step={0.05} onValueChange={(v) => setZoomB(v[0])} />
                {zoomB > 1 && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <p className="text-[10px] text-ivory/40 mb-1">{t('media.panHorizontal')}</p>
                      <Slider value={[panB]} min={-50} max={50} step={1} onValueChange={(v) => setPanB(v[0])} />
                    </div>
                    <div>
                      <p className="text-[10px] text-ivory/40 mb-1">{t('media.panVertical')}</p>
                      <Slider value={[panBY]} min={-50} max={50} step={1} onValueChange={(v) => setPanBY(v[0])} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Master controls */}
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => stepFrame(-1)}
              className="h-10 w-10 text-ivory hover:bg-white/10"
              aria-label={t('media.stepBack')}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              onClick={() => setPlaying((p) => !p)}
              disabled={!proPlayable && !minePlayable}
              className="h-12 w-12 rounded-full bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold p-0"
              aria-label={playing ? t('media.pause') : t('media.play')}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => stepFrame(1)}
              className="h-10 w-10 text-ivory hover:bg-white/10"
              aria-label={t('media.stepForward')}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMuted((m) => !m)}
              className="h-10 w-10 text-ivory hover:bg-white/10 ml-2"
              aria-label={muted ? t('media.unmute') : t('media.mute')}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={reset}
              className="h-10 w-10 text-ivory hover:bg-white/10"
              aria-label={t('media.reset')}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Sync scrubber */}
          <div className="space-y-1">
            <Slider
              value={[pct]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={(v) => seekTo(v[0])}
            />
            <p className="text-[10px] text-ivory/40 text-center">
              {t('media.syncScrubberHint')}
            </p>
          </div>

          {/* Speed selector */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] text-ivory/50 uppercase tracking-wide">{t('media.speed')}</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  speed === s
                    ? 'bg-gold-accent text-black font-semibold'
                    : 'bg-white/5 text-ivory/70 hover:bg-white/10'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Per-side offset sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex items-center justify-between text-[11px] text-ivory/60 mb-1.5">
                <span className="uppercase tracking-wide text-gold-accent">{t('media.tourProOffset')}</span>
                <span>{offsetA >= 0 ? '+' : ''}{offsetA.toFixed(2)}s</span>
              </div>
              <Slider
                value={[offsetA]}
                min={-5}
                max={5}
                step={0.05}
                onValueChange={(v) => applyOffsetA(v[0])}
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-ivory/60 mb-1.5">
                <span className="uppercase tracking-wide text-green-accent">{t('media.mySwingOffset')}</span>
                <span>{offsetB >= 0 ? '+' : ''}{offsetB.toFixed(2)}s</span>
              </div>
              <Slider
                value={[offsetB]}
                min={-5}
                max={5}
                step={0.05}
                onValueChange={(v) => applyOffsetB(v[0])}
              />
            </div>
          </div>
          <p className="text-[10px] text-ivory/40 text-center">
            {t('media.alignTip')}
          </p>
        </div>
      </main>

      <SwingPickerModal
        open={pickerSide !== null}
        source={pickerSide === 'pro' ? 'tour_pros' : 'mine'}
        onClose={() => setPickerSide(null)}
        onPick={(id) => pickerSide && setSide(pickerSide, id)}
      />
    </div>
  );
}