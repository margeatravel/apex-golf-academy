import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth, isInTrial } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, Clock, Loader2, Lock, Sparkles } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { PRO_ZONE_CATEGORIES, PRO_ZONE_CATEGORY_LABEL_KEYS } from '@/lib/proZoneCategories';
import { useProZoneCategories } from '@/hooks/useProZoneCategories';
import { SocialFooter } from '@/components/SocialFooter';
import { ApexMark } from '@/components/ApexBrand';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ProZoneMediaGrid, type ProZoneMediaItem } from '@/components/ProZoneMediaGrid';

export default function ProZoneCategory() {
  const { category = '' } = useParams<{ category: string }>();
  const { user, effectivePlan, trialEndsAt, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { categories } = useProZoneCategories();
  const navigate = useNavigate();

  const { data: mediaItems, isLoading: mediaLoading } = useQuery({
    queryKey: ['pro-zone-media', category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('id, title, caption, file_url, file_type, thumbnail_url, pro_name, gallery_urls')
        .eq('category', category)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProZoneMediaItem[];
    },
    enabled: !!user && !!category,
  });

  // A category is valid if it's a built-in OR a coach-added custom section
  // that exists in the merged `categories` list returned by the hook.
  const isBuiltIn = PRO_ZONE_CATEGORIES.some((c) => c.key === category);
  const customMatch = categories.find((c) => c.key === category);
  const validCategory = isBuiltIn || !!customMatch;
  const meta = customMatch ?? { key: category, label: category, emoji: '⛳', isCustom: false as const };
  const displayLabel = (meta as any).isCustom ? meta.label : (PRO_ZONE_CATEGORY_LABEL_KEYS[meta.key] ? t(`prozone.${PRO_ZONE_CATEGORY_LABEL_KEYS[meta.key]}`) : meta.label);


  if (authLoading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Wait until categories load before deciding to redirect — custom categories
  // are fetched async and would otherwise be treated as invalid on first render.
  if (!validCategory && categories.length > 0) return <Navigate to="/pro-zone" replace />;

  // Paid tiers, or Free/Member users inside the 30-day trial (trial grants
  // access without changing their plan label).
  const hasAccess =
    effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex' || isInTrial(trialEndsAt);

  if (!hasAccess) {
    return (
      <div className="app-bg min-h-screen px-4 py-12">
        <div className="max-w-md mx-auto glass-card p-8 text-center space-y-4">
          <Lock className="h-10 w-10 mx-auto text-gold-accent" />
          <h1 className="font-heading text-2xl font-bold text-ivory">{t('prozone.membersOnlyTitle')}</h1>
          <p className="text-ivory/70 text-sm">
            {t('prozone.membersOnlyBody').replace('{coach}', t('common.yourCoach'))}
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
            <p className="text-xs text-ivory/70">{displayLabel}</p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-5">
        <div className="glass-card p-5 flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: 'rgba(240,192,64,0.12)' }}
            aria-hidden
          >
            {meta.emoji}
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold text-ivory tracking-tight">
              {displayLabel}
            </h1>
            <p className="text-ivory/50 text-xs mt-0.5">
              {t('prozone.categoryLibraryHint').replace('{coach}', t('common.yourCoach')).replace('{category}', displayLabel.toLowerCase())}
            </p>
          </div>
        </div>

        {mediaLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
          </div>
        ) : (mediaItems && mediaItems.length > 0) ? (
          <ProZoneMediaGrid
            items={mediaItems}
            onCompare={(item) => navigate(`/pro-zone/compare?proId=${item.id}`)}
          />
        ) : (
          <div className="glass-card p-8 text-center space-y-4">
            <div
              className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(240,192,64,0.15)' }}
            >
              <Clock className="h-7 w-7 text-gold-accent" />
            </div>
            <h2 className="font-heading text-xl font-bold text-ivory">{t('prozone.comingSoonTitle')}</h2>
            <p className="text-ivory/60 text-sm max-w-md mx-auto">
              {t('prozone.comingSoonBody')}
            </p>
            <Link to="/pro-zone">
              <Button
                variant="outline"
                className="bg-white/5 border-white/10 text-ivory hover:bg-white/10"
              >
                {t('prozone.backToProZone')}
              </Button>
            </Link>
          </div>
        )}
      </main>
      <SocialFooter />
    </div>
  );
}