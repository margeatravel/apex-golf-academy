import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Download, Eye, FileText, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { localeFor } from '@/lib/uiLocale';
import { downloadStoredReport, formatReportRange, reportDisplayTitle, type StoredReport } from '@/lib/studentReports';
import { ScoringReportPdfPreview } from '@/components/ScoringReportPdfPreview';

/** Reports the student can see: shared by the Coach + the ones they generated. */
export function useMyVisibleReports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-visible-reports', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_reports')
        .select('*')
        .eq('student_id', user!.id)
        .eq('hidden_by_student', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as StoredReport[];
    },
    enabled: !!user?.id,
  });
}

export function StudentReportsPanel() {
  const { user, profile, effectivePlan } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useMyVisibleReports();
  const [viewing, setViewing] = useState<StoredReport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredReport | null>(null);
  const [working, setWorking] = useState(false);

  const studentName = profile?.full_name || user?.email || 'Student';


  const download = (r: StoredReport) => {
    try {
      downloadStoredReport(r, {
        studentName,
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setWorking(true);
    try {
      if (pendingDelete.generated_by_student) {
        const { error } = await supabase.from('student_reports').delete().eq('id', pendingDelete.id);
        if (error) throw error;
        toast({ title: t('reports.reportDeleted') });
      } else {
        const { error } = await supabase.rpc('hide_student_report' as any, { _report_id: pendingDelete.id });
        if (error) throw error;
        toast({ title: t('reports.removedFromProfile') });
      }
      qc.invalidateQueries({ queryKey: ['my-visible-reports', user?.id] });
      setPendingDelete(null);
    } catch (err: any) {
      toast({ title: t('reports.deleteFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const renderMarkdown = (md: string) =>
    md.split('\n').map((line, i) => {
      const s = line.trim();
      if (!s) return <br key={i} />;
      if (s.startsWith('### ')) return <h3 key={i} className="text-sm font-bold mt-3 mb-1 text-[#4a7c59]">{s.slice(4)}</h3>;
      if (s.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-4 mb-1 text-[#4a7c59]">{s.slice(3)}</h2>;
      if (s.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mt-4 mb-2 text-[#0d1f18]">{s.slice(2)}</h1>;
      if (s.startsWith('- ') || s.startsWith('* ')) return <li key={i} className="text-sm ml-4 list-disc text-[#0d1f18]">{s.slice(2)}</li>;
      return <p key={i} className="text-sm text-[#0d1f18]" dangerouslySetInnerHTML={{ __html: s.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />;
    });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ivory/50" /></div>;
  }

  if (reports.length === 0) {
    return <p className="text-sm text-ivory/50 py-6 text-center">{t('reports.noReportsYet')}</p>;
  }

  return (
    <div className="space-y-2">
      {reports.map((r) => {
        const isScoring = r.report_type === 'scoring';
        return (
          <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-gold-accent/15 shrink-0">
              {isScoring ? <BarChart3 className="h-4 w-4 text-green-accent" /> : <FileText className="h-4 w-4 text-gold-accent" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ivory truncate">{reportDisplayTitle(r, studentName, localeFor(language))}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <Badge variant="outline" className="text-[10px] border-white/15 text-ivory/70">
                  {isScoring ? t('reports.typeScoring') : t('reports.typeLesson')}
                </Badge>
                <span className="text-[11px] text-ivory/50">
                  {formatReportRange(r.date_range_start, r.date_range_end, localeFor(language))}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-ivory/70 hover:text-ivory" onClick={() => setViewing(r)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-ivory/70 hover:text-ivory" onClick={() => download(r)}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400/80 hover:text-red-400" onClick={() => setPendingDelete(r)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-4 sm:p-6 gap-3">
          <DialogHeader className="shrink-0">
            <DialogTitle>{viewing && reportDisplayTitle(viewing, studentName, localeFor(language))}</DialogTitle>
            <DialogDescription className="sr-only">
              {viewing && (viewing.report_type === 'scoring' ? t('reports.typeScoring') : t('reports.typeLesson'))}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 border border-[#F0C040]/40 rounded-lg bg-[#fafaf7] overflow-hidden">
            {viewing && (viewing.report_type === 'scoring'
              ? <ScoringReportPdfPreview report={viewing} studentName={studentName} tier={effectivePlan} />
              : (
                <div className="h-full overflow-y-auto overscroll-contain p-4">
                  <div className="max-w-none text-[#0d1f18]">{renderMarkdown(viewing.content)}</div>
                </div>
              ))}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => viewing && download(viewing)}>
              <Download className="h-4 w-4 mr-1" /> {t('reports.downloadPdf')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('reports.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {pendingDelete?.generated_by_student ? t('reports.deleteOwnDesc') : t('reports.deleteSharedDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>{t('reports.cancel')}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : t('reports.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
