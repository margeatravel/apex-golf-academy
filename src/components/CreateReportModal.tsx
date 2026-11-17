import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, BarChart3, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth, getEffectivePlan } from '@/contexts/AuthContext';
import { getHolesFilterFor } from '@/lib/roundsFilterStore';
import {
  saveScoringReport,
  reportTitle as buildReportTitle,
  MAX_STUDENT_LESSON_REPORTS_PER_MONTH,
  type ReportType,
} from '@/lib/studentReports';
import { localeFor } from '@/lib/uiLocale';
import { REPORT_PERIOD_OPTIONS, SCORING_PERIOD_OPTIONS, studentHasPackage, defaultPeriodState, resolvePeriodRange, roundYears, periodLabelFor, type ReportPeriodPreset, type PeriodState } from '@/lib/reportPeriods';
import { ReportPeriodSelector } from '@/components/ReportPeriodSelector';
import type { RoundRow } from '@/components/RoundsList';

interface CreateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onReportGenerated: (report: string, studentName: string, dateStart: string, dateEnd: string) => void;
  /** Called after a report is generated and stored. */
  onScoringSaved?: () => void;
  /** 'student' = the student generates for themselves (auto-saved, monthly limit). */
  mode?: 'admin' | 'student';
}


export function CreateReportModal({ open, onOpenChange, studentId, studentName, onReportGenerated, onScoringSaved, mode = 'admin' }: CreateReportModalProps) {
  const [step, setStep] = useState<'type' | 'period'>('type');
  const [type, setType] = useState<ReportType>('lesson');
  const [period, setPeriod] = useState<PeriodState>(() => defaultPeriodState('this_month'));
  const [years, setYears] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const [lessonUsed, setLessonUsed] = useState(0);
  const [hasPackage, setHasPackage] = useState(false);

  useEffect(() => {
    if (!open) return;
    studentHasPackage(studentId).then((ok) => {
      setHasPackage(ok);
      if (!ok) setPeriod((p) => (p.preset === 'last_package' ? { ...p, preset: 'this_month' } : p));
    });
    roundYears(studentId).then(setYears);
  }, [open, studentId]);

  useEffect(() => {
    if (open) setStep('type');
  }, [open]);

  // Lesson reports the student already generated this calendar month.
  useEffect(() => {
    if (!open || mode !== 'student') return;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    supabase
      .from('student_reports')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('report_type', 'lesson')
      .eq('generated_by_student', true)
      .gte('created_at', monthStart)
      .then(({ count }) => setLessonUsed(count ?? 0));
  }, [open, mode, studentId]);

  const lessonLimitReached = mode === 'student' && lessonUsed >= MAX_STUDENT_LESSON_REPORTS_PER_MONTH;
  const reportTitle = (name: string, s: string, e: string) => buildReportTitle(name, s, e, localeFor(language));

  const getDateRange = (): Promise<{ start: string; end: string }> => resolvePeriodRange(period, studentId);

  /** Scoring report: no AI — reuses the Round Stats generator with the period's rounds. */
  const generateScoring = async (start: string, end: string) => {
    const periodLabel = periodLabelFor(period, { start, end }, localeFor(language));
    const [roundsRes, profileRes] = await Promise.all([
      supabase
        .from('golf_rounds')
        .select('*')
        .eq('student_id', studentId)
        .gte('played_on', start)
        .lte('played_on', end)
        .order('played_on', { ascending: false }),
      supabase
        .from('profiles')
        .select('full_name, handicap, plan_tier, manual_plan_override, override_expires_at, trial_ends_at')
        .eq('id', studentId)
        .maybeSingle(),
    ]);
    if (roundsRes.error) throw roundsRes.error;
    const rounds = (roundsRes.data ?? []) as RoundRow[];
    if (rounds.length === 0) {
      toast({ title: t('reports.noRoundsInRange'), variant: 'destructive' });
      return;
    }
    const displayName = profileRes.data?.full_name || studentName;
    await saveScoringReport({
      studentId,
      createdBy: user!.id,
      title: reportTitle(displayName, start, end),
      dateStart: start,
      dateEnd: end,
      snapshot: {
        v: 1,
        studentName: profileRes.data?.full_name || studentName,
        handicap: (profileRes.data as any)?.handicap ?? null,
        tier: getEffectivePlan((profileRes.data ?? null) as any),
        holesFilter: getHolesFilterFor(studentId),
        rounds,
        periodLabel,
      },
      generatedByStudent: mode === 'student',
    });
    toast({ title: t('reports.scoringSaved') });
    onScoringSaved?.();
    onOpenChange(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { start, end } = await getDateRange();
      if (type === 'scoring') {
        await generateScoring(start, end);
        return;
      }
      const isStudent = mode === 'student';
      const { data, error } = await supabase.functions.invoke('generate-student-report', {
        body: {
          student_id: studentId,
          date_start: start,
          date_end: end,
          language,
          persist: isStudent,
          title: isStudent ? reportTitle(studentName, start, end) : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error === 'lesson_report_limit' ? t('reports.lessonLimitReached') : data.error);
      if (isStudent) {
        toast({ title: t('reports.lessonSaved') });
        onScoringSaved?.();
      } else {
        onReportGenerated(data.report, data.studentName || studentName, start, end);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t('reports.generationFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };


  const typeCards: { value: ReportType; label: string; desc: string; Icon: typeof FileText }[] = [
    { value: 'scoring', label: t('reports.typeScoring'), desc: t('reports.typeScoringDesc'), Icon: BarChart3 },
    { value: 'lesson', label: t('reports.typeLesson'), desc: t('reports.typeLessonDesc'), Icon: FileText },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#F0C040]" />
            {t('reports.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('reports.createDesc').replace('{name}', studentName)}
          </DialogDescription>
        </DialogHeader>

        {step === 'type' ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('reports.typeStepTitle')}</p>
            {typeCards.map(({ value, label, desc, Icon }) => {
              const blocked = value === 'lesson' && lessonLimitReached;
              return (
                <button
                  key={value}
                  disabled={blocked}
                  onClick={() => { setType(value); setPeriod((p) => ({ ...p, preset: value === 'scoring' ? 'ytd' : 'this_month' })); setStep('period'); }}
                  className="w-full text-left rounded-xl border border-border p-4 hover:border-[#F0C040] hover:bg-muted/40 transition-colors flex gap-3 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Icon className="h-5 w-5 text-[#F0C040] shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block font-medium text-sm">{label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {blocked ? t('reports.lessonLimitReached') : desc}
                    </span>
                    {value === 'lesson' && mode === 'student' && !blocked && (
                      <span className="block text-[11px] text-muted-foreground/80 mt-1">
                        {t('reports.lessonLimitHint')
                          .replace('{used}', String(lessonUsed))
                          .replace('{max}', String(MAX_STUDENT_LESSON_REPORTS_PER_MONTH))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={() => setStep('type')}>
                <ChevronLeft className="h-4 w-4" /> {t('reports.back')}
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                {type === 'scoring' ? t('reports.typeScoring') : t('reports.typeLesson')}
              </span>
            </div>

            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('reports.periodStepTitle')}</p>
            <ReportPeriodSelector
              value={period}
              onChange={setPeriod}
              options={type === 'scoring' ? SCORING_PERIOD_OPTIONS : REPORT_PERIOD_OPTIONS}
              disabledPresets={hasPackage ? [] : ['last_package']}
              years={years}
            />

            <Button onClick={handleGenerate} disabled={generating} className="w-full bg-[#F0C040] text-[#0d1f18] hover:bg-[#d4a830]">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('reports.generating')}
                </>
              ) : (
                t('reports.generate')
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
