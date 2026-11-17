import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateScoringReport } from '@/lib/generateScoringReport';
import { useToast } from '@/hooks/use-toast';
import type { RoundRow } from '@/components/RoundsList';
import { getEffectivePlan } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import { ReportPeriodSelector } from '@/components/ReportPeriodSelector';
import {
  SCORING_PERIOD_OPTIONS,
  defaultPeriodState,
  resolvePeriodRange,
  roundYears,
  periodLabelFor,
  type PeriodState,
} from '@/lib/reportPeriods';

interface Props {
  studentId: string;
  studentName: string;
  handicap: number | null;
}

export function CoachScoringReportButton({ studentId, studentName, handicap }: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodState>(() => defaultPeriodState('ytd'));
  const [years, setYears] = useState<number[]>([]);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!open || !studentId) return;
    setPeriod(defaultPeriodState('ytd'));
    roundYears(studentId).then((ys) => {
      setYears(ys);
      if (ys.length) setPeriod((p) => (ys.includes(p.year) ? p : { ...p, year: ys[0] }));
    });
  }, [open, studentId]);

  const handleClick = () => {
    if (!studentId) return;
    setOpen(true);
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const range = await resolvePeriodRange(period, studentId);
      const [{ data, error }, profileRes] = await Promise.all([
        supabase
          .from('golf_rounds')
          .select('*')
          .eq('student_id', studentId)
          .gte('played_on', range.start)
          .lte('played_on', range.end)
          .order('played_on', { ascending: false }),
        supabase
          .from('profiles')
          .select('plan_tier, manual_plan_override, override_expires_at, trial_ends_at')
          .eq('id', studentId)
          .maybeSingle(),
      ]);
      if (error) throw error;
      const rounds = (data ?? []) as RoundRow[];
      // PDF always includes every round of the period (18 and 9 in separate sections).
      if (rounds.length === 0) {
        toast({ title: t('reports.noRoundsInRange'), variant: 'destructive' });
        return;
      }
      generateScoringReport({
        studentName,
        handicap,
        rounds,
        holesFilter: 'both',
        tier: getEffectivePlan((profileRes.data ?? null) as any),
        periodLabel: periodLabelFor(period, range, localeFor(language)),
      });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Could not generate report', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={loading}
        className="w-full gap-2 bg-white/5 border-white/10 text-ivory hover:bg-white/10 text-sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Scoring Report (PDF)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('reports.typeScoring')}</DialogTitle>
            <DialogDescription>{t('reports.pickPeriod')}</DialogDescription>
          </DialogHeader>
          <ReportPeriodSelector
            value={period}
            onChange={setPeriod}
            options={SCORING_PERIOD_OPTIONS.filter((o) => o.value !== 'last_package' && o.value !== 'all_lessons')}
            years={years}
          />
          <Button onClick={handleDownload} disabled={loading} className="w-full bg-[#F0C040] text-[#0d1f18] hover:bg-[#d4a830]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
            {t('reports.download')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
