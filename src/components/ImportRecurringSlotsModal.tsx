import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileText, AlertCircle, CheckCircle2, Search, ChevronDown } from 'lucide-react';
import { useStudentsList } from '@/components/SearchableStudentSelect';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface InlineStudentPickerProps {
  students: { id: string; full_name: string | null; email: string }[];
  onSelect: (s: { id: string; full_name: string | null; email: string }) => void;
  initialQuery?: string;
}

function InlineStudentPicker({ students, onSelect, initialQuery = '' }: InlineStudentPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? students
      : students.filter(
          (s) =>
            (s.full_name || '').toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q),
        );
    return list.slice(0, 50);
  }, [students, query]);

  return (
    <div ref={wrapperRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-[#F5F0E8] hover:bg-white/10"
      >
        <span className="opacity-70">Match to student…</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 max-w-[80vw] rounded-md border border-white/10 bg-background shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
            <Search className="h-3 w-3 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-xs text-[#F5F0E8] outline-none placeholder:opacity-40"
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-[#F5F0E8]/50">No students found</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                  className="block w-full truncate px-2 py-1.5 text-left text-xs text-[#F5F0E8] hover:bg-white/10"
                >
                  {s.full_name || s.email}
                  {s.full_name && (
                    <span className="ml-1 text-[10px] opacity-50">{s.email}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

interface ParsedRow {
  rowNum: number;
  studentName: string;
  weekday: number | null;
  startTime: string | null;
  lessonType: string;
  duration: number;
  matchedStudentId?: string;
  matchedStudentName?: string;
  error?: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, dom: 0, domingo: 0,
  mon: 1, monday: 1, lun: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, mar: 2, martes: 2,
  wed: 3, weds: 3, wednesday: 3, mie: 3, mié: 3, miercoles: 3, miércoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, jue: 4, jueves: 4,
  fri: 5, friday: 5, vie: 5, viernes: 5,
  sat: 6, saturday: 6, sab: 6, sáb: 6, sabado: 6, sábado: 6,
};

function parseWeekday(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (v in WEEKDAY_MAP) return WEEKDAY_MAP[v];
  const n = parseInt(v, 10);
  if (!isNaN(n) && n >= 0 && n <= 6) return n;
  return null;
}

function parseTime(raw: string): string | null {
  let v = raw.trim().toLowerCase().replace(/\s+/g, '');
  // Match "9am", "9:30am", "14:00", "9:00"
  const ampmMatch = v.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const ampm = ampmMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }
  const hmMatch = v.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  }
  return null;
}

function fuzzyMatchStudent(name: string, students: { id: string; full_name: string | null; email: string }[]) {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  // Exact name
  let m = students.find((s) => (s.full_name || '').toLowerCase() === target);
  if (m) return m;
  // Email exact
  m = students.find((s) => s.email.toLowerCase() === target);
  if (m) return m;
  // Contains both first words
  const tokens = target.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    m = students.find((s) => {
      const n = (s.full_name || '').toLowerCase();
      return tokens.every((t) => n.includes(t));
    });
    if (m) return m;
  }
  // Single substring
  m = students.find((s) => (s.full_name || '').toLowerCase().includes(target));
  return m;
}

export function ImportRecurringSlotsModal({ open, onOpenChange, onDone }: Props) {
  const { toast } = useToast();
  const { data: students = [] } = useStudentsList();
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [generateNow, setGenerateNow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = () => {
    setCsvText('');
    setParsed(null);
    setFileName(null);
    setIsDragging(false);
  };

  const readFile = (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i) && file.type && !file.type.includes('text') && !file.type.includes('csv')) {
      toast({ title: 'Unsupported file', description: 'Please drop a .csv or .txt file', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      setCsvText(text);
      setFileName(file.name);
    };
    reader.onerror = () => toast({ title: 'Failed to read file', variant: 'destructive' });
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const handleParse = () => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast({ title: 'Paste some CSV first', variant: 'destructive' });
      return;
    }
    // Detect header row
    const first = lines[0].toLowerCase();
    const hasHeader = first.includes('student') || first.includes('name') || first.includes('weekday') || first.includes('day');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const rows: ParsedRow[] = dataLines.map((line, idx) => {
      const cols = line.split(',').map((c) => c.trim());
      const [studentName = '', dayRaw = '', timeRaw = '', typeRaw = 'Range', durRaw = '60'] = cols;
      const weekday = parseWeekday(dayRaw);
      const startTime = parseTime(timeRaw);
      const lessonType = typeRaw.trim() || 'Range';
      const duration = parseInt(durRaw, 10) || 60;
      const matched = fuzzyMatchStudent(studentName, students);

      let error: string | undefined;
      if (!studentName) error = 'Missing student name';
      else if (!matched) error = 'Student not found';
      else if (weekday === null) error = `Invalid weekday "${dayRaw}"`;
      else if (!startTime) error = `Invalid time "${timeRaw}"`;

      return {
        rowNum: idx + 1 + (hasHeader ? 1 : 0),
        studentName,
        weekday,
        startTime,
        lessonType,
        duration,
        matchedStudentId: matched?.id,
        matchedStudentName: matched?.full_name || matched?.email,
        error,
      };
    });

    setParsed(rows);
  };

  const handleImport = async () => {
    if (!parsed) return;
    const valid = parsed.filter((r) => !r.error);
    if (valid.length === 0) {
      toast({ title: 'No valid rows to import', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      const { error } = await supabase.from('recurring_lesson_slots').insert(
        valid.map((r) => ({
          student_id: r.matchedStudentId!,
          weekday: r.weekday!,
          start_time: r.startTime!,
          duration_minutes: r.duration,
          lesson_type: r.lessonType,
          is_active: true,
        }))
      );
      if (error) throw error;

      let generated = 0;
      if (generateNow) {
        const { data, error: fnErr } = await supabase.functions.invoke('generate-recurring-lessons', { body: {} });
        if (!fnErr) generated = data?.inserted ?? 0;
      }

      toast({
        title: 'Import complete',
        description: `${valid.length} spot${valid.length !== 1 ? 's' : ''} added${generateNow ? ` · ${generated} lessons generated` : ''}.`,
      });
      onDone?.();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsed?.filter((r) => !r.error).length ?? 0;
  const errorCount = parsed?.filter((r) => r.error).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import recurring spots from CSV
          </DialogTitle>
          <DialogDescription>
            Paste rows below. Format:{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">student_name, weekday, start_time, lesson_type, duration_min</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {!parsed ? (
            <>
              {/* Drag & drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('csv-file-input')?.click()}
                className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-all px-4 py-6 text-center ${
                  isDragging
                    ? 'border-[#4a7c59] bg-[#4a7c59]/10'
                    : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFile(f);
                    e.target.value = '';
                  }}
                />
                <Upload className={`h-6 w-6 mx-auto mb-2 ${isDragging ? 'text-[#4a7c59]' : 'text-muted-foreground'}`} />
                {fileName ? (
                  <>
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Click or drop another file to replace</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Drop a CSV file here, or click to browse</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Accepts .csv or .txt</p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Or paste CSV content directly</Label>
                <Textarea
                  value={csvText}
                  onChange={(e) => { setCsvText(e.target.value); if (fileName) setFileName(null); }}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder={`student_name,weekday,start_time,lesson_type,duration\nMaria Baleva,Tuesday,9:00am,Range,60\nCarlos Lopez,Fri,5pm,Campo,60`}
                />
              </div>
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Weekday accepts: <code>Mon/Tue/...</code>, <code>Lunes/Martes/...</code>, or <code>0–6</code> (Sun=0). Time accepts <code>9am</code>, <code>9:30am</code>, <code>14:00</code>. Lesson type defaults to <code>Range</code>; duration defaults to <code>60</code>.
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-[#4a7c59]">
                  <CheckCircle2 className="h-4 w-4" /> {validCount} ready
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="h-4 w-4" /> {errorCount} with issues
                  </span>
                )}
              </div>
              <div className="border border-white/10 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="text-left px-2 py-1.5">#</th>
                      <th className="text-left px-2 py-1.5">Student</th>
                      <th className="text-left px-2 py-1.5">Day</th>
                      <th className="text-left px-2 py-1.5">Time</th>
                      <th className="text-left px-2 py-1.5">Type</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r, idx) => (
                      <tr key={r.rowNum} className={`border-t border-white/5 ${r.error ? 'bg-red-500/5' : ''}`}>
                        <td className="px-2 py-1.5 align-top text-muted-foreground">{r.rowNum}</td>
                        <td className="px-2 py-1.5 align-top">
                          <div>{r.studentName}</div>
                          {r.matchedStudentName && r.matchedStudentName.toLowerCase() !== r.studentName.toLowerCase() && (
                            <div className="text-[10px] text-[#4a7c59]">→ {r.matchedStudentName}</div>
                          )}
                          {r.error === 'Student not found' && (
                            <InlineStudentPicker
                              students={students}
                              initialQuery={r.studentName}
                              onSelect={(s) => {
                                setParsed((prev) => {
                                  if (!prev) return prev;
                                  const next = [...prev];
                                  const cur = next[idx];
                                  let newError: string | undefined;
                                  if (cur.weekday === null) newError = `Invalid weekday`;
                                  else if (!cur.startTime) newError = `Invalid time`;
                                  next[idx] = {
                                    ...cur,
                                    matchedStudentId: s.id,
                                    matchedStudentName: s.full_name || s.email,
                                    error: newError,
                                  };
                                  return next;
                                });
                              }}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">{r.weekday !== null ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.weekday] : '—'}</td>
                        <td className="px-2 py-1.5 align-top">{r.startTime?.substring(0, 5) ?? '—'}</td>
                        <td className="px-2 py-1.5 align-top">{r.lessonType}</td>
                        <td className="px-2 py-1.5 align-top">
                          {r.error ? <span className="text-red-400">{r.error}</span> : <span className="text-[#4a7c59]">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={generateNow} onChange={(e) => setGenerateNow(e.target.checked)} />
                Auto-generate next 8 weeks of lessons after import
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          {!parsed ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleParse} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">Preview</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setParsed(null)} disabled={importing}>Back</Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
                {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Import {validCount} spot{validCount !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
