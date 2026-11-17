import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { ApexMark } from '@/components/ApexBrand';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SocialFooter } from '@/components/SocialFooter';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  GitCompare,
  Lock,
  Sparkles,
  Video,
} from 'lucide-react';
import { PRO_ZONE_CATEGORIES, PRO_ZONE_CATEGORY_LABEL_KEYS } from '@/lib/proZoneCategories';

interface CatalogRow {
  key: string;
  label: string | null;
  emoji: string | null;
  is_custom: boolean;
  sort_order: number;
  video_count: number;
}

/**
 * Locked Pro Zone teaser.
 *
 * Renders the real Pro Zone layout (hero, TOOLS, LIBRARY grid) blurred and
 * non-interactive, with a sharp upsell card on top. It NEVER touches
 * pro_zone_media / pro_zone_tips / pro_zone_custom_categories directly (RLS
 * denies those to users without access). The catalog comes from the aggregated
 * security-definer RPC `get_pro_zone_catalog_summary`, which returns only
 * category key, label, emoji and a video count — no ids, titles or URLs.
 */
export function ProZoneTeaser() {
  const { t } = useLanguage();

  const { data: summary } = useQuery({
    queryKey: ['pro-zone-catalog-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pro_zone_catalog_summary' as any);
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
    staleTime: 60_000,
  });

  const byKey = new Map<string, CatalogRow>(
    (summary ?? []).map((r) => [String(r.key).trim().toLowerCase(), r]),
  );

  const builtIns = PRO_ZONE_CATEGORIES.map((c) => {
    const row = byKey.get(c.key);
    return {
      key: c.key,
      label: row?.label || t(`prozone.${PRO_ZONE_CATEGORY_LABEL_KEYS[c.key]}`),
      emoji: c.emoji || '⛳',
      count: row?.video_count ?? 0,
    };
  });
  const customs = (summary ?? [])
    .filter((r) => r.is_custom)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      key: r.key,
      label: r.label || r.key,
      emoji: r.emoji || '⛳',
      count: r.video_count ?? 0,
    }));
  const categories = [...builtIns, ...customs];

  const countLabel = (n: number) =>
    !summary
      ? t('prozone.countLoading')
      : n === 1
        ? t('prozone.videosCountOne')
        : t('prozone.videosCount').replace('{n}', String(n));

  const tools = [
    { icon: BarChart3, title: t('prozone.roundStatsTitle'), sub: t('prozone.roundStatsSubtitle') },
    { icon: Video, title: t('prozone.swingAnalysisTitle'), sub: t('prozone.swingAnalysisSubtitle') },
    { icon: GitCompare, title: t('prozone.compareTitle'), sub: t('prozone.compareSubtitle') },
  ];

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <header className="glass-header sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="text-ivory/80 hover:text-ivory"><ArrowLeft className="h-4 w-4" /></Link>
            <Link to="/dashboard" aria-label="Home"><ApexMark size="md" /></Link>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ivory/40">
              {t('prozone.previewLabel')}
            </p>
            <p className="text-xs text-ivory/70">
              {t('prozone.sectionsCount').replace('{n}', String(categories.length))}
            </p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl relative">
        {/* Hero — readable on purpose */}
        <div className="glass-card p-6 text-center space-y-3">
          <div
            className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(240,192,64,0.15)' }}
          >
            <Sparkles className="h-7 w-7 text-gold-accent" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ivory tracking-tight">
              {t('prozone.heroTitleLocked')}
            </h1>
            <p className="text-ivory/60 text-sm mt-1 max-w-md mx-auto">
              {t('prozone.heroSubtitleLocked').replace('{coach}', t('common.yourCoach'))}
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          {/* Dimmed, non-interactive catalog */}
          <div
            aria-hidden
            className="space-y-6 select-none pointer-events-none opacity-70"
            style={{ filter: 'blur(1.2px)' }}
          >
            <div className="space-y-3">
              <h2 className="text-[11px] uppercase tracking-widest text-ivory/40 font-semibold px-1">
                {t('prozone.sectionTools')}
              </h2>
              {tools.map((tool) => (
                <div
                  key={tool.title}
                  className="glass-card p-4 flex items-center justify-between border border-gold-accent/40"
                >
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gold-accent/15 flex-shrink-0">
                      <tool.icon className="h-5 w-5 text-gold-accent" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-ivory text-sm leading-tight truncate">{tool.title}</h3>
                      <p className="text-[11px] text-ivory/50">{tool.sub}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ivory/40 flex-shrink-0" />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h2 className="text-[11px] uppercase tracking-widest text-ivory/40 font-semibold px-1">
                {t('prozone.sectionLibrary')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((cat) => (
                  <div
                    key={cat.key}
                    className="glass-card p-4 flex items-center justify-between relative text-left w-full"
                  >
                    <div className="flex items-center gap-3 text-left min-w-0">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gold-accent/15 flex-shrink-0">
                        <span className="text-xl leading-none">{cat.emoji}</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-ivory text-sm leading-tight truncate">{cat.label}</h3>
                        <p className="text-[11px] text-ivory/50">{countLabel(cat.count)}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ivory/40 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sharp upsell card on top */}
          <div className="absolute inset-0 flex items-start justify-center pt-16 px-2">
            <div className="glass-card p-6 text-center space-y-4 max-w-sm w-full sticky top-28 backdrop-blur-xl border border-gold-accent/30 shadow-2xl">
              <div
                className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(240,192,64,0.15)' }}
              >
                <Lock className="h-7 w-7 text-gold-accent" />
              </div>
              <h2 className="font-heading text-xl font-bold text-ivory tracking-tight">
                {t('prozone.gateTitle')}
              </h2>
              <p className="text-ivory/60 text-sm">{t('prozone.gateDesc')}</p>
              <Link to="/plans" className="inline-block pt-1">
                <Button className="h-11 px-5 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2">
                  <Sparkles className="h-4 w-4" /> {t('prozone.gateCta')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SocialFooter />
    </div>
  );
}
