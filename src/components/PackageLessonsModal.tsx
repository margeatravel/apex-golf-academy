import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Package as PackageIcon, Plus, X, Check, Trash2, Share2 } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatLessonDate, formatLessonTime, getLessonSortKey } from '@/lib/formatLessonDateTime';
import { effectiveLessonStatus, isEffectivelyTaken } from '@/lib/lessonStatus';
import { computePackageCounts, buildWeightedLessonNumberMap, getWeightedLessonCount, isDoubleSlotLesson } from '@/lib/lessonPackageUsage';
import { translateLessonType } from '@/lib/lessonTypeLabel';
import { useLanguage } from '@/contexts/LanguageContext';

interface PackageLessonsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: any;
  studentId: string;
  onChanged?: () => void;
}

const isDoubleLesson = (type?: string | null) => isDoubleSlotLesson(type);

const DoubleLessonBadge = () => (
  <span
    className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold border border-[#F0C040]/40 bg-[#F0C040]/15 text-[#F0C040] whitespace-nowrap"
    title="2 hour lesson"
  >
    2 hour lesson
  </span>
);

export function PackageLessonsModal({ open, onOpenChange, pkg, studentId, onChanged }: PackageLessonsModalProps) {
  const [linkedLessons, setLinkedLessons] = useState<any[]>([]);
  const [unassignedLessons, setUnassignedLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingMode, setRemovingMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removeSelected, setRemoveSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'completed' | 'scheduled'>('completed');
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const { language } = useLanguage();

  const reload = async () => {
    if (!pkg?.id || !studentId) return;
    setLoading(true);
    const [linkedRes, unassignedRes] = await Promise.all([
      supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_start_at, lesson_type, status, package_id')
        .eq('package_id', pkg.id)
        .in('status', ['completed', 'no_show', 'scheduled']),
      supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_start_at, lesson_type, status, package_id')
        .eq('student_id', studentId)
        .is('package_id', null),
    ]);
    const sortAsc = (a: any, b: any) => getLessonSortKey(a).localeCompare(getLessonSortKey(b));
    const sortDesc = (a: any, b: any) => getLessonSortKey(b).localeCompare(getLessonSortKey(a));
    // Linked lessons: most recent first (top), oldest last (bottom)
    setLinkedLessons((linkedRes.data || []).sort(sortDesc));
    // Unassigned: also most recent first for consistency
    setUnassignedLessons((unassignedRes.data || []).sort(sortDesc));
    setSelected(new Set());
    setRemoveSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setAdding(false);
      setRemovingMode(false);
      setFilter('completed');
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id, studentId]);

  // Treat completed-but-future-dated lessons as 'scheduled' for counting/listing.
  // Single source of truth (see lib/lessonPackageUsage.ts)
  const pkgCounts = computePackageCounts(pkg ?? { id: '' }, linkedLessons);
  const completed = pkgCounts.used;
  const scheduled = pkgCounts.scheduled;

  // Completed and no-show lessons are listed in the body and exported to PDF.
  const visibleLessons = linkedLessons.filter((l) => isEffectivelyTaken(l));

  // Weighted lesson numbering: a 2-hour lesson consumes 2 slots.
  // Numbers are assigned chronologically (oldest = 1). A double-lesson at
  // slot 5 occupies 5 and 6, so the next lesson is numbered 7.
  const lessonNumberById = buildWeightedLessonNumberMap(visibleLessons);
  const visibleWeightedTotal = getWeightedLessonCount(visibleLessons);

  const removeLesson = async (lessonId: string) => {
    setBusy(lessonId);
    const { error } = await supabase.from('lessons').update({ package_id: null }).eq('id', lessonId);
    setBusy(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Lesson removed from package' });
    onChanged?.();
    reload();
  };

  const removeSelectedBulk = async () => {
    if (removeSelected.size === 0) return;
    setBusy('remove');
    const { error } = await supabase
      .from('lessons')
      .update({ package_id: null })
      .in('id', Array.from(removeSelected));
    setBusy(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${removeSelected.size} lesson(s) removed from package` });
    setRemovingMode(false);
    onChanged?.();
    reload();
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    setBusy('add');
    const { error } = await supabase
      .from('lessons')
      .update({ package_id: pkg.id })
      .in('id', Array.from(selected));
    setBusy(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${selected.size} lesson(s) added to package` });
    setAdding(false);
    onChanged?.();
    reload();
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRemove = (id: string) => {
    setRemoveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRemove = () => {
    if (removeSelected.size === linkedLessons.length) {
      setRemoveSelected(new Set());
    } else {
      setRemoveSelected(new Set(linkedLessons.map((l) => l.id)));
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      // Fetch student name (optional)
      let studentName = '';
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, first_name, last_name')
          .eq('id', studentId)
          .maybeSingle();
        if (prof) {
          studentName =
            (prof as any).full_name ||
            [(prof as any).first_name, (prof as any).last_name].filter(Boolean).join(' ') ||
            '';
        }
      } catch {}

      const packageTitle = pkg?.package_name || `${pkg?.package_size}-Lesson Package`;
      const all = [...linkedLessons]
        .filter((l) => isEffectivelyTaken(l))
        .sort((a, b) => getLessonSortKey(a).localeCompare(getLessonSortKey(b)));
      const lessonNumbers = buildWeightedLessonNumberMap(all);

      // Colors
      const BG = [15, 31, 23] as [number, number, number]; // #0f1f17
      const BG_TOP = [64, 112, 86] as [number, number, number];
      const GOLD = [240, 192, 64] as [number, number, number]; // #F0C040
      const GREEN = [74, 124, 89] as [number, number, number]; // #4a7c59
      const WHITE = [245, 240, 232] as [number, number, number]; // #F5F0E8
      const MUTED = [180, 180, 170] as [number, number, number];
      const EDGE = [170, 205, 182] as [number, number, number];
      // Dark plan accents are hard to read on the dark glass page; lift them.
      const isDark = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 110;
      const readable = (c: [number, number, number]): [number, number, number] =>
        isDark(c) ? c.map((v) => Math.round(v + (255 - v) * 0.55)) as [number, number, number] : c;

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;

      // Frosted glass page: soft light falloff plus gentle glow orbs.
      const paintBg = () => {
        doc.setFillColor(...BG);
        doc.rect(0, 0, pageW, pageH, 'F');
        for (let band = 0; band < 20; band++) {
          doc.setGState(doc.GState({ opacity: 0.04 }));
          doc.setFillColor(...BG_TOP);
          doc.rect(0, 0, pageW, pageH * (1 - band / 20), 'F');
        }
        doc.setGState(doc.GState({ opacity: 0.07 }));
        doc.setFillColor(...GOLD);
        doc.circle(pageW - 50, 60, 130, 'F');
        doc.setGState(doc.GState({ opacity: 0.05 }));
        doc.setFillColor(...WHITE);
        doc.circle(30, pageH - 70, 150, 'F');
        doc.setGState(doc.GState({ opacity: 1 }));
      };
      // Translucent glass card with a soft edge; optional accent top line.
      const glassCard = (x: number, yTop: number, w: number, h: number, edge: [number, number, number], accent?: [number, number, number]) => {
        doc.setGState(doc.GState({ opacity: 0.09 }));
        doc.setFillColor(...WHITE);
        doc.roundedRect(x, yTop, w, h, 6, 6, 'F');
        doc.setGState(doc.GState({ opacity: 0.45 }));
        doc.setDrawColor(...edge);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, yTop, w, h, 6, 6, 'S');
        if (accent) {
          doc.setGState(doc.GState({ opacity: 0.9 }));
          doc.setDrawColor(...accent);
          doc.setLineWidth(2);
          doc.line(x + 10, yTop + 1, x + Math.min(44, w - 10), yTop + 1);
        }
        doc.setGState(doc.GState({ opacity: 1 }));
      };
      const firstBenefit = (features: unknown): string => {
        const list = Array.isArray(features)
          ? features.filter((f): f is string => typeof f === 'string' && !/^\s*(No incluye:|Not included:)/i.test(f))
          : [];
        return (list[0] || '').trim();
      };
      paintBg();

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...GOLD);
      doc.text(packageTitle, margin, margin + 6);

      if (studentName) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(...WHITE);
        doc.text(studentName, margin, margin + 26);
      }

      // Compact promo banner, right under the header.
      let statsY = margin + (studentName ? 48 : 30);
      try {
        const { data: plans } = await supabase
          .from('billing_plans')
          .select('name, price_amount, tier_key, color, features')
          .eq('is_active', true)
          .eq('plan_type', 'subscription')
          .in('tier_key', ['family', 'familiar', 'scratch'])
          .order('sort_order');
        if (plans && plans.length) {
          const list = plans.slice(0, 2);
          const w = pageW - margin * 2;
          const bannerH = 66;
          const by = statsY;
          glassCard(margin, by, w, bannerH, GOLD, GOLD);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...GOLD);
          doc.text('Congela tu precio hoy', margin + 14, by + 17);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text('Tu precio se mantiene mientras sigas suscrito · apexgolf.com.mx', margin + 14, by + 28);
          const chipGap = 8;
          const cw = (w - 28 - chipGap) / 2;
          list.forEach((p: any, i: number) => {
            const hex = (p.color || '#4a7c59').replace('#', '');
            const raw: [number, number, number] = [0, 2, 4].map((o) => parseInt(hex.slice(o, o + 2), 16) || 0) as any;
            const rgb = readable(raw);
            const cx = margin + 14 + i * (cw + chipGap);
            const cy = by + 32;
            glassCard(cx, cy, cw, 28, rgb, rgb);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...WHITE);
            doc.text(p.name, cx + 10, cy + 11);
            doc.setFontSize(11);
            doc.setTextColor(...rgb);
            const price = `$${Math.round(p.price_amount / 100).toLocaleString('en-US')}`;
            doc.text(price, cx + 10, cy + 23);
            const pw = doc.getTextWidth(price);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...MUTED);
            doc.text('MXN/mes', cx + 12 + pw, cy + 23);
            const benefit = firstBenefit(p.features);
            if (benefit) {
              let line = benefit;
              while (line.length > 1 && doc.getTextWidth(line) > cw - 78) line = line.slice(0, -1);
              if (line !== benefit) line = line.replace(/[\s,.]+$/, '') + '…';
              doc.text(line, cx + cw - doc.getTextWidth(line) - 8, cy + 23);
            }
          });
          statsY = by + bannerH + 16;
        }
      } catch {}

      // Stat boxes
      const boxW = pageW - margin * 2;
      const boxH = 60;
      glassCard(margin, statsY, boxW, boxH, GREEN, GREEN);
      doc.setTextColor(...GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(String(completed), margin + 12, statsY + 30);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text('Completadas', margin + 12, statsY + 48);

      // Lesson rows
      let y = statsY + boxH + 24;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...GOLD);
      doc.text(`Clases (${all.length})`, margin, y);
      y += 14;

      const rowH = 26;
      const footerH = 30;

      for (const l of all) {
        if (y + rowH > pageH - footerH - 10) {
          doc.addPage();
          paintBg();
          y = margin;
        }
        const num = lessonNumbers.get(l.id) ?? '';
        const status = effectiveLessonStatus(l);
        const statusLabel = status === 'completed' ? 'Completed' : status === 'no_show' ? 'No show' : 'Scheduled';
        const dbl = isDoubleLesson(l.lesson_type) ? ' · Clase de 2 horas' : '';
        const dateStr = formatLessonDate(l, 'short');
        const timeStr = formatLessonTime(l);
        const typeStr = l.lesson_type || '';

        doc.setGState(doc.GState({ opacity: 0.07 }));
        doc.setFillColor(...WHITE);
        doc.roundedRect(margin, y, pageW - margin * 2, rowH - 4, 4, 4, 'F');
        doc.setGState(doc.GState({ opacity: 0.3 }));
        doc.setDrawColor(...EDGE);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, pageW - margin * 2, rowH - 4, 4, 4, 'S');
        doc.setGState(doc.GState({ opacity: 1 }));

        // number badge
        doc.setFillColor(...GOLD);
        doc.circle(margin + 14, y + 11, 9, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BG);
        doc.text(String(num), margin + 14, y + 14, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...WHITE);
        const mainText = `${dateStr} · ${timeStr} · ${typeStr}${dbl}`;
        // Column layout (unit is pt; A4 = 595pt wide).
        // Status pill (drawn checkmark; Helvetica can't render ✓).
        const statusText = status === 'completed' ? 'Completada' : status === 'no_show' ? 'No asistió' : 'Agendada';
        const mainX = margin + 32;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        const pillTextW = doc.getTextWidth(statusText);
        const iconW = status === 'completed' ? 12 : 0;
        const pillW = pillTextW + iconW + 16;
        const pillH = 15;
        const pillX = pageW - margin - 5 - pillW;
        const pillY = y + (rowH - 4 - pillH) / 2;
        const pillColor: [number, number, number] =
          status === 'completed' ? GREEN : status === 'no_show' ? GOLD : [120, 170, 230];
        doc.setFillColor(...pillColor);
        doc.roundedRect(pillX, pillY, pillW, pillH, 7.5, 7.5, 'F');
        const textColor: [number, number, number] = status === 'completed' ? WHITE : BG;
        if (status === 'completed') {
          doc.setDrawColor(...WHITE);
          doc.setLineWidth(1.3);
          const cx = pillX + 8, cy = pillY + pillH / 2;
          doc.line(cx, cy, cx + 2.5, cy + 2.5);
          doc.line(cx + 2.5, cy + 2.5, cx + 7, cy - 2.5);
        }
        doc.setTextColor(...textColor);
        doc.text(statusText, pillX + 8 + iconW, pillY + pillH / 2 + 3.2);
        const maxMainW = pillX - 10 - mainX;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...WHITE);
        let drawText = mainText;
        if (doc.getTextWidth(drawText) > maxMainW) {
          const ell = '…';
          while (drawText.length > 1 && doc.getTextWidth(drawText + ell) > maxMainW) {
            drawText = drawText.slice(0, -1);
          }
          drawText = drawText.replace(/[\s·]+$/, '') + ell;
        }
        doc.text(drawText, mainX, y + 14);

        y += rowH;
      }


      // Footer on every page
      const today = new Date().toLocaleDateString('es-MX', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(`Exportado ${today}`, margin, pageH - 18);
        doc.setTextColor(...GOLD);
        doc.text('Apex Golf Academy', pageW - margin, pageH - 18, { align: 'right' });
      }

      const slug = (studentName || 'student')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const dateSlug = new Date().toISOString().slice(0, 10);
      doc.save(`package-summary-${slug}-${dateSlug}.pdf`);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to export PDF', variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      completed: { label: '✅', cls: 'bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30' },
      scheduled: { label: '📅', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      cancelled: { label: '❌', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
      no_show: { label: '⚠️', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    };
    const m = map[status] || { label: status, cls: 'bg-white/10 text-white/70 border-white/20' };
    return <Badge className={`${m.cls} text-[10px] px-1.5`}>{m.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md overflow-hidden">
        <div ref={captureRef} className="min-w-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-[#4a7c59]" />
            {pkg?.package_name || `${pkg?.package_size}-Lesson Package`}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className="rounded-lg p-2 text-center transition-all"
            style={{
              background: 'rgba(74,124,89,0.15)',
              border: filter === 'completed' ? '1.5px solid rgba(74,124,89,0.9)' : '1px solid rgba(74,124,89,0.3)',
              boxShadow: filter === 'completed' ? '0 0 0 2px rgba(74,124,89,0.25)' : 'none',
            }}
          >
            <div className="text-lg font-bold text-[#4a7c59]">{completed}</div>
            <div className="text-[10px] text-[#F5F0E8]/60">Completed</div>
          </button>
          <div
            className="rounded-lg p-2 text-center"
            style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}
          >
            <div className="text-lg font-bold text-[#F0C040]">{pkgCounts.remaining}</div>
            <div className="text-[10px] text-[#F5F0E8]/60">Remaining</div>
          </div>
        </div>

        {/* Toggle add/remove mode */}
        <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
          <div className="text-xs text-[#F5F0E8]/60">
            {adding
              ? `Select lessons without package (${selected.size} selected)`
              : removingMode
              ? `Select lessons to remove (${removeSelected.size} selected)`
              : `${visibleWeightedTotal} completed lesson(s)`}
          </div>
          {!adding && !removingMode ? (
            <div className="flex items-center gap-1">
              {linkedLessons.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => setRemovingMode(true)}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1 border-white/20 text-[#F5F0E8]/80 hover:bg-white/5"
                onClick={handleShare}
                disabled={sharing}
              >
                {sharing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />} Share
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1 border-[#4a7c59]/40 text-[#4a7c59] hover:bg-[#4a7c59]/10"
                onClick={() => setAdding(true)}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          ) : adding ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => { setAdding(false); setSelected(new Set()); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8] gap-1"
                disabled={selected.size === 0 || busy === 'add'}
                onClick={addSelected}
              >
                {busy === 'add' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Assign {selected.size > 0 && `(${selected.size})`}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={toggleAllRemove}
              >
                {removeSelected.size === linkedLessons.length ? 'None' : 'All'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => { setRemovingMode(false); setRemoveSelected(new Set()); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-red-500 hover:bg-red-500/80 text-[#F5F0E8] gap-1"
                disabled={removeSelected.size === 0 || busy === 'remove'}
                onClick={removeSelectedBulk}
              >
                {busy === 'remove' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Remove {removeSelected.size > 0 && `(${removeSelected.size})`}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-2 max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#F5F0E8]/50" />
            </div>
          ) : adding ? (
            unassignedLessons.length === 0 ? (
              <div className="text-center py-6 text-[#F5F0E8]/50 text-sm">
                No un-packaged lessons for this student
              </div>
            ) : (
              unassignedLessons.map((l) => {
                const isSel = selected.has(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggle(l.id)}
                    className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors"
                    style={{
                      background: isSel ? 'rgba(74,124,89,0.18)' : 'rgba(255,255,255,0.04)',
                      border: isSel ? '1px solid rgba(74,124,89,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center"
                      style={{ borderColor: isSel ? '#4a7c59' : 'rgba(255,255,255,0.2)', background: isSel ? '#4a7c59' : 'transparent' }}>
                      {isSel && <Check className="h-3 w-3 text-[#F5F0E8]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#F5F0E8] truncate">
                        {formatLessonDate(l, 'short')}
                      </div>
                      <div className="text-[11px] text-[#F5F0E8]/60 truncate">
                        {formatLessonTime(l)} · {translateLessonType(l.lesson_type, language)}
                        {isDoubleLesson(l.lesson_type) && <DoubleLessonBadge />}
                      </div>
                    </div>
                    {statusBadge(effectiveLessonStatus(l))}
                  </button>
                );
              })
            )
          ) : visibleLessons.length === 0 ? (
            <div className="text-center py-8 text-[#F5F0E8]/50 text-sm">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {linkedLessons.length === 0 ? (
                <>
                  No lessons linked to this package.
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs gap-1 border-[#4a7c59]/40 text-[#4a7c59] hover:bg-[#4a7c59]/10"
                      onClick={() => setAdding(true)}
                    >
                      <Plus className="h-3 w-3" /> Add lessons now
                    </Button>
                  </div>
                </>
              ) : (
                <>No {filter} lessons in this package.</>
              )}
            </div>
          ) : (
            visibleLessons.map((l, i) => {
              const isSel = removeSelected.has(l.id);
              // Chronological number within the filtered view: oldest = #1,
              // with 2-hour lessons consuming two slots.
              const lessonNumber = lessonNumberById.get(l.id) ?? (visibleLessons.length - i);
              if (removingMode) {
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleRemove(l.id)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                    style={{
                      background: isSel ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                      border: isSel ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                      style={{ borderColor: isSel ? '#ef4444' : 'rgba(255,255,255,0.2)', background: isSel ? '#ef4444' : 'transparent' }}>
                      {isSel && <Check className="h-3 w-3 text-[#F5F0E8]" />}
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(232,213,176,0.15)', color: '#E8D5B0' }}>
                      {lessonNumber}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="text-sm font-medium text-[#F5F0E8] truncate">
                        <span>{formatLessonDate(l, 'short')}</span>
                        <span className="text-xs text-[#F5F0E8]/60 font-normal"> · {formatLessonTime(l)} · {translateLessonType(l.lesson_type, language)}</span>
                        {isDoubleLesson(l.lesson_type) && <DoubleLessonBadge />}
                      </div>
                    </div>
                    {statusBadge(effectiveLessonStatus(l))}
                  </button>
                );
              }
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(232,213,176,0.15)', color: '#E8D5B0' }}>
                    {lessonNumber}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm font-medium text-[#F5F0E8] truncate">
                      <span>{formatLessonDate(l, 'short')}</span>
                      <span className="text-xs text-[#F5F0E8]/60 font-normal"> · {formatLessonTime(l)} · {translateLessonType(l.lesson_type, language)}</span>
                      {isDoubleLesson(l.lesson_type) && <DoubleLessonBadge />}
                    </div>
                  </div>
                  {statusBadge(effectiveLessonStatus(l))}
                  <button
                    onClick={() => removeLesson(l.id)}
                    disabled={busy === l.id}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 text-[#F5F0E8]/40 hover:text-red-400 transition-colors"
                    title="Remove from package"
                  >
                    {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
