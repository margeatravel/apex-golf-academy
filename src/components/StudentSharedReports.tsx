import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Download, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { localeFor } from '@/lib/uiLocale';
import { downloadStoredReport, formatReportRange } from '@/lib/studentReports';
import { useMyVisibleReports } from '@/components/StudentReportsPanel';

/** Home card: shows only the most recent visible report + a link to the Reports tab. */
export function StudentSharedReports() {
  const { user, profile, effectivePlan } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { data: reports = [], isLoading } = useMyVisibleReports();

  if (isLoading || reports.length === 0) return null;
  const latest = reports[0];
  const isScoring = latest.report_type === 'scoring';

  const download = () => {
    try {
      downloadStoredReport(latest, {
        studentName: profile?.full_name || user?.email || 'Student',
        tier: effectivePlan,
        labels: {
          eyebrow: t('reports.lessonReportEyebrow'),
          period: t('reports.period'),
          fileName: 'lesson-report',
        },
      });
    } catch (err: any) {
      toast({ title: t('reports.downloadFailed'), description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Card className="border-[#F0C040]/30">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#F0C040]" />
          {t('reports.reportsTab')}
        </CardTitle>
        <Link to="/pro-zone/stats?view=reports" className="text-xs text-[#F0C040] hover:underline">
          {t('reports.seeAll')}
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 border rounded-lg p-3">
          {isScoring
            ? <BarChart3 className="h-4 w-4 text-[#4a7c59] shrink-0" />
            : <FileText className="h-4 w-4 text-[#F0C040] shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{latest.title}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <Badge variant="outline" className="text-[10px]">
                {isScoring ? t('reports.typeScoring') : t('reports.typeLesson')}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatReportRange(latest.date_range_start, latest.date_range_end, localeFor(language))}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={download}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
