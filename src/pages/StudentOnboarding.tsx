import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Flag,
  FlagTriangleRight,
  Loader2,
  Repeat2,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getTierTheme } from '@/lib/tierTheme';

type Stage =
  | 'welcome'
  | 'comparison'
  | 'impact'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'building'
  | 'plan'
  | 'contrast'
  | 'testimonials'
  | 'paywall';

const QUESTION_STAGES: Stage[] = ['q1', 'q2', 'q3', 'q4'];

const HANDICAP_OPTIONS = [
  { value: 'none', key: 'q1a' },
  { value: 'over_25', key: 'q1b' },
  { value: '15_25', key: 'q1c' },
  { value: '5_15', key: 'q1d' },
  { value: 'under_5', key: 'q1e' },
];
const FOCUS_OPTIONS = [
  { value: 'short_game', key: 'q2a' },
  { value: 'putting', key: 'q2b' },
  { value: 'driving', key: 'q2c' },
  { value: 'approach', key: 'q2d' },
  { value: 'bunker', key: 'q2e' },
  { value: 'mental', key: 'q2f' },
];
const GOAL_OPTIONS = [
  { value: 'distance', key: 'q3a' },
  { value: 'direction', key: 'q3b' },
  { value: 'short_game', key: 'q3c' },
  { value: 'swing', key: 'q3d' },
  { value: 'beginner', key: 'q3e' },
];
const FREQUENCY_OPTIONS = [
  { value: 'rarely', key: 'q4a' },
  { value: 'monthly', key: 'q4b' },
  { value: 'weekly', key: 'q4c' },
  { value: 'several_weekly', key: 'q4d' },
];

/** Public labels used by the admin "Game profile" section as well. */
export const ONBOARDING_OPTION_KEYS = {
  handicap: HANDICAP_OPTIONS,
  focus: FOCUS_OPTIONS,
  goal: GOAL_OPTIONS,
  frequency: FREQUENCY_OPTIONS,
};

/**
 * One-time onboarding quiz for brand-new students.
 * Shown between successful sign-up and the portal; gated by
 * `profiles.onboarding_seen_at` (stamped as soon as the flow opens, so an
 * abandoned run is recorded as incomplete and never repeats).
 */
export default function StudentOnboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, setOnboardingSeenAt } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('welcome');
  const [handicap, setHandicap] = useState<string | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [checks, setChecks] = useState(0);
  const stampedRef = useRef(false);

  // Returning students (already finished the flow) never see it again: the
  // root role router sends them to their own home instead.
  const alreadyCompleted = Boolean((profile as any)?.onboarding_completed);
  useEffect(() => {
    if (alreadyCompleted) navigate('/', { replace: true });
  }, [alreadyCompleted, navigate]);

  // Stamp "seen" immediately so the flow can never repeat.
  useEffect(() => {
    if (!user || stampedRef.current || alreadyCompleted) return;
    stampedRef.current = true;
    void supabase
      .from('profiles')
      .update({ onboarding_seen_at: new Date().toISOString() } as any)
      .eq('id', user.id);
  }, [user]);

  // Building screen: tick the checkmarks, then reveal the plan.
  useEffect(() => {
    if (stage !== 'building') return;
    const timers = [
      window.setTimeout(() => setChecks(1), 800),
      window.setTimeout(() => setChecks(2), 1700),
      window.setTimeout(() => setChecks(3), 2600),
      window.setTimeout(() => setStage('plan'), 3600),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [stage]);

  const questionIndex = QUESTION_STAGES.indexOf(stage);

  const toggleFocus = (value: string) =>
    setFocus((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  // "All" pill in the focus question: picks every area, or clears them all.
  const allFocusSelected = focus.length === FOCUS_OPTIONS.length;
  const toggleAllFocus = () =>
    setFocus(allFocusSelected ? [] : FOCUS_OPTIONS.map((o) => o.value));


  const savePlan = async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({
            onboarding_handicap: handicap,
            onboarding_focus_areas: focus,
            onboarding_goal: goal,
            onboarding_frequency: frequency,
            onboarding_completed_at: new Date().toISOString(),
          } as any)
          .eq('id', user.id);
        if (error) throw error;
        await refreshProfile();
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
      setChecks(0);
      setStage('building');
    }
  };

  // Finish: persist the "seen" stamp, wait for the auth profile to refresh
  // (the route guard reads `profile.onboarding_seen_at`), then let the app's
  // own role router send the student to their home route.
  const [finishing, setFinishing] = useState(false);
  const finishOnboarding = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      if (user) {
        const seenAt = new Date().toISOString();
        const { data, error } = await supabase
          .from('profiles')
          .update({ onboarding_seen_at: seenAt, onboarding_completed: true })
          .eq('id', user.id)
          .select('onboarding_seen_at, onboarding_completed')
          .maybeSingle();
        if (error || !data?.onboarding_seen_at) {
          console.error('[StudentOnboarding] failed to save onboarding_seen_at:', error ?? 'No profile row was updated');
          toast({
            variant: 'destructive',
            title: language === 'en' ? 'Something went wrong' : 'No se pudo completar el registro',
            description:
              language === 'en'
                ? 'We could not complete your registration, please try again.'
                : 'No se pudo completar el registro, intenta de nuevo',
          });
          return; // don't navigate: keep the student on the last step to retry
        }
        setOnboardingSeenAt(data.onboarding_seen_at);
        void refreshProfile();
        navigate('/', { replace: true });
      } else {
        toast({
          variant: 'destructive',
          title: language === 'en' ? 'Session expired' : 'La sesión expiró',
          description:
            language === 'en'
              ? 'Please sign in again to finish your registration.'
              : 'Inicia sesión de nuevo para completar tu registro.',
        });
      }
    } finally {
      setFinishing(false);
    }
  };

  const focusLabels = useMemo(
    () =>
      focus
        .map((v) => FOCUS_OPTIONS.find((o) => o.value === v))
        .filter((option): option is { value: string; key: string } => Boolean(option))
        .map((option) => t(`onboarding.${option.key}`))
        .join(', '),
    [focus, t],
  );

  const phase1Desc =
    goal === 'beginner' || handicap === 'none'
      ? t('onboarding.phase1BeginnerDesc')
      : t('onboarding.phase1Desc');

  const goalOption = GOAL_OPTIONS.find((option) => option.value === goal);
  const handicapOption = HANDICAP_OPTIONS.find((option) => option.value === handicap);

  const goBack = () => {
    const idx = QUESTION_STAGES.indexOf(stage);
    if (idx <= 0) setStage('impact');
    else setStage(QUESTION_STAGES[idx - 1]);
  };

  const OptionButton = ({
    label,
    selected,
    onClick,
  }: { label: string; selected: boolean; onClick: () => void }) => (
    <Button
      type="button"
      onClick={onClick}
      variant="outline"
      className={`h-auto w-full justify-start whitespace-normal rounded-2xl border px-4 py-3.5 text-left text-ivory transition-all hover:text-ivory ${
        selected
          ? 'border-gold-accent bg-gold-accent/15 shadow-[0_0_0_1px_hsl(var(--gold)/0.4)] hover:bg-gold-accent/15'
          : 'border-border bg-card hover:bg-card/80'
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">{label}</span>
        {selected && <Check className="h-4 w-4 shrink-0 text-gold-accent" />}
      </span>
    </Button>
  );

  const Question = ({
    titleKey,
    hintKey,
    options,
    isSelected,
    onSelect,
    canContinue,
    onContinue,
    continueLabel,
    allOption,
  }: {
    titleKey: string;
    hintKey?: string;
    options: { value: string; key: string }[];
    isSelected: (v: string) => boolean;
    onSelect: (v: string) => void;
    canContinue: boolean;
    onContinue: () => void;
    continueLabel: string;
    allOption?: { label: string; selected: boolean; onClick: () => void };
  }) => (

    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={goBack}
            variant="ghost"
            size="icon"
            className="-ml-2 rounded-full text-ivory/70 hover:bg-card hover:text-ivory"
            aria-label={t('onboarding.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">
            {t('onboarding.progress')
              .replace('{current}', String(questionIndex + 1))
              .replace('{total}', '4')}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={`h-full rounded-full bg-gold-accent transition-all duration-500 ${
              questionIndex === 0 ? 'w-1/4' : questionIndex === 1 ? 'w-1/2' : questionIndex === 2 ? 'w-3/4' : 'w-full'
            }`}
          />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ivory">{t(titleKey)}</h1>
        {hintKey && <p className="text-sm text-ivory/55 mt-1">{t(hintKey)}</p>}
      </div>

      <div className="space-y-3">
        {allOption && (
          <OptionButton
            label={allOption.label}
            selected={allOption.selected}
            onClick={allOption.onClick}
          />
        )}
        {options.map((o) => (
          <OptionButton
            key={o.value}
            label={t(`onboarding.${o.key}`)}
            selected={isSelected(o.value)}
            onClick={() => onSelect(o.value)}
          />
        ))}
      </div>


      <Button
        type="button"
        disabled={!canContinue || saving}
        onClick={onContinue}
        className="h-12 w-full rounded-2xl bg-gold-accent font-bold text-accent-foreground hover:bg-gold-accent/90 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : continueLabel}
      </Button>
    </div>
  );

  const ContinueButton = ({ onClick }: { onClick: () => void }) => (
    <Button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-2xl bg-gold-accent font-bold text-accent-foreground hover:bg-gold-accent/90"
    >
      {t('onboarding.continue')}
    </Button>
  );

  const Eyebrow = ({ icon: Icon, label }: { icon?: typeof Flag; label: string }) => (
    <div className="flex items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-gold-accent">
      {Icon && <Icon className="h-4 w-4" />}
      <span className="text-gold-accent">{label}</span>
    </div>
  );

  return (
    <div className="app-bg app-bg-green flex min-h-screen justify-center px-5 py-10 safe-top safe-bottom">
      <div className="w-full max-w-md self-center">
        <div className="mb-4 flex w-full justify-end">
          <LanguageToggle variant="header" />
        </div>
        <div className="glass-card relative rounded-3xl p-6 sm:p-8 animate-fade-in" key={stage}>
          {stage === 'welcome' && (
            <div className="space-y-7">
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gold-accent/30 bg-gold-accent/15 shadow-glow-accent">
                  <FlagTriangleRight className="h-8 w-8 text-gold-accent" />
                </div>
                <h1 className="text-3xl font-bold text-ivory leading-tight">
                  {t('onboarding.welcomeTitle')}
                </h1>
                <p className="text-ivory/60 text-sm">{t('onboarding.welcomeSubtitle')}</p>
              </div>
              <div className="space-y-4">
                {[
                  { icon: ClipboardList, key: 'step1' },
                  { icon: Target, key: 'step2' },
                  { icon: Sparkles, key: 'step3' },
                ].map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-accent/15 text-sm font-bold text-gold-accent">
                      {i + 1}
                    </span>
                    <span className="text-ivory/85 text-[15px]">{t(`onboarding.${s.key}`)}</span>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                onClick={() => setStage('comparison')}
                className="h-12 w-full rounded-2xl bg-gold-accent font-bold text-accent-foreground hover:bg-gold-accent/90"
              >
                {t('onboarding.start')}
              </Button>
            </div>
          )}

          {stage === 'comparison' && (
            <div className="space-y-7 text-center">
              <Eyebrow label={t('onboarding.academyData')} />
              <h1 className="text-3xl font-bold leading-tight text-ivory">{t('onboarding.comparisonTitle')}</h1>
              <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                <div className="relative h-48 overflow-hidden border-b border-l border-border">
                  <svg className="h-full w-full" viewBox="0 0 320 180" role="img" aria-label={t('onboarding.comparisonTitle')}>
                    <path d="M12 156 C 82 146, 150 130, 308 108" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="4" strokeLinecap="round" />
                    <path d="M12 156 C 92 142, 160 98, 308 24" fill="none" stroke="hsl(var(--gold))" strokeWidth="7" strokeLinecap="round" />
                    <circle cx="12" cy="156" r="6" fill="hsl(var(--gold))" />
                  </svg>
                </div>
                <div className="flex justify-center gap-6 text-xs">
                  <span className="flex items-center gap-2 text-ivory/60"><i className="h-1 w-6 rounded-full bg-muted-foreground" />{t('onboarding.withoutPlan')}</span>
                  <span className="flex items-center gap-2 text-ivory"><i className="h-1.5 w-6 rounded-full bg-gold-accent" />{t('onboarding.withPlan')}</span>
                </div>
                <p className="text-xs text-ivory/40">{t('onboarding.dataPending')}</p>
              </div>
              <ContinueButton onClick={() => setStage('impact')} />
            </div>
          )}

          {stage === 'impact' && (
            <div className="space-y-8 text-center">
              <Eyebrow label={t('onboarding.didYouKnow')} />
              <h1 className="text-3xl font-bold leading-tight text-ivory">{t('onboarding.impactTitle')}</h1>
              <div className="space-y-5 rounded-2xl border border-border bg-card p-5 text-left">
                {[
                  { label: t('onboarding.withoutPlan'), value: t('onboarding.impactWithoutPlanValue'), width: 'w-[22%]', gold: false },
                  { label: t('onboarding.withPlan'), value: t('onboarding.impactWithPlanValue'), width: 'w-[78%]', gold: true },
                ].map((bar) => (
                  <div key={bar.label} className="space-y-2">
                    <div className="flex justify-between text-sm font-semibold"><span>{bar.label}</span><span>{bar.value}</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-foreground/10"><div className={`h-full rounded-full ${bar.width} ${bar.gold ? 'bg-gold-accent' : 'bg-muted-foreground'}`} /></div>
                  </div>
                ))}
                <p className="pt-1 text-center text-xs text-ivory/40">{t('onboarding.sourcePending')}</p>
              </div>
              <ContinueButton onClick={() => setStage('q1')} />
            </div>
          )}

          {stage === 'q1' && (
            <Question
              titleKey="onboarding.q1"
              options={HANDICAP_OPTIONS}
              isSelected={(v) => handicap === v}
              onSelect={setHandicap}
              canContinue={!!handicap}
              onContinue={() => setStage('q2')}
              continueLabel={t('onboarding.next')}
            />
          )}
          {stage === 'q2' && (
            <Question
              titleKey="onboarding.q2"
              hintKey="onboarding.q2hint"
              options={FOCUS_OPTIONS}
              isSelected={(v) => focus.includes(v)}
              onSelect={toggleFocus}
              canContinue={focus.length > 0}
              onContinue={() => setStage('q3')}
              continueLabel={t('onboarding.next')}
              allOption={{
                label: t('onboarding.q2all'),
                selected: allFocusSelected,
                onClick: toggleAllFocus,
              }}
            />
          )}

          {stage === 'q3' && (
            <Question
              titleKey="onboarding.q3"
              options={GOAL_OPTIONS}
              isSelected={(v) => goal === v}
              onSelect={setGoal}
              canContinue={!!goal}
              onContinue={() => setStage('q4')}
              continueLabel={t('onboarding.next')}
            />
          )}
          {stage === 'q4' && (
            <Question
              titleKey="onboarding.q4"
              options={FREQUENCY_OPTIONS}
              isSelected={(v) => frequency === v}
              onSelect={setFrequency}
              canContinue={!!frequency}
              onContinue={savePlan}
              continueLabel={t('onboarding.buildPlan')}
            />
          )}

          {stage === 'building' && (
            <div className="space-y-7 py-6 text-center">
              <div className="space-y-3">
                <FlagTriangleRight className="mx-auto h-14 w-14 text-gold-accent" />
                <h1 className="text-2xl font-bold text-ivory">{t('onboarding.buildingTitle')}</h1>
                <p className="text-sm text-ivory/55">{t('onboarding.buildingSubtitle')}</p>
              </div>
              <div className="space-y-3 text-left">
                {[
                  {
                    label: t('onboarding.buildingLevel'),
                    detail: goalOption ? t(`onboarding.${goalOption.key}`) : '',
                  },
                  {
                    label: t('onboarding.buildingHandicap'),
                    detail: handicapOption ? t(`onboarding.${handicapOption.key}`) : '',
                  },
                  { label: t('onboarding.buildingAreas').replace('{count}', String(focus.length)), detail: focusLabels },
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-start gap-3 rounded-2xl bg-card px-4 py-3 transition-opacity ${checks > i ? 'opacity-100' : 'opacity-35'}`}
                  >
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checks > i ? 'text-success' : 'text-ivory/25'}`} />
                    <div className="min-w-0">
                      <p className="text-ivory text-sm font-semibold">{row.label}</p>
                      {row.detail && <p className="text-ivory/55 text-xs mt-0.5">{row.detail}</p>}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold-accent" />
                  <p className="text-sm font-semibold text-ivory">{t('onboarding.buildingProgression')}</p>
                </div>
              </div>
            </div>
          )}

          {stage === 'plan' && (
            <div className="space-y-6">
              <Eyebrow icon={Flag} label={t('onboarding.planReady')} />
              <h1 className="text-2xl font-bold text-ivory">{t('onboarding.planTitle')}</h1>
              {saveFailed && (
                <p className="text-xs text-ivory/60">{t('onboarding.saveError')}</p>
              )}
              <div className="space-y-3">
                {[
                  { n: 1, icon: Target, title: t('onboarding.phase1'), desc: phase1Desc },
                  {
                    n: 2,
                    icon: Repeat2,
                    title: t('onboarding.phase2'),
                    desc: focusLabels
                      ? `${t('onboarding.phase2Desc')} ${t('onboarding.focusOn').replace('{areas}', focusLabels)}`
                      : t('onboarding.phase2Desc'),
                  },
                  { n: 3, icon: FlagTriangleRight, title: t('onboarding.phase3'), desc: t('onboarding.phase3Desc') },
                ].map((p) => (
                  <div
                    key={p.n}
                    className="rounded-2xl border border-gold-accent/25 bg-card px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-accent/15 text-gold-accent">
                        <p.icon className="h-4 w-4" />
                      </span>
                      <p className="text-ivory font-semibold text-[15px]">{p.title}</p>
                    </div>
                    <p className="text-ivory/60 text-sm mt-2 leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                onClick={() => setStage('contrast')}
                className="h-12 w-full rounded-2xl bg-gold-accent font-bold text-accent-foreground hover:bg-gold-accent/90"
              >
                {t('onboarding.continuePlan')}
              </Button>
            </div>
          )}

          {stage === 'contrast' && (
            <div className="space-y-7 text-center">
              <h1 className="text-3xl font-bold leading-tight text-ivory">{t('onboarding.contrastTitle')}</h1>
              <div className="rounded-2xl border border-border bg-card px-8 pb-5 pt-8">
                <div className="flex items-end justify-center gap-14" style={{ height: 180 }}>
                  {[
                    { label: t('onboarding.withoutPlan'), value: t('onboarding.contrastWithoutPlanValue'), pct: 9, gold: false },
                    { label: t('onboarding.withPlan'), value: t('onboarding.contrastWithPlanValue'), pct: 91, gold: true },
                  ].map((bar) => (
                    <div key={bar.label} className="flex h-full w-16 flex-col items-center justify-end gap-2">
                      <span className="text-sm font-bold text-ivory">{bar.value}</span>
                      <div
                        className="w-16 rounded-lg"
                        style={{
                          height: Math.max(12, (bar.pct / 100) * 140),
                          backgroundColor: bar.gold ? '#F0C040' : '#9CA3AF',
                        }}
                      />
                      <span className="text-xs text-ivory/60">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-ivory/40">{t('onboarding.contrastPlaceholder')}</p>
              <ContinueButton onClick={() => setStage('testimonials')} />
            </div>
          )}

          {stage === 'testimonials' && (
            <div className="space-y-6">
              <Eyebrow label={t('onboarding.testimonialsEyebrow')} />
              <h1 className="text-center text-3xl font-bold leading-tight text-ivory">{t('onboarding.testimonialsTitle')}</h1>
              <div className="space-y-3">
                {[
                  { scoreKey: 'testimonial1Score', quoteKey: 'testimonial1Quote', authorKey: 'testimonial1Author' },
                  { scoreKey: 'testimonial2Score', quoteKey: 'testimonial2Quote', authorKey: 'testimonial2Author' },
                ].map((item) => (
                  <article key={item.scoreKey} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex" aria-label="5 stars">{[0, 1, 2, 3, 4].map((star) => <Star key={star} className="h-4 w-4 fill-gold-accent text-gold-accent" />)}</div>
                      <span className="text-sm font-bold text-gold-accent">{t(`onboarding.${item.scoreKey}`)}</span>
                    </div>
                    <blockquote className="text-sm leading-relaxed text-ivory">“{t(`onboarding.${item.quoteKey}`)}”</blockquote>
                    <p className="text-xs text-ivory/45">{t(`onboarding.${item.authorKey}`)}</p>
                  </article>
                ))}
              </div>
              <ContinueButton onClick={() => setStage('paywall')} />
            </div>
          )}

          {stage === 'paywall' && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <Eyebrow label={t('onboarding.paywallEyebrow')} />
                <h1 className="text-3xl font-bold leading-tight text-ivory">{t('onboarding.paywallTitle')}</h1>
                <p className="text-sm text-ivory/60">{t('onboarding.paywallSubtitle')}</p>
              </div>
              <div className="space-y-0">
                {[
                  { title: t('onboarding.timelineToday'), desc: t('onboarding.timelineTodayDesc'), done: true },
                  { title: t('onboarding.timelineDay25'), desc: t('onboarding.timelineDay25Desc'), done: false },
                  { title: t('onboarding.timelineDay30'), desc: t('onboarding.timelineDay30Desc'), done: false },
                ].map((point, index) => (
                  <div key={point.title} className="flex gap-3">
                    <div className="flex w-6 flex-col items-center">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${point.done ? 'border-success bg-success text-ivory' : 'border-gold-accent/50 bg-gold-accent/10 text-gold-accent'}`}>
                        {point.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold text-gold-accent">{index + 1}</span>}
                      </span>
                      {index < 2 && <span className="h-9 w-px bg-border" />}
                    </div>
                    <div className="pb-4"><p className="text-sm font-bold text-ivory">{point.title}</p><p className="text-xs text-ivory/55">{point.desc}</p></div>
                  </div>
                ))}
              </div>
              <Button type="button" onClick={() => void finishOnboarding()} disabled={finishing} className="h-12 w-full rounded-2xl bg-gold-accent font-bold text-accent-foreground hover:bg-gold-accent/90">
                {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : t('onboarding.startTrial')}
              </Button>
              <p className="text-center text-xs text-ivory/40">{t('onboarding.noAutoCharge')}</p>
            </div>
          )}
        </div>
        {!profile && <div className="sr-only">loading</div>}
      </div>
    </div>
  );
}
