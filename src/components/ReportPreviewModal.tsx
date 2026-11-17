import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Download, Copy, RefreshCw, Loader2, Share2, FileText, Film } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, getEffectivePlan } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import JSZip from 'jszip';
import { generateLessonReportPdf } from '@/lib/generateLessonReportPdf';
import { reportTitle } from '@/lib/studentReports';
import { localeFor } from '@/lib/uiLocale';

interface ReportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: string;
  studentId: string;
  studentName: string;
  dateStart: string;
  dateEnd: string;
  onRegenerate: () => void;
  onSaved: () => void;
}

// Strip characters jsPDF helvetica can't render (emojis, non-Latin1) and
// normalize fancy punctuation so the PDF text is always clean ASCII-ish.
function sanitizeForPdf(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    // Drop anything outside Latin-1 (covers all emojis, CJK, symbols)
    .replace(/[^\x00-\xFF]/g, '');
}

// Simple markdown-to-text line parser for PDF
function markdownToLines(md: string): { text: string; level: 'h1' | 'h2' | 'h3' | 'body' | 'bullet' }[] {
  const lines: { text: string; level: 'h1' | 'h2' | 'h3' | 'body' | 'bullet' }[] = [];
  for (const raw of md.split('\n')) {
    const line = sanitizeForPdf(raw.trim());
    if (!line) { lines.push({ text: '', level: 'body' }); continue; }
    if (line.startsWith('### ')) lines.push({ text: line.slice(4), level: 'h3' });
    else if (line.startsWith('## ')) lines.push({ text: line.slice(3), level: 'h2' });
    else if (line.startsWith('# ')) lines.push({ text: line.slice(2), level: 'h1' });
    else if (line.startsWith('- ') || line.startsWith('* ')) lines.push({ text: line.slice(2), level: 'bullet' });
    else lines.push({ text: line, level: 'body' });
  }
  return lines;
}

export function ReportPreviewModal({ open, onOpenChange, report, studentId, studentName, dateStart, dateEnd, onRegenerate, onSaved }: ReportPreviewModalProps) {
  const [saving, setSaving] = useState(false);
  const [downloadingVideos, setDownloadingVideos] = useState(false);
  const [shareWithStudent, setShareWithStudent] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const contentRef = useRef<HTMLDivElement>(null);

  const title = reportTitle(studentName, dateStart, dateEnd, localeFor(language));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('student_reports' as any).insert({
        student_id: studentId,
        created_by: user?.id,
        title,
        date_range_start: dateStart,
        date_range_end: dateEnd,
        content: report,
        report_type: 'lesson',
        shared_with_student: shareWithStudent,
      });
      if (error) throw error;
      toast({ title: t('reports.saved') });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t('reports.saveFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    toast({ title: t('reports.copied') });
  };

  const handleDownloadVideos = async () => {
    setDownloadingVideos(true);
    try {
      const [videosRes, mediaRes] = await Promise.all([
        supabase.from('videos').select('title, file_url, upload_date')
          .eq('student_id', studentId)
          .gte('upload_date', dateStart).lte('upload_date', dateEnd),
        supabase.from('student_media' as any).select('title, file_url, uploaded_at')
          .eq('student_id', studentId)
          .gte('uploaded_at', dateStart + 'T00:00:00').lte('uploaded_at', dateEnd + 'T23:59:59'),
      ]);
      const items: { title: string; url: string }[] = [
        ...((videosRes.data || []) as any[]).map((v) => ({ title: v.title || 'video', url: v.file_url })),
        ...((mediaRes.data || []) as any[]).map((m) => ({ title: m.title || 'media', url: m.file_url })),
      ].filter((i) => !!i.url);

      if (items.length === 0) {
        toast({ title: t('reports.noVideosInRange'), variant: 'destructive' });
        return;
      }

      const zip = new JSZip();
      let ok = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        try {
          const res = await fetch(it.url);
          if (!res.ok) throw new Error('fetch failed');
          const blob = await res.blob();
          const ext = (it.url.split('.').pop() || 'mp4').split('?')[0].slice(0, 5);
          const safeName = `${String(i + 1).padStart(2, '0')}_${it.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60)}.${ext}`;
          zip.file(safeName, blob);
          ok++;
        } catch {
          failed++;
        }
      }

      if (ok === 0) {
        toast({ title: t('reports.downloadFailed'), variant: 'destructive' });
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${studentName.replace(/\s+/g, '_')}_Videos_${dateStart}_${dateEnd}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
      toast({
        title: t('reports.downloadedNVideos').replace('{n}', String(ok)),
        description: failed ? t('reports.nFailed').replace('{n}', String(failed)) : undefined,
      });
    } catch (err: any) {
      toast({ title: t('reports.downloadFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setDownloadingVideos(false);
    }
  };

  // Lesson Report PDF — same visual template as the Scoring Report,
  // accent color driven by the student's plan.
  const handleDownloadPDF = async () => {
    let tier: string | null = 'free';
    try {
      const { data } = await supabase
        .from('profiles')
        .select('plan_tier, manual_plan_override, override_expires_at, trial_ends_at')
        .eq('id', studentId)
        .maybeSingle();
      tier = getEffectivePlan((data ?? null) as any);
    } catch {
      /* fall back to neutral theme */
    }
    generateLessonReportPdf({
      studentName,
      content: report,
      dateStart,
      dateEnd,
      tier,
      labels: {
        eyebrow: t('reports.lessonReportEyebrow'),
        period: t('reports.period'),
        fileName: 'lesson-report',
      },
    });
  };

  // Render markdown as simple HTML
  const renderMarkdown = (md: string) => {
    const fmt = (s: string) =>
      s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '');
    return md.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;
      if (trimmed.startsWith('### ')) return <h3 key={i} className="text-sm font-bold mt-3 mb-1 text-[#4a7c59]">{trimmed.slice(4)}</h3>;
      if (trimmed.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-4 mb-1 text-[#4a7c59]">{trimmed.slice(3)}</h2>;
      if (trimmed.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mt-4 mb-2 text-[#0d1f18]">{trimmed.slice(2)}</h1>;
      if (/^[-*]\s+/.test(trimmed)) return <li key={i} className="text-sm ml-4 list-disc text-[#0d1f18]" dangerouslySetInnerHTML={{ __html: fmt(trimmed.replace(/^[-*]\s+/, '')) }} />;
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) return <p key={i} className="text-sm font-semibold text-[#0d1f18]">{trimmed.slice(2, -2)}</p>;
      return <p key={i} className="text-sm text-[#0d1f18]" dangerouslySetInnerHTML={{ __html: fmt(trimmed) }} />;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-4 sm:p-6 gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#F0C040]" />
            {t('reports.previewTitle')}
          </DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border border-[#F0C040]/40 rounded-lg p-4 bg-[#fafaf7]">
          <div ref={contentRef} className="max-w-none text-[#0d1f18]">
            {renderMarkdown(report)}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Switch id="share" checked={shareWithStudent} onCheckedChange={setShareWithStudent} />
          <Label htmlFor="share" className="text-sm">{t('reports.shareWithStudent')}</Label>
        </div>

        <div className="shrink-0 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving} className="bg-[#4a7c59] hover:bg-[#3d6b4a]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            {t('reports.saveReport')}
          </Button>
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-1" /> {t('reports.pdf')}
          </Button>
          <Button variant="outline" onClick={handleDownloadVideos} disabled={downloadingVideos}>
            {downloadingVideos ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Film className="h-4 w-4 mr-1" />}
            {t('reports.videos')}
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" /> {t('reports.copy')}
          </Button>
          <Button variant="outline" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4 mr-1" /> {t('reports.regenerate')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}