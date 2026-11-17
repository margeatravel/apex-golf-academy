import { useParams, Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChildOverview, type Visibility } from '@/components/family/ChildOverview';
import { getTierTheme } from '@/lib/tierTheme';

export default function FamilyChildView() {
  const { childId } = useParams<{ childId: string }>();
  const { user, effectivePlan, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  // Accent comes from the VIEWER's plan (same source as the rest of the portal).
  const tierTheme = getTierTheme(effectivePlan);

  const { data: link, isLoading: linkLoading } = useQuery({
    queryKey: ['family-link-check', user?.id, childId],
    queryFn: async () => {
      if (!user?.id || !childId) return null;
      // Accept the link in either direction: I am the parent of :childId,
      // or :childId is a parent of mine.
      const { data, error } = await supabase
        .from('family_links')
        .select('id, visibility, parent_user_id, child_user_id, relationship')
        .or(
          `and(parent_user_id.eq.${user.id},child_user_id.eq.${childId}),` +
          `and(child_user_id.eq.${user.id},parent_user_id.eq.${childId})`,
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!childId,
  });

  const { data: childName } = useQuery({
    queryKey: ['family-child-name', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', childId!)
        .maybeSingle();
      return data?.full_name || data?.email || t('home.childOverviewChildFallback');
    },
    enabled: !!childId && !!link,
  });

  if (authLoading || linkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ivory">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-ivory p-6 text-center">
        <p>{t('home.childOverviewNoAccess')}</p>
        <Link to="/dashboard" className="text-[#F0C040] underline text-sm">{t('home.childOverviewBackToDashboard')}</Link>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen pb-20">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{
          background: tierTheme.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          borderBottom: `1px solid ${tierTheme.border}`,
        }}
      >
        <Link to="/dashboard" className="text-ivory/70 hover:text-ivory">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs text-ivory/50">
            {(link as any).relationship === 'pareja'
              ? t('home.childOverviewPartnerView')
              : t('home.childOverviewParentView')}
          </p>
          <h1 className="text-base font-semibold text-ivory truncate">{childName ?? '…'}</h1>
        </div>
        <div className="ml-auto">
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        <ChildOverview childId={childId!} visibility={(link as any).visibility as Visibility} canCreateReport={false} />
      </main>
    </div>
  );
}