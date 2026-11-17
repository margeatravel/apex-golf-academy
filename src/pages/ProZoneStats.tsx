import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, hasProZoneAccess, isTrialExpired } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3, FileText, Loader2, Lock, MapPin, Plus, Sparkles } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { RoundsList } from '@/components/RoundsList';
import { LogRoundModal } from '@/components/LogRoundModal';
import { ManageCoursesModal } from '@/components/ManageCoursesModal';
import { SocialFooter } from '@/components/SocialFooter';
import { ApexMark } from '@/components/ApexBrand';
import { useLanguage } from '@/contexts/LanguageContext';
import { StudentReportsPanel } from '@/components/StudentReportsPanel';
import { CreateReportModal } from '@/components/CreateReportModal';
import { HandicapProgress } from '@/components/HandicapProgress';

export default function ProZoneStats() {
  const { user, profile, effectivePlan, graceUntil, trialEndsAt, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [logOpen, setLogOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (authLoading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const hasAccess = hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);
  const isFreeTier = effectivePlan === 'free' || effectivePlan === 'member';
  const trialExpired = isFreeTier && isTrialExpired(trialEndsAt);

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/pro-zone" className="text-ivory/80 hover:text-ivory"><ArrowLeft className="h-4 w-4" /></Link>
            <Link to="/dashboard" aria-label="Home"><ApexMark size="md" /></Link>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ivory/40">{t('prozone2.stats.headerEyebrow')}</p>
            <p className="text-xs text-foreground/70">{language === 'es' ? 'Scores y Handicap' : 'Scores & Handicap'}</p>
          </div>
          <LanguageToggle variant="header" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-5">
        <HandicapProgress />
        {!hasAccess || trialExpired ? (
          <div className="glass-card p-6 text-center space-y-4">
            <div
              className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(240,192,64,0.15)' }}
            >
              <Lock className="h-7 w-7 text-gold-accent" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-ivory tracking-tight">
                {trialExpired
                  ? t('prozone2.stats.lockedTrialTitle')
                  : t('prozone2.stats.lockedMembersTitle')}
              </h1>
              <p className="text-ivory/60 text-sm mt-1 max-w-md mx-auto">
                {trialExpired
                  ? t('prozone2.stats.lockedTrialDesc')
                  : t('prozone2.stats.lockedMembersDesc')}
              </p>
            </div>
            <Button
              onClick={() => navigate('/plans')}
              className="h-11 px-5 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
            >
              <Sparkles className="h-4 w-4" /> {trialExpired ? t('prozone2.stats.viewPlans') : t('prozone2.stats.seePlans')}
            </Button>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-gold-accent/15">
                  <BarChart3 className="h-5 w-5 text-gold-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-foreground font-heading text-xl font-semibold">{language === 'es' ? 'Scores y Handicap' : 'Scores & Handicap'}</h1>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setLogOpen(true)}
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 text-sm min-w-0"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t('prozone2.stats.addRound')}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCoursesOpen(true)}
                  className="gap-2 bg-secondary border-border text-foreground hover:bg-secondary text-sm min-w-0"
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t('prozone2.stats.myCourses')}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReportOpen(true)}
                  className="col-span-2 gap-2 bg-secondary border-accent/40 text-foreground hover:bg-accent/10 text-sm min-w-0"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gold-accent" />
                  <span className="truncate">{t('reports.generateReport')}</span>
                </Button>
              </div>
            </section>

            <RoundsList
              studentId={user.id}
              emptyHint={t('prozone2.stats.emptyHint')}
              initialView={
                searchParams.get('view') === 'trends'
                  ? 'charts'
                  : searchParams.get('view') === 'reports'
                    ? 'reports'
                    : 'list'
              }
              initialMetric={(searchParams.get('metric') as import('@/lib/roundMetrics').RoundMetricKey) ?? undefined}
              reportsSlot={<StudentReportsPanel />}
            />

            <LogRoundModal open={logOpen} onOpenChange={setLogOpen} studentId={user.id} />
            <CreateReportModal
              open={reportOpen}
              onOpenChange={setReportOpen}
              studentId={user.id}
              studentName={profile?.full_name || user.email || 'Student'}
              mode="student"
              onReportGenerated={() => {}}
              onScoringSaved={() => queryClient.invalidateQueries({ queryKey: ['my-visible-reports', user.id] })}
            />
            <ManageCoursesModal
              open={coursesOpen}
              onOpenChange={setCoursesOpen}
              studentId={user.id}
            />
          </>
        )}
      </main>

      <SocialFooter />
    </div>
  );
}