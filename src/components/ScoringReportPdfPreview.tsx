import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildStoredScoringReportBlob } from '@/lib/scoringReportBlob';
import type { StoredReport } from '@/lib/studentReports';
import type { ReportTier } from '@/lib/generateScoringReport';

/** iOS Safari (incl. iPadOS) cannot reliably render/scroll an embedded PDF. */
function isIosLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

/**
 * Shows the real downloadable scoring PDF inside the modal.
 * Desktop/Android: embedded viewer. iOS/Safari: opens in the native viewer.
 */
export function ScoringReportPdfPreview({
  report,
  studentName,
  tier,
}: {
  report: StoredReport;
  studentName: string;
  tier?: ReportTier | null;
}) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const nativeOnly = isIosLike();

  useEffect(() => {
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    try {
      const blob = buildStoredScoringReportBlob(report, { studentName, tier });
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch {
      setFailed(true);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [report.id, report.content, studentName, tier, attempt]);

  if (failed) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-sm text-[#0d1f18]">{t('reports.pdfError')}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
          <RotateCcw className="h-4 w-4 mr-1" /> {t('reports.retry')}
        </Button>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-[#4a7c59]" />
        <p className="text-xs text-[#0d1f18]/70">{t('reports.pdfLoading')}</p>
      </div>
    );
  }

  if (nativeOnly) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-sm text-[#0d1f18]">{t('reports.pdfNativeHint')}</p>
        <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank', 'noopener')}>
          <ExternalLink className="h-4 w-4 mr-1" /> {t('reports.openPdf')}
        </Button>
      </div>
    );
  }

  return (
    <iframe
      title={report.title || 'PDF'}
      src={url}
      className="w-full h-full rounded-md bg-white"
      onError={() => setFailed(true)}
    />
  );
}
