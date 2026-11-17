import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Trash2, Eye, Share2, Loader2, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getEffectivePlan } from '@/contexts/AuthContext';
import { downloadStoredReport, formatReportRange, reportDisplayTitle, type StoredReport } from '@/lib/studentReports';
import { ScoringReportPdfPreview } from '@/components/ScoringReportPdfPreview';
import { localeFor } from '@/lib/uiLocale';

interface StudentReportsTabProps {
  studentId: string;
  studentName: string;
}

export function StudentReportsTab({ studentId, studentName }: StudentReportsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [viewingReport, setViewingReport] = useState<StoredReport | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['student-reports', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_reports')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as StoredReport[];
    },
  });

  const { data: tier } = useQuery({
    queryKey: ['student-report-tier', studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('plan_tier, manual_plan_override, override_expires_at, trial_ends_at')
        .eq('id', studentId)
        .maybeSingle();
      return getEffectivePlan((data ?? null) as any);
    },
  });

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('student_reports').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['student-reports', studentId] });
      toast({ title: t('reports.reportDeleted') });
    } catch (err: any) {
      toast({ title: t('reports.deleteFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleShare = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase.from('student_reports').update({ shared_with_student: !current }).eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['student-reports', studentId] });
      toast({ title: !current ? t('reports.sharedWithStudent') : t('reports.unsharedFromStudent') });
    } catch (err: any) {
      toast({ title: t('reports.updateFailed'), description: err.message, variant: 'destructive' });
    }
  };

  const handleDownload = (r: StoredReport) => {
    try {
      downloadStoredReport(r, {
        studentName,
        tier,
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

  const renderMarkdown = (md: string) => {
    return md.split('\n').map((line, i) => {
      const s = line.trim();
      if (!s) return <br key={i} />;
      if (s.startsWith('### ')) return <h3 key={i} className="text-sm font-bold mt-3 mb-1 text-[#4a7c59]">{s.slice(4)}</h3>;
      if (s.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-4 mb-1 text-[#4a7c59]">{s.slice(3)}</h2>;
      if (s.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mt-4 mb-2 text-[#0d1f18]">{s.slice(2)}</h1>;
      if (s.startsWith('- ') || s.startsWith('* ')) return <li key={i} className="text-sm ml-4 list-disc text-[#0d1f18]">{s.slice(2)}</li>;
      return <p key={i} className="text-sm text-[#0d1f18]" dangerouslySetInnerHTML={{ __html: s.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />;
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t('reports.noReportsYet')}</p>
          </CardContent>
        </Card>
      ) : (
        reports.map((r) => {
          const isScoring = r.report_type === 'scoring';
          return (
            <Card key={r.id} className="hover:border-[#4a7c59]/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isScoring
                        ? <BarChart3 className="h-4 w-4 text-[#4a7c59] flex-shrink-0" />
                        : <FileText className="h-4 w-4 text-[#F0C040] flex-shrink-0" />}
                      <span className="font-medium text-sm truncate">{reportDisplayTitle(r, studentName, localeFor(language))}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {isScoring ? t('reports.typeScoring') : t('reports.typeLesson')}
                      </Badge>
                      {r.generated_by_student && (
                        <Badge variant="secondary" className="text-[10px]">{t('reports.generatedByStudent')}</Badge>
                      )}
                      {r.shared_with_student && <Badge variant="outline" className="text-xs">{t('reports.shared')}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(r.created_at), 'MMM d, yyyy')} • {formatReportRange(r.date_range_start, r.date_range_end, localeFor(language))}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingReport(r)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(r)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleShare(r.id, r.shared_with_student)}>
                      <Share2 className={`h-4 w-4 ${r.shared_with_student ? 'text-[#4a7c59]' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}>
                      {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* View Report Dialog (lesson reports) */}
      <Dialog open={!!viewingReport} onOpenChange={(o) => !o && setViewingReport(null)}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-4 sm:p-6 gap-3">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#F0C040]" />
              {viewingReport && reportDisplayTitle(viewingReport, studentName, localeFor(language))}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {viewingReport && (viewingReport.report_type === 'scoring' ? t('reports.typeScoring') : t('reports.typeLesson'))}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 border border-[#F0C040]/40 rounded-lg bg-[#fafaf7] overflow-hidden">
            {viewingReport && (viewingReport.report_type === 'scoring'
              ? <ScoringReportPdfPreview report={viewingReport} studentName={studentName} tier={tier} />
              : (
                <div className="h-full overflow-y-auto overscroll-contain p-4">
                  <div className="max-w-none text-[#0d1f18]">{renderMarkdown(viewingReport.content)}</div>
                </div>
              ))}
          </div>
          <div className="shrink-0 flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => viewingReport && handleDownload(viewingReport)}>
              <Download className="h-4 w-4 mr-1" /> {t('reports.downloadPdf')}
            </Button>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(viewingReport?.content || ''); toast({ title: t('reports.copied') }); }}>
              <Eye className="h-4 w-4 mr-1" /> {t('reports.copy')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
