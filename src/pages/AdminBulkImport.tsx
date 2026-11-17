import { useCallback, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  Trash2,
  X,
  CheckSquare,
  Square,
  Bug,
  Plus,
  DollarSign,
  Users,
  Merge,
  ArrowRight,
  SkipForward,
} from 'lucide-react';

import { InternalHeader } from '@/components/InternalHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SocialFooter } from '@/components/SocialFooter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  parseSpreadsheetMatrix,
  stripBOM,
  type Diagnostics,
  type ParsedRow,
} from '@/lib/bulkImportParser';
import {
  detectImportDuplicates,
  isPlaceholderEmail,
  type ImportDuplicateMatch,
  type StudentProfile,
} from '@/lib/duplicateDetection';

const PRICING: Record<number, number> = { 5: 7500, 10: 14850, 20: 26500, 30: 34650 };
const ALLOWED_PACKAGE_SIZES = [5, 10, 20, 30, 40] as const;

const WARNING_PATTERNS = {
  client: [/^Missing CLIENTE value/i, /^CLIENTE column was not found/i],
  package: [/^CLASES is blank or invalid/i, /^CLASES must be at least 1/i, /^Completed lessons \(/i],
  paymentDate: [/^Could not parse FECHA DE PAGO/i],
  lessonDates: [/^CLASE values were found/i, /^Unparsed CLASE values:/i, /^Completed lessons \(/i],
};

const uniqueDates = (dates: string[]) => Array.from(new Set(dates.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const removeWarnings = (warnings: string[], patterns: RegExp[]) => warnings.filter((warning) => !patterns.some((pattern) => pattern.test(warning)));
const getDelimiterLabel = (delimiter: string) => {
  if (delimiter === ',') return 'Comma';
  if (delimiter === ';') return 'Semicolon';
  if (delimiter === '\t') return 'Tab';
  if (delimiter === 'xlsx') return 'Excel sheet';
  return delimiter;
};

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const commas = (firstLines.match(/,/g) || []).length;
  const semicolons = (firstLines.match(/;/g) || []).length;
  const tabs = (firstLines.match(/\t/g) || []).length;

  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

async function decodeTextFile(file: File): Promise<{ text: string; encoding: string }> {
  const buffer = await file.arrayBuffer();
  const utf8 = stripBOM(new TextDecoder('utf-8').decode(buffer));
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };
  try {
    const win1252 = stripBOM(new TextDecoder('windows-1252').decode(buffer));
    return { text: win1252, encoding: 'windows-1252' };
  } catch {
    return { text: utf8, encoding: 'utf-8 (fallback)' };
  }
}

/** Decision for each duplicate match */
type DuplicateDecision = 'merge' | 'keep_separate' | 'skip' | null;

export default function AdminBulkImport() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'duplicate-review' | 'done'>('upload');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  // Duplicate review state
  const [duplicateMatches, setDuplicateMatches] = useState<ImportDuplicateMatch[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<Map<number, DuplicateDecision>>(new Map());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const visibleRows = useMemo(() => parsedRows.map((row, index) => ({ row, index })).filter(({ index }) => !removedIndices.has(index)), [parsedRows, removedIndices]);
  const selectedRows = useMemo(() => visibleRows.filter(({ index }) => selectedIndices.has(index)), [visibleRows, selectedIndices]);
  const selectedCount = selectedRows.length;
  const excludedCount = visibleRows.length - selectedCount;
  const allSelected = visibleRows.length > 0 && selectedCount === visibleRows.length;
  const selectedMissingNameCount = selectedRows.filter(({ row }) => !row.clientName.trim()).length;

  const updateParsedRow = useCallback((rowIndex: number, updater: (row: ParsedRow) => ParsedRow) => {
    setParsedRows((prev) => prev.map((row, index) => (index === rowIndex ? updater(row) : row)));
  }, []);

  const applyParsedResult = useCallback((nextRows: ParsedRow[], nextDiagnostics: Diagnostics) => {
    setParsedRows(nextRows);
    setSelectedIndices(new Set(nextRows.map((_, index) => index)));
    setRemovedIndices(new Set());
    setDiagnostics(nextDiagnostics);
    setDuplicateMatches([]);
    setDuplicateDecisions(new Map());
    setStep('preview');
    setShowDiag(nextRows.length === 0 || nextDiagnostics.errors.length > 0 || nextDiagnostics.skipReasons.length > 0);
  }, []);

  const handleFile = useCallback(async (nextFile: File) => {
    setFile(nextFile);
    setImportResult(null);
    setDiagnostics(null);
    setParsedRows([]);
    setSelectedIndices(new Set());
    setRemovedIndices(new Set());
    setDuplicateMatches([]);
    setDuplicateDecisions(new Map());

    try {
      const ext = nextFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'txt') {
        const { text, encoding } = await decodeTextFile(nextFile);
        const delimiter = detectDelimiter(text);
        Papa.parse(text, {
          delimiter, header: false, skipEmptyLines: false,
          complete: (results) => {
            const matrix = ((results.data as unknown[]) || []).map((row) => (Array.isArray(row) ? row : [row]));
            const { rows, diagnostics: nextDiagnostics } = parseSpreadsheetMatrix(matrix, { delimiter, encoding });
            if (results.errors.length > 0) {
              nextDiagnostics.errors.push(...results.errors.slice(0, 10).map((error) => `CSV parser: ${error.message}`));
            }
            applyParsedResult(rows, nextDiagnostics);
          },
          error: (error) => { toast.error(`Failed to parse CSV: ${error?.message || 'Unknown error'}`); },
        });
        return;
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await nextFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }) as unknown[][];
        const { rows, diagnostics: nextDiagnostics } = parseSpreadsheetMatrix(matrix, { delimiter: 'xlsx', encoding: 'workbook' });
        applyParsedResult(rows, nextDiagnostics);
        return;
      }

      toast.error('Unsupported file type. Please upload .csv or .xlsx');
    } catch (error: any) {
      toast.error(`Error reading file: ${error?.message || 'Unknown error'}`);
    }
  }, [applyParsedResult]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) handleFile(nextFile);
  }, [handleFile]);

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  };
  const selectAll = () => setSelectedIndices(new Set(visibleRows.map(({ index }) => index)));
  const unselectAll = () => setSelectedIndices(new Set());

  const removeRow = (index: number) => {
    setRemovedIndices((prev) => new Set(prev).add(index));
    setSelectedIndices((prev) => { const next = new Set(prev); next.delete(index); return next; });
  };

  const updateClientName = (index: number, clientName: string) => {
    updateParsedRow(index, (row) => {
      const warnings = removeWarnings(row.warnings, WARNING_PATTERNS.client);
      if (!clientName.trim()) warnings.push('Missing CLIENTE value. Enter a student name before importing.');
      return { ...row, clientName, warnings };
    });
  };

  const updatePackageSize = (index: number, rawValue: string) => {
    updateParsedRow(index, (row) => {
      const packageSize = rawValue === '0' || rawValue === '' ? 0 : (Number.parseInt(rawValue, 10) || 0);
      const warnings = removeWarnings(row.warnings, WARNING_PATTERNS.package);
      if (packageSize === 0) warnings.push('CLASES is blank or invalid. Coach must assign package size (5, 10, 20, or 30) after import.');
      else if (row.lessonDates.length > packageSize) warnings.push(`Completed lessons (${row.lessonDates.length}) exceed CLASES (${packageSize}).`);
      return { ...row, packageSize, warnings };
    });
  };

  const updatePaymentDate = (index: number, paymentDate: string) => {
    updateParsedRow(index, (row) => ({ ...row, paymentDate: paymentDate || null, warnings: removeWarnings(row.warnings, WARNING_PATTERNS.paymentDate) }));
  };

  const updateAmountPaid = (index: number, rawValue: string) => {
    updateParsedRow(index, (row) => ({ ...row, amountPaid: rawValue === '' ? 0 : Math.max(0, Number.parseFloat(rawValue) || 0) }));
  };

  const updateLessonDate = (rowIndex: number, lessonIndex: number, nextValue: string) => {
    updateParsedRow(rowIndex, (row) => {
      const lessonDates = row.lessonDates.map((d, i) => (i === lessonIndex ? nextValue : d)).filter(Boolean);
      const warnings = removeWarnings(row.warnings, WARNING_PATTERNS.lessonDates);
      if (row.packageSize > 0 && lessonDates.length > row.packageSize) warnings.push(`Completed lessons (${lessonDates.length}) exceed CLASES (${row.packageSize}).`);
      return { ...row, lessonDates: uniqueDates(lessonDates), warnings };
    });
  };

  const addLessonDate = (rowIndex: number) => {
    updateParsedRow(rowIndex, (row) => {
      const nextDate = new Date().toISOString().split('T')[0];
      const lessonDates = uniqueDates([...row.lessonDates, nextDate]);
      const warnings = removeWarnings(row.warnings, WARNING_PATTERNS.lessonDates);
      if (row.packageSize > 0 && lessonDates.length > row.packageSize) warnings.push(`Completed lessons (${lessonDates.length}) exceed CLASES (${row.packageSize}).`);
      return { ...row, lessonDates, warnings };
    });
  };

  const removeLessonDate = (rowIndex: number, lessonIndex: number) => {
    updateParsedRow(rowIndex, (row) => ({ ...row, lessonDates: row.lessonDates.filter((_, i) => i !== lessonIndex), warnings: removeWarnings(row.warnings, WARNING_PATTERNS.lessonDates) }));
  };

  // ── Step: Check for duplicates before importing ─────────────────────────

  const checkForDuplicates = async () => {
    const rowsToCheck = visibleRows.filter(({ index }) => selectedIndices.has(index)).map(({ row, index }) => ({ rowIndex: index, clientName: row.clientName.trim() })).filter(r => r.clientName);

    if (rowsToCheck.length === 0) { toast.error('No students selected'); return; }
    const missingNames = visibleRows.filter(({ index }) => selectedIndices.has(index)).filter(({ row }) => !row.clientName.trim()).length;
    if (missingNames > 0) { toast.error(`Fill CLIENTE for ${missingNames} row(s) first`); return; }

    setCheckingDuplicates(true);
    try {
      // Fetch existing students
      const { data: roleRows } = await supabase.from('user_roles').select('user_id').eq('role', 'student');
      const studentIds = (roleRows || []).map((r: any) => r.user_id);

      let existingStudents: StudentProfile[] = [];
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, handicap, created_at').in('id', studentIds);
        const { data: lessons } = await supabase.from('lessons').select('student_id').in('student_id', studentIds).eq('status', 'completed');
        const { data: packages } = await supabase.from('class_packages').select('user_id').in('user_id', studentIds);

        const lc: Record<string, number> = {};
        lessons?.forEach((l: any) => { lc[l.student_id] = (lc[l.student_id] || 0) + 1; });
        const pc: Record<string, number> = {};
        packages?.forEach((p: any) => { pc[p.user_id] = (pc[p.user_id] || 0) + 1; });

        existingStudents = (profiles || []).map((p: any): StudentProfile => ({
          ...p,
          lessonCount: lc[p.id] || 0,
          packageCount: pc[p.id] || 0,
        }));
      }

      const matches = detectImportDuplicates(rowsToCheck, existingStudents);
      setDuplicateMatches(matches);
      // Initialize all decisions to null (undecided)
      const decisions = new Map<number, DuplicateDecision>();
      matches.forEach(m => decisions.set(m.rowIndex, null));
      setDuplicateDecisions(decisions);

      if (matches.length > 0) {
        setStep('duplicate-review');
      } else {
        // No duplicates found — proceed directly to import
        await executeImport(new Map());
      }
    } catch (err: any) {
      toast.error(`Duplicate check failed: ${err.message}`);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const setDecision = (rowIndex: number, decision: DuplicateDecision) => {
    setDuplicateDecisions(prev => { const next = new Map(prev); next.set(rowIndex, decision); return next; });
  };

  const allDecided = useMemo(() => {
    for (const [, d] of duplicateDecisions) {
      if (d === null) return false;
    }
    return true;
  }, [duplicateDecisions]);

  const pendingCount = useMemo(() => {
    let c = 0;
    for (const [, d] of duplicateDecisions) { if (d === null) c++; }
    return c;
  }, [duplicateDecisions]);

  // ── Execute import with merge decisions ─────────────────────────────────

  const executeImport = async (mergeDecisions: Map<number, DuplicateDecision>) => {
    const rowsToImport = visibleRows.filter(({ index }) => selectedIndices.has(index));

    // Filter out rows marked "skip"
    const finalRows = rowsToImport.filter(({ index }) => mergeDecisions.get(index) !== 'skip');

    if (finalRows.length === 0) { toast.error('No rows left to import after skipping'); return; }

    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Build merge map: rowIndex -> existing student ID for merge decisions
      const mergeMap = new Map<number, string>();
      for (const match of duplicateMatches) {
        if (mergeDecisions.get(match.rowIndex) === 'merge') {
          mergeMap.set(match.rowIndex, match.existingStudent.id);
        }
      }

      const { data, error } = await supabase.functions.invoke('bulk-import', {
        body: {
          rows: finalRows.map(({ row, index }) => ({
            clientName: row.clientName.trim(),
            packageSize: row.packageSize,
            paymentDate: row.paymentDate,
            amountPaid: row.amountPaid,
            lessonDates: uniqueDates(row.lessonDates),
            mergeIntoId: mergeMap.get(index) || null,
          })),
        },
      });

      if (error) throw error;
      setImportResult(data.summary);
      setStep('done');
      toast.success('Import completed successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleImportAfterReview = async () => {
    // Check that all matches have a decision
    for (const [rowIdx, decision] of duplicateDecisions) {
      if (decision === null) {
        toast.error('Please decide on all duplicate matches before importing');
        return;
      }
    }
    await executeImport(duplicateDecisions);
  };

  const reset = () => {
    setFile(null);
    setParsedRows([]);
    setSelectedIndices(new Set());
    setRemovedIndices(new Set());
    setImportResult(null);
    setDiagnostics(null);
    setShowDiag(false);
    setDuplicateMatches([]);
    setDuplicateDecisions(new Map());
    setStep('upload');
  };

  const getPaymentStatus = (row: ParsedRow) => {
    if (row.packageSize === 0) {
      if (row.amountPaid > 0) return { label: 'Paid (pending pkg)', color: '#F0C040', bg: 'rgba(240,192,64,0.15)' };
      return { label: 'Pending pkg', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' };
    }
    const total = PRICING[row.packageSize] || row.packageSize * 1650;
    const balance = total - row.amountPaid;
    if (balance <= 0) return { label: 'Paid', color: '#4a7c59', bg: 'rgba(74,124,89,0.2)' };
    if (row.amountPaid > 0) return { label: 'Partial', color: '#F0C040', bg: 'rgba(240,192,64,0.15)' };
    return { label: 'Pending', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.bulkImportTitle" subtitleKey="admin.bulkImportSub" backTo="/admin" />

      <main className="px-4 py-6 max-w-5xl mx-auto space-y-5">
        {/* ───── STEP: UPLOAD ───── */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="glass-card p-10 text-center cursor-pointer transition-all hover:scale-[1.01]"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls,.txt';
              input.onchange = (event: any) => { const f = event.target.files?.[0]; if (f) handleFile(f); };
              input.click();
            }}
          >
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(74,124,89,0.15)' }}>
              <Upload className="h-8 w-8" style={{ color: '#4a7c59' }} />
            </div>
            <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>Drop your file here</h3>
            <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 14 }} className="mt-1">or click to browse — supports .csv and .xlsx</p>
            <div className="mt-6 glass-card p-4 text-left" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p style={{ color: '#E8D5B0', fontSize: 13, fontWeight: 600 }} className="mb-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Expected columns:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['CLIENTE', 'CLASES', 'FECHA DE PAGO', 'CANTIDAD DE PAGO', 'CLASE 1', 'CLASE 2', 'CLASE 3', '...'].map((column) => (
                  <span key={column} style={{ background: 'rgba(74,124,89,0.15)', color: '#4a7c59', fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{column}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ───── STEP: PREVIEW ───── */}
        {step === 'preview' && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.15)' }}>
                  <Eye className="h-5 w-5" style={{ color: '#4a7c59' }} />
                </div>
                <div>
                  <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>Preview Import</h3>
                  <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{visibleRows.length} preview row{visibleRows.length === 1 ? '' : 's'} from {file?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setShowDiag((prev) => !prev)} className="gap-1" style={{ color: '#60a5fa' }}>
                  <Bug className="h-4 w-4" /> {showDiag ? 'Hide' : 'Diagnostics'}
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="gap-1" style={{ color: '#ef4444' }}>
                  <Trash2 className="h-4 w-4" /> Remove file
                </Button>
              </div>
            </div>

            {showDiag && diagnostics && (
              <div className="glass-card p-4 space-y-3 text-xs" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <p style={{ color: '#60a5fa', fontWeight: 600, fontSize: 13 }} className="flex items-center gap-1.5"><Bug className="h-4 w-4" /> Import Diagnostics</p>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Header row detected:</span>
                  <span style={{ color: '#F5F0E8' }}>{diagnostics.headerRowIndex ?? 'Unknown'}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Delimiter:</span>
                  <span style={{ color: '#F5F0E8' }}>{getDelimiterLabel(diagnostics.delimiter)}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Encoding:</span>
                  <span style={{ color: '#F5F0E8' }}>{diagnostics.encoding}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Rows read:</span>
                  <span style={{ color: '#F5F0E8' }}>{diagnostics.totalRawRows}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>CLIENTE found:</span>
                  <span style={{ color: diagnostics.clientColumnFound ? '#4a7c59' : '#ef4444' }}>{diagnostics.clientColumnFound ? 'Yes' : 'No'}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Rows considered valid:</span>
                  <span style={{ color: '#4a7c59' }}>{diagnostics.validRows}</span>
                  <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Rows skipped:</span>
                  <span style={{ color: diagnostics.skippedRows > 0 ? '#F0C040' : '#F5F0E8' }}>{diagnostics.skippedRows}</span>
                </div>
                <div>
                  <p style={{ color: '#E8D5B0', opacity: 0.6, marginBottom: 4 }}>Headers detected ({diagnostics.headerRow.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {diagnostics.headerRow.map((header, index) => {
                      const isMapped = Object.values(diagnostics.mappedColumns).includes(header);
                      const isClase = diagnostics.claseColumns.includes(header);
                      return (
                        <span key={`${header}-${index}`} style={{ background: isMapped ? 'rgba(74,124,89,0.2)' : isClase ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.06)', color: isMapped ? '#4a7c59' : isClase ? '#60a5fa' : '#E8D5B0', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
                          {header || '(blank)'}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p style={{ color: '#E8D5B0', opacity: 0.6, marginBottom: 4 }}>Column mapping:</p>
                  <div className="space-y-0.5">
                    {Object.entries(diagnostics.mappedColumns).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span style={{ color: '#E8D5B0', opacity: 0.5 }}>{key} →</span>
                        <span style={{ color: value ? '#4a7c59' : '#ef4444', fontWeight: value ? 600 : 400 }}>{value || 'NOT FOUND'}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span style={{ color: '#E8D5B0', opacity: 0.5 }}>CLASE columns →</span>
                      <span style={{ color: diagnostics.claseColumns.length > 0 ? '#60a5fa' : '#ef4444' }}>
                        {diagnostics.claseColumns.length > 0 ? diagnostics.claseColumns.join(', ') : 'NONE FOUND'}
                      </span>
                    </div>
                  </div>
                </div>
                {diagnostics.errors.length > 0 && (
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <p style={{ color: '#ef4444', fontWeight: 600 }}>Errors:</p>
                    {diagnostics.errors.map((error, index) => <p key={`${error}-${index}`} style={{ color: '#ef4444', opacity: 0.8 }}>{error}</p>)}
                  </div>
                )}
                {diagnostics.skipReasons.length > 0 && (
                  <div className="max-h-28 overflow-y-auto">
                    <p style={{ color: '#F0C040', opacity: 0.8, marginBottom: 2 }}>Skipped rows:</p>
                    {diagnostics.skipReasons.slice(0, 20).map((reason, index) => <p key={`${reason}-${index}`} style={{ color: '#F0C040', opacity: 0.65 }}>{reason}</p>)}
                    {diagnostics.skipReasons.length > 20 && <p style={{ color: '#F0C040', opacity: 0.4 }}>...and {diagnostics.skipReasons.length - 20} more</p>}
                  </div>
                )}
              </div>
            )}

            {parsedRows.length === 0 && (
              <div className="glass-card p-6 text-center" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: '#ef4444' }} />
                <h4 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>No students detected</h4>
                <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }} className="mt-1">
                  The parser did not find importable rows. Open <strong>Diagnostics</strong> to see the detected headers, row counts, and skip reasons.
                </p>
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="glass-card p-3 flex flex-wrap items-center gap-3 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Detected: <strong style={{ color: '#F5F0E8', opacity: 1 }}>{parsedRows.length}</strong></span>
                <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Visible: <strong style={{ color: '#F5F0E8', opacity: 1 }}>{visibleRows.length}</strong></span>
                <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Selected: <strong style={{ color: '#4a7c59', opacity: 1 }}>{selectedCount}</strong></span>
                <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Excluded: <strong style={{ color: '#F0C040', opacity: 1 }}>{excludedCount}</strong></span>
                {removedIndices.size > 0 && <span style={{ color: '#E8D5B0', opacity: 0.6 }}>Removed: <strong style={{ color: '#ef4444', opacity: 1 }}>{removedIndices.size}</strong></span>}
                {selectedMissingNameCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{selectedMissingNameCount} selected row{selectedMissingNameCount === 1 ? '' : 's'} still need CLIENTE</span>}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={allSelected ? unselectAll : selectAll} className="gap-1.5 h-7 px-2" style={{ color: '#4a7c59', fontSize: 12 }}>
                  {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                  {allSelected ? 'Unselect All' : 'Select All'}
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {visibleRows.map(({ row, index }) => {
                const status = getPaymentStatus(row);
                const total = row.packageSize > 0 ? (PRICING[row.packageSize] || row.packageSize * 1650) : 0;
                const remaining = row.packageSize > 0 ? Math.max(0, row.packageSize - row.lessonDates.length - (row.noShowDates?.length || 0)) : null;
                const hasWarnings = row.warnings.length > 0;
                const isSelected = selectedIndices.has(index);

                return (
                  <div key={index} className="glass-card p-4 transition-all" style={{ border: hasWarnings ? '1px solid rgba(240,192,64,0.3)' : isSelected ? '1px solid rgba(74,124,89,0.3)' : '1px solid rgba(255,255,255,0.05)', opacity: isSelected ? 1 : 0.55 }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 pt-1">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(index)} className="border-[#4a7c59] data-[state=checked]:bg-[#4a7c59] data-[state=checked]:border-[#4a7c59]" />
                      </div>
                      <div className="flex-1 space-y-4 min-w-0">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: '#4a7c59', color: '#F5F0E8' }}>
                              {row.clientName.trim() ? row.clientName.trim().charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="min-w-0">
                              <p style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 15 }} className="truncate">{row.clientName.trim() || 'Missing CLIENTE'}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span style={{ background: 'rgba(232,213,176,0.12)', color: '#E8D5B0', fontSize: 11, padding: '1px 7px', borderRadius: 6 }}>Source row {row.sourceRowNumber}</span>
                                <span style={{ background: row.packageSize === 0 ? 'rgba(96,165,250,0.15)' : 'rgba(232,213,176,0.12)', color: row.packageSize === 0 ? '#60a5fa' : '#E8D5B0', fontSize: 11, padding: '1px 7px', borderRadius: 6 }}>
                                  {row.packageSize === 0 ? 'Pending pkg size' : `${row.packageSize} lessons`}
                                </span>
                                <span style={{ background: 'rgba(232,213,176,0.12)', color: '#E8D5B0', fontSize: 11, padding: '1px 7px', borderRadius: 6 }}>
                                  {row.lessonDates.length} taken{remaining !== null ? ` • ${remaining} left` : ''}
                                </span>
                                {row.noShowDates && row.noShowDates.length > 0 && (
                                  <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, padding: '1px 7px', borderRadius: 6 }}>{row.noShowDates.length} no-show{row.noShowDates.length === 1 ? '' : 's'}</span>
                                )}
                                <Badge style={{ background: status.bg, color: status.color, border: 'none', fontSize: 11 }}>{status.label}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 flex items-start gap-2">
                            <div>
                              <p style={{ color: '#E8D5B0', fontWeight: 700, fontSize: 15 }}>${row.amountPaid.toLocaleString()}</p>
                              <p style={{ color: '#E8D5B0', opacity: 0.4, fontSize: 11 }}>{total > 0 ? `of $${total.toLocaleString()} MXN` : 'pkg pending'}</p>
                            </div>
                            <button onClick={() => removeRow(index)} className="p-1 rounded-lg transition-colors hover:bg-white/10" title="Remove from preview">
                              <X className="h-4 w-4" style={{ color: '#ef4444', opacity: 0.7 }} />
                            </button>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>CLIENTE</p>
                            <Input value={row.clientName} onChange={(e) => updateClientName(index, e.target.value)} placeholder="Student name" className="h-9 border-white/10" style={{ color: '#F5F0E8', background: 'rgba(255,255,255,0.04)' }} />
                          </div>
                          <div className="space-y-1.5">
                            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>CLASES</p>
                            <Select value={row.packageSize === 0 ? '' : String(row.packageSize)} onValueChange={(v) => updatePackageSize(index, v)}>
                              <SelectTrigger className="h-9 border-white/10" style={{ color: '#F5F0E8', background: 'rgba(255,255,255,0.04)' }}>
                                <SelectValue placeholder="Pending — assign after import" />
                              </SelectTrigger>
                              <SelectContent style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}>
                                <SelectItem value="0" style={{ color: '#60a5fa' }}>Pending (assign later)</SelectItem>
                                {ALLOWED_PACKAGE_SIZES.map((size) => (
                                  <SelectItem key={size} value={String(size)} style={{ color: '#F5F0E8' }}>{size} lessons</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>PAYMENT DATE</p>
                            <DateField value={row.paymentDate || ''} onChange={(e) => updatePaymentDate(index, e.target.value)} className="h-9 border-white/10" style={{ color: '#F5F0E8', background: 'rgba(255,255,255,0.04)' }} />
                          </div>
                          <div className="space-y-1.5">
                            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>PAYMENT AMOUNT</p>
                            <Input type="number" min={0} step="0.01" value={Number.isFinite(row.amountPaid) ? row.amountPaid : ''} onChange={(e) => updateAmountPaid(index, e.target.value)} placeholder="0" className="h-9 border-white/10" style={{ color: '#F5F0E8', background: 'rgba(255,255,255,0.04)' }} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}>Completed lesson dates from CLASE 1 / CLASE 2 / ...</p>
                            <Button type="button" variant="ghost" size="sm" onClick={() => addLessonDate(index)} className="gap-1 h-7 px-2" style={{ color: '#60a5fa', fontSize: 12 }}><Plus className="h-3.5 w-3.5" /> Add lesson date</Button>
                          </div>
                          {row.lessonDates.length > 0 ? (
                            <div className="grid sm:grid-cols-2 gap-2">
                              {row.lessonDates.map((lessonDate, lessonIndex) => (
                                <div key={`${lessonDate}-${lessonIndex}`} className="flex items-center gap-2">
                                  <DateField value={lessonDate} onChange={(e) => updateLessonDate(index, lessonIndex, e.target.value)} className="h-9 border-white/10" style={{ color: '#F5F0E8', background: 'rgba(255,255,255,0.04)' }} />
                                  <button type="button" onClick={() => removeLessonDate(index, lessonIndex)} className="p-2 rounded-lg transition-colors hover:bg-white/10" title="Remove lesson date">
                                    <X className="h-4 w-4" style={{ color: '#ef4444', opacity: 0.8 }} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                              <p style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 12 }}>No completed lesson dates parsed yet. Add one manually if this row should include historical lessons.</p>
                            </div>
                          )}
                        </div>

                        {hasWarnings && (
                          <div className="flex items-start gap-1.5 rounded-xl p-3" style={{ background: 'rgba(240,192,64,0.08)' }}>
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#F0C040' }} />
                            <div className="space-y-1">
                              {row.warnings.map((warning, warningIndex) => <p key={`${warning}-${warningIndex}`} style={{ color: '#F0C040', fontSize: 11 }}>{warning}</p>)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <Button
                  onClick={checkForDuplicates}
                  disabled={checkingDuplicates || selectedCount === 0 || selectedMissingNameCount > 0}
                  className="w-full h-12 text-base font-semibold rounded-xl"
                  style={{ background: selectedCount > 0 && selectedMissingNameCount === 0 ? '#4a7c59' : 'rgba(74,124,89,0.3)', color: '#F5F0E8' }}
                >
                  {checkingDuplicates ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Checking for duplicates...</>
                  ) : (
                    <><Users className="h-5 w-5 mr-2" /> Check for Duplicates & Import ({selectedCount} students)</>
                  )}
                </Button>
                {selectedMissingNameCount > 0 && (
                  <p className="text-center" style={{ color: '#ef4444', fontSize: 12 }}>Fill in CLIENTE or unselect those rows before importing.</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ───── STEP: DUPLICATE REVIEW ───── */}
        {step === 'duplicate-review' && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.15)' }}>
                <Users className="h-5 w-5" style={{ color: '#F0C040' }} />
              </div>
              <div>
                <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 600 }}>Review Possible Duplicates</h3>
                <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>
                  {duplicateMatches.length} possible duplicate{duplicateMatches.length !== 1 ? 's' : ''} found. Decide for each before importing.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {duplicateMatches.map((match) => {
                const row = parsedRows[match.rowIndex];
                const decision = duplicateDecisions.get(match.rowIndex);
                const existing = match.existingStudent;

                return (
                  <div key={match.rowIndex} className="glass-card p-5 space-y-4" style={{ border: decision === 'merge' ? '1px solid rgba(74,124,89,0.4)' : decision === 'keep_separate' ? '1px solid rgba(96,165,250,0.3)' : decision === 'skip' ? '1px solid rgba(240,192,64,0.3)' : '1px solid rgba(240,192,64,0.25)' }}>
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" style={{ color: '#F0C040' }} />
                      <p style={{ color: '#F0C040', fontSize: 13, fontWeight: 600 }}>Possible Duplicate — {Math.round(match.confidence * 100)}% confidence</p>
                    </div>

                    {/* Reasons */}
                    <div className="flex flex-wrap gap-1.5">
                      {match.reasons.map((r, i) => (
                        <span key={i} style={{ background: 'rgba(240,192,64,0.12)', color: '#F0C040', fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{r}</span>
                      ))}
                    </div>

                    {/* Side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
                      {/* Import row */}
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)' }}>
                        <p style={{ color: '#60a5fa', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>FROM CSV (importing)</p>
                        <p style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 14 }}>{row?.clientName || '—'}</p>
                        <div className="space-y-1 mt-2" style={{ fontSize: 12 }}>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Package: {row?.packageSize === 0 ? 'Pending' : `${row?.packageSize} lessons`}</p>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Lessons: {row?.lessonDates.length || 0}</p>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Payment: ${(row?.amountPaid || 0).toLocaleString()} MXN</p>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="hidden md:flex items-center justify-center pt-8">
                        <ArrowRight className="h-5 w-5" style={{ color: '#E8D5B0', opacity: 0.4 }} />
                      </div>

                      {/* Existing student */}
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(74,124,89,0.08)', border: '1px solid rgba(74,124,89,0.15)' }}>
                        <p style={{ color: '#4a7c59', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>EXISTING STUDENT</p>
                        <p style={{ color: '#F5F0E8', fontWeight: 600, fontSize: 14 }}>{existing.full_name || '—'}</p>
                        <div className="space-y-1 mt-2" style={{ fontSize: 12 }}>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Email: {isPlaceholderEmail(existing.email) ? '(import placeholder)' : existing.email}</p>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Lessons: {existing.lessonCount || 0}</p>
                          <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Packages: {existing.packageCount || 0}</p>
                          {existing.handicap && <p style={{ color: '#E8D5B0', opacity: 0.7 }}>Handicap: {existing.handicap}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Decision buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => setDecision(match.rowIndex, 'merge')}
                        className="gap-1.5"
                        style={{
                          background: decision === 'merge' ? '#4a7c59' : 'rgba(74,124,89,0.15)',
                          color: decision === 'merge' ? '#F5F0E8' : '#4a7c59',
                          border: decision === 'merge' ? 'none' : '1px solid rgba(74,124,89,0.3)',
                        }}
                      >
                        <Merge className="h-4 w-4" /> Merge into existing
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setDecision(match.rowIndex, 'keep_separate')}
                        className="gap-1.5"
                        style={{
                          background: decision === 'keep_separate' ? 'rgba(96,165,250,0.3)' : 'rgba(96,165,250,0.08)',
                          color: '#60a5fa',
                          border: decision === 'keep_separate' ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(96,165,250,0.2)',
                        }}
                      >
                        <Users className="h-4 w-4" /> Keep Separate
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setDecision(match.rowIndex, 'skip')}
                        className="gap-1.5"
                        style={{
                          background: decision === 'skip' ? 'rgba(240,192,64,0.2)' : 'rgba(240,192,64,0.08)',
                          color: '#F0C040',
                          border: decision === 'skip' ? '1px solid rgba(240,192,64,0.4)' : '1px solid rgba(240,192,64,0.15)',
                        }}
                      >
                        <SkipForward className="h-4 w-4" /> Skip for now
                      </Button>
                    </div>

                    {/* Decision label */}
                    {decision && (
                      <p style={{ fontSize: 12, fontWeight: 600, color: decision === 'merge' ? '#4a7c59' : decision === 'keep_separate' ? '#60a5fa' : '#F0C040' }}>
                        {decision === 'merge' && '✓ Will merge CSV data into the existing student record'}
                        {decision === 'keep_separate' && '✓ Will create as a new separate student'}
                        {decision === 'skip' && '✓ Will skip this row — not imported now'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleImportAfterReview}
                disabled={importing || !allDecided}
                className="w-full h-12 text-base font-semibold rounded-xl"
                style={{ background: allDecided ? '#4a7c59' : 'rgba(74,124,89,0.3)', color: '#F5F0E8' }}
              >
                {importing ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Importing...</>
                ) : (
                  <><Upload className="h-5 w-5 mr-2" /> Confirm Import</>
                )}
              </Button>
              {!allDecided && (
                <p className="text-center" style={{ color: '#F0C040', fontSize: 12 }}>
                  {pendingCount} match{pendingCount !== 1 ? 'es' : ''} still need your decision before importing.
                </p>
              )}
              <Button variant="ghost" size="sm" onClick={() => setStep('preview')} className="w-full" style={{ color: '#E8D5B0', opacity: 0.6 }}>
                ← Back to Preview
              </Button>
            </div>
          </>
        )}

        {/* ───── STEP: DONE ───── */}
        {step === 'done' && importResult && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
                <CheckCircle className="h-6 w-6" style={{ color: '#4a7c59' }} />
              </div>
              <div>
                <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700 }}>Import Complete</h3>
                <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 13 }}>Here's your summary</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Students Created', value: importResult.studentsCreated },
                { label: 'Students Matched', value: importResult.studentsMatched ?? 0 },
                { label: 'Students Merged', value: importResult.studentsMerged ?? 0 },
                { label: 'Packages Created', value: importResult.packagesCreated },
                { label: 'Packages Skipped (dupes)', value: importResult.packagesSkipped ?? 0 },
                { label: 'Lessons Created', value: importResult.lessonsCreated },
                { label: 'Lessons Skipped (dupes)', value: importResult.lessonsSkipped },
                { label: 'Payments Created', value: importResult.paymentsCreated ?? 0 },
                { label: 'Payments Skipped (dupes)', value: importResult.paymentsSkipped ?? 0 },
                { label: 'Points Awarded', value: importResult.pointsAwarded },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>{item.label}</p>
                  <p style={{ color: '#E8D5B0', fontSize: 24, fontWeight: 700 }}>{item.value}</p>
                </div>
              ))}
            </div>
            {(importResult.totalRevenueImported > 0 || importResult.totalPendingBalance > 0) && (
              <div className="p-4 rounded-xl" style={{ background: 'rgba(74,124,89,0.1)', border: '1px solid rgba(74,124,89,0.25)' }}>
                <p style={{ color: '#4a7c59', fontSize: 13, fontWeight: 600 }} className="mb-3 flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> Financial Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(74,124,89,0.15)' }}>
                    <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>Revenue Imported</p>
                    <p style={{ color: '#4a7c59', fontSize: 22, fontWeight: 700 }}>${(importResult.totalRevenueImported ?? 0).toLocaleString()} MXN</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(240,192,64,0.1)' }}>
                    <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>Pending Balance</p>
                    <p style={{ color: '#F0C040', fontSize: 22, fontWeight: 700 }}>${(importResult.totalPendingBalance ?? 0).toLocaleString()} MXN</p>
                  </div>
                </div>
              </div>
            )}
            {importResult.errors?.length > 0 && (
              <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }} className="mb-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {importResult.errors.length} issue(s)</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importResult.errors.map((error: string, index: number) => <p key={`${error}-${index}`} style={{ color: '#ef4444', opacity: 0.8, fontSize: 12 }}>{error}</p>)}
                </div>
              </div>
            )}
            <Button onClick={reset} variant="outline" className="w-full btn-glass">Import Another File</Button>
          </div>
        )}
      </main>

      <SocialFooter />
    </div>
  );
}
