import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, hasProZoneAccess, isTrialExpired } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronRight, Sparkles, Loader2, ArrowLeft, Lock, Check, BarChart3, Clock, Video, GitCompare } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PRO_ZONE_CATEGORIES, PRO_ZONE_CATEGORY_LABEL_KEYS } from '@/lib/proZoneCategories';
import { useProZoneCategories } from '@/hooks/useProZoneCategories';
import { ProZoneTipCard, type ProZoneTip } from '@/components/ProZoneTipCard';
import { SocialFooter } from '@/components/SocialFooter';
import { GraceBanner } from '@/components/GraceBanner';
import { ApexMark } from '@/components/ApexBrand';
import { replayTour } from '@/components/GuidedTour';
import { ComingSoonModal } from '@/components/ComingSoonModal';
import { SignedGolfMediaImg } from '@/components/SignedGolfMedia';

export default function ProZone() {
  const { user, profile, effectivePlan, graceUntil, graceTier, trialEndsAt, loading: authLoading, hasPermission, isStaffView, role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tourFlag = searchParams.get('tour') === '1';
  const { categories } = useProZoneCategories();
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  // Categories that already have active media uploaded. Used to decide
  // whether a card navigates into the category page or opens the
  // "Coming Soon" modal. Matching is case-insensitive/trimmed to avoid
  // slug-vs-stored-value mismatches.
  const { data: categoriesWithContent } = useQuery({
    queryKey: ['pro-zone-categories-with-content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('category, thumbnail_url, file_url, file_type')
        .eq('is_active', true);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r?.category) set.add(String(r.category).trim().toLowerCase());
      });
      return { keys: set, previews: new Map((data ?? []).filter((r) => r.thumbnail_url || r.file_type === 'image').map((r) => [String(r.category).trim().toLowerCase(), r.thumbnail_url || r.file_url])) };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const hasContent = (key: string) =>
    !!categoriesWithContent?.keys.has(String(key).trim().toLowerCase());

  const trialHasExpired = isTrialExpired(trialEndsAt);

  // Fetch all active tips
  const { data: tips, isLoading: tipsLoading } = useQuery({
    queryKey: ['pro-zone-tips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_tips')
        .select('id, category, title, description, media_url, media_type')
        .eq('is_active', true)
        .order('category')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as ProZoneTip[];
    },
    enabled: !!user,
  });

  // Fetch this user's completed tip ids
  const { data: progress } = useQuery({
    queryKey: ['pro-zone-progress', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_tip_progress')
        .select('tip_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.tip_id));
    },
    enabled: !!user,
  });

  // Fetch media counts per category so we can show "X items" hints on the cards
  const { data: mediaCounts } = useQuery({
    queryKey: ['pro-zone-media-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('category')
        .eq('is_active', true);
      if (error) throw error;
      const counts = new Map<string, number>();
      (data ?? []).forEach((r) => {
        const key = String(r.category ?? '').trim().toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return counts;
    },
    enabled: !!user,
  });

  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (progress) setCompletedSet(new Set(progress));
  }, [progress]);

  // Group tips by category
  const tipsByCategory = useMemo(() => {
    const map = new Map<string, ProZoneTip[]>();
    (tips ?? []).forEach((t) => {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    });
    return map;
  }, [tips]);

  // Auto-launch tour once after paid activation (?tour=1)
  useEffect(() => {
    if (!user || !profile || !tourFlag || tipsLoading) return;
    const alreadyDone = (profile as any).pro_zone_tour_completed_at;
    if (alreadyDone) return;
    // Mark as completed up front so we don't re-trigger on refresh.
    void supabase
      .from('profiles')
      .update({ pro_zone_tour_completed_at: new Date().toISOString() } as any)
      .eq('id', user.id);
    // Defer slightly so the layout settles and tour anchors exist.
    const t = window.setTimeout(() => {
      void replayTour(user.id, 'student');
    }, 600);
    return () => window.clearTimeout(t);
  }, [user, profile, tourFlag, tipsLoading]);

  // Access gate (after hooks so order is stable)
  if (authLoading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  // Staff/coach accounts granted the 'pro_zone' access area get full Pro Zone
  // access regardless of their subscription tier.
  const staffOverride = (role === 'admin' || role === 'coach' || isStaffView) && hasPermission('pro_zone');
  const hasAccess = staffOverride || hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);
  // Expired trial free users: show upsell instead of Pro Zone content
  const isFreeTier = effectivePlan === 'free' || effectivePlan === 'member';
  const showTrialExpiredUpsell = isFreeTier && trialHasExpired && !hasAccess;

  const totalTips = tips?.length ?? 0;
  const completedCount = completedSet.size;

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="text-ivory/80 hover:text-ivory"><ArrowLeft className="h-4 w-4" /></Link>
            <Link to="/dashboard" aria-label="Home"><ApexMark size="md" /></Link>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ivory/40">
              {hasAccess ? t('prozone.membersLabel') : t('prozone.previewLabel')}
            </p>
            <p className="text-xs text-ivory/70">
              {t('prozone.sectionsCount').replace('{n}', String(PRO_ZONE_CATEGORIES.length))}
            </p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <ComingSoonModal open={comingSoonOpen} onOpenChange={setComingSoonOpen} />

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {effectivePlan !== 'scratch' && effectivePlan !== 'pro' && graceUntil && graceTier && (
          <GraceBanner planTier={graceTier} paidThrough={graceUntil} />
        )}

        <section className="flex items-start gap-3 py-1">
          <div className="h-11 w-11 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-foreground tracking-normal">{t('prozone.heroTitle')}</h1>
            <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
              {t(hasAccess ? 'prozone.heroSubtitleAccess' : 'prozone.heroSubtitleLocked').replace('{coach}', t('common.yourCoach'))}
            </p>
            {!hasAccess && <Button asChild className="mt-3 bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/plans">{t('prozone.seePlans')}</Link></Button>}
          </div>
        </section>

        {/* TOOLS section */}
        {hasAccess && (
          <div className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-widest text-ivory/40 font-semibold px-1">
              {t('prozone.sectionTools')}
            </h2>

            {/* Round Stats — native tracker, keep existing behavior for members */}
            <Link
              to="/pro-zone/stats"
              className="pro-zone-tile p-4 min-h-[88px] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 text-left min-w-0">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-accent/15 border border-accent/20 flex-shrink-0">
                  <BarChart3 className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground text-sm leading-snug whitespace-normal">
                    {t('prozone.roundStatsTitle')}
                  </h3>
                  <p className="text-[11px] text-ivory/50">
                    {t('prozone.roundStatsSubtitle')}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ivory/40 flex-shrink-0" />
            </Link>

            {/* Swing Analysis — AI feedback on uploaded swings */}
            <Link
              to="/pro-zone/swing-analysis"
              className="pro-zone-tile p-4 min-h-[88px] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 text-left min-w-0">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-accent/15 border border-accent/20 flex-shrink-0">
                  <Video className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground text-sm leading-snug whitespace-normal">
                    {t('prozone.swingAnalysisTitle')}
                  </h3>
                  <p className="text-[11px] text-ivory/50">
                    {t('prozone.swingAnalysisSubtitle')}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ivory/40 flex-shrink-0" />
            </Link>

            {/* Compare With a Pro — side-by-side swing comparison */}
            <Link
              to="/pro-zone/compare"
              className="pro-zone-tile p-4 min-h-[88px] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 text-left min-w-0">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-accent/15 border border-accent/20 flex-shrink-0">
                  <GitCompare className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground text-sm leading-snug whitespace-normal">
                    {t('prozone.compareTitle')}
                  </h3>
                  <p className="text-[11px] text-ivory/50">
                    {t('prozone.compareSubtitle')}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ivory/40 flex-shrink-0" />
            </Link>
          </div>
        )}

        {/* LIBRARY section — category cards */}
        {tipsLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-ivory/40" />
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-widest text-ivory/40 font-semibold px-1">
              {t('prozone.sectionLibrary')}
            </h2>
            <div data-tour="pro-zone-categories" className="grid grid-cols-2 gap-3">
              {categories.map((cat) => {
                const emoji = cat.emoji || '⛳';
                const label = cat.isCustom
                  ? cat.label
                  : t(`prozone.${PRO_ZONE_CATEGORY_LABEL_KEYS[cat.key]}`);
                const count = mediaCounts?.get(String(cat.key).trim().toLowerCase()) ?? 0;
                const countLabel = !mediaCounts
                  ? t('prozone.countLoading')
                  : count === 1
                    ? t('prozone.videosCountOne')
                    : t('prozone.videosCount').replace('{n}', String(count));

                const preview = categoriesWithContent?.previews.get(String(cat.key).trim().toLowerCase());
                const locked = cat.key === 'bunker';
                const content = <>
                  <div className="relative w-full h-20 sm:h-28 overflow-hidden rounded-lg bg-primary/15 border border-border flex items-center justify-center">
                    {locked ? <Lock className="h-6 w-6 text-muted-foreground" /> : <span className="text-3xl" aria-hidden>{emoji}</span>}
                    {preview && !locked && <SignedGolfMediaImg src={preview} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
                  </div>
                  <div className="w-full min-w-0 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm leading-snug whitespace-normal break-words">{label}</h3>
                      <p className="text-[11px] text-muted-foreground mt-1 whitespace-normal">{locked ? t('prozone.bunkerAvailableOctober') : countLabel}</p>
                    </div>
                    {!locked && (hasContent(cat.key) ? <ChevronRight className="h-4 w-4 mt-0.5 text-accent shrink-0" /> : <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />)}
                  </div>
                </>;
                const tileClass = 'pro-zone-tile p-3 flex flex-col items-start justify-start gap-3 text-left w-full min-w-0 h-full whitespace-normal';
                if (locked) return <div key={cat.key} className={`${tileClass} opacity-75`}>{content}</div>;
                return hasContent(cat.key) ? (
                  <Button asChild variant="ghost" key={cat.key} className={tileClass}><Link to={`/pro-zone/${cat.key}`}>{content}</Link></Button>
                ) : (
                  <Button variant="ghost" key={cat.key} onClick={() => setComingSoonOpen(true)} className={tileClass}>{content}</Button>
                );
              })}
            </div>
          </div>
        )}
      </main>
      <SocialFooter />
    </div>
  );
}