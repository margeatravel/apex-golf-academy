export interface LessonEntry {
  date: string;        // ISO date
  status: 'completed' | 'no_show';
}

export interface ParsedRow {
  clientName: string;
  packageSize: number;
  paymentDate: string | null;
  amountPaid: number;
  lessonDates: string[];
  noShowDates: string[];
  warnings: string[];
  sourceRowNumber: number;
  clientColumnMissing: boolean;
}

export interface Diagnostics {
  delimiter: string;
  encoding: string;
  totalRawRows: number;
  headerRowIndex: number | null;
  headerRow: string[];
  normalizedHeaders: string[];
  mappedColumns: Record<string, string | null>;
  claseColumns: string[];
  validRows: number;
  skippedRows: number;
  skipReasons: string[];
  errors: string[];
  clientColumnFound: boolean;
}

const EXPECTED_HEADERS = {
  client: 'CLIENTE',
  classes: 'CLASES',
  paymentDate: 'FECHA DE PAGO',
  amount: 'CANTIDAD DE PAGO',
} as const;

// Spanish + English month abbreviations → 0-indexed month
const MONTH_MAP: Record<string, number> = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, septiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11,
};

const NO_SHOW_KEYWORDS = ['no show', 'noshow', 'no-show', 'ns', 'falta', 'ausente', 'no asistió', 'no asistio'];

function cleanCell(value: unknown): string {
  return String(value ?? '')
    .replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function stripBOM(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function cleanHeader(value: unknown): string {
  return cleanCell(value).toUpperCase();
}

function isClaseHeader(header: string): boolean {
  return /^CLASE\s*\d+$/.test(cleanHeader(header));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function isNoShowCell(value: unknown): boolean {
  const text = cleanCell(value).toLowerCase();
  return NO_SHOW_KEYWORDS.some(kw => text.includes(kw));
}

function getHeaderScore(row: unknown[]): number {
  const normalized = row.map(cleanHeader).filter(Boolean);
  const headerSet = new Set(normalized);
  const claseCount = normalized.filter(isClaseHeader).length;

  let score = 0;
  if (headerSet.has(EXPECTED_HEADERS.client)) score += 6;
  if (headerSet.has(EXPECTED_HEADERS.classes)) score += 4;
  if (headerSet.has(EXPECTED_HEADERS.paymentDate)) score += 4;
  if (headerSet.has(EXPECTED_HEADERS.amount)) score += 4;
  score += Math.min(8, claseCount * 2);

  return score;
}

function isColumnEmpty(matrix: { cells: unknown[] }[], colIndex: number): boolean {
  return matrix.every(({ cells }) => cleanCell(cells[colIndex]) === '');
}

export function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }

  // Excel serial number
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1000 && raw < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30 + Math.round(raw)));
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  const text = cleanCell(raw);
  if (!text) return null;

  // Excel serial as string
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const num = Number.parseFloat(text);
    if (Number.isFinite(num) && num > 1000 && num < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30 + Math.round(num)));
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // "22-Sep", "Sep-22", "ene 21", "Feb 6", "6 Feb", "ene-21"
  const monthDayMatch = text.match(/^(\d{1,2})[\s\-./]+([a-záéíóúñü]+)$/i)
    || text.match(/^([a-záéíóúñü]+)[\s\-./]+(\d{1,2})$/i);
  if (monthDayMatch) {
    let monthStr: string, dayStr: string;
    if (/^\d/.test(monthDayMatch[1])) {
      dayStr = monthDayMatch[1];
      monthStr = monthDayMatch[2];
    } else {
      monthStr = monthDayMatch[1];
      dayStr = monthDayMatch[2];
    }
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(dayStr, 10);
      if (day >= 1 && day <= 31) {
        const year = new Date().getFullYear();
        const d = new Date(Date.UTC(year, month, day));
        if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }
  }

  // "21/ene/2025", "ene/21/2025", etc with month name
  const fullMonthMatch = text.match(/^(\d{1,2})[\s\-./]+([a-záéíóúñü]+)[\s\-./]+(\d{2,4})$/i)
    || text.match(/^([a-záéíóúñü]+)[\s\-./]+(\d{1,2})[\s\-./]+(\d{2,4})$/i);
  if (fullMonthMatch) {
    let monthStr: string, dayStr: string, yearStr: string;
    if (/^\d/.test(fullMonthMatch[1])) {
      dayStr = fullMonthMatch[1];
      monthStr = fullMonthMatch[2];
      yearStr = fullMonthMatch[3];
    } else {
      monthStr = fullMonthMatch[1];
      dayStr = fullMonthMatch[2];
      yearStr = fullMonthMatch[3];
    }
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(dayStr, 10);
      const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
      if (day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
        const d = new Date(Date.UTC(year, month, day));
        if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY — try MM/DD first (US format common in Excel exports)
  const numericDate = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (numericDate) {
    const a = parseInt(numericDate[1], 10);
    const b = parseInt(numericDate[2], 10);
    const yearStr = numericDate[3];
    const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
    // Try M/D/Y first
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const d = new Date(Date.UTC(year, a - 1, b));
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Then D/M/Y
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      const d = new Date(Date.UTC(year, b - 1, a));
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // YYYY-MM-DD
  const ymd = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const d = new Date(Date.UTC(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10)));
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // Last resort: JS Date constructor (but avoid short strings)
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && text.length >= 6) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

function parsePackageSize(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  const digits = cleanCell(raw).replace(/[^0-9]/g, '');
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  let text = cleanCell(raw);
  if (!text) return 0;

  text = text.replace(/MXN/gi, '').replace(/\$/g, '').replace(/\s/g, '');

  if (text.includes(',') && text.includes('.')) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    const parts = text.split(',');
    text = parts.length === 2 && parts[1].length <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseEditableLessonDates(value: string): { validDates: string[]; invalidTokens: string[] } {
  const tokens = value.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean);
  const validDates: string[] = [];
  const invalidTokens: string[] = [];
  for (const token of tokens) {
    const parsed = parseDate(token);
    if (parsed) validDates.push(parsed);
    else invalidTokens.push(token);
  }
  return { validDates: uniqueSorted(validDates), invalidTokens };
}

export function parseSpreadsheetMatrix(
  rawMatrix: unknown[][],
  options: { delimiter: string; encoding?: string },
): { rows: ParsedRow[]; diagnostics: Diagnostics } {
  const diagnostics: Diagnostics = {
    delimiter: options.delimiter,
    encoding: options.encoding ?? 'utf-8',
    totalRawRows: 0,
    headerRowIndex: null,
    headerRow: [],
    normalizedHeaders: [],
    mappedColumns: {
      CLIENTE: null,
      CLASES: null,
      'FECHA DE PAGO': null,
      'CANTIDAD DE PAGO': null,
    },
    claseColumns: [],
    validRows: 0,
    skippedRows: 0,
    skipReasons: [],
    errors: [],
    clientColumnFound: false,
  };

  // Filter out completely blank rows
  const matrix = rawMatrix
    .map((row, index) => ({
      index,
      cells: Array.isArray(row) ? row : [row],
    }))
    .filter(({ cells }) => cells.some(cell => cleanCell(cell) !== ''));

  if (matrix.length === 0) {
    diagnostics.errors.push('File contains no readable rows.');
    return { rows: [], diagnostics };
  }

  // Find best header row
  let bestHeaderRow = matrix[0];
  let bestHeaderScore = getHeaderScore(matrix[0].cells);

  for (const candidate of matrix.slice(0, 15)) {
    const score = getHeaderScore(candidate.cells);
    if (score > bestHeaderScore) {
      bestHeaderRow = candidate;
      bestHeaderScore = score;
    }
  }

  diagnostics.headerRowIndex = bestHeaderRow.index + 1;
  diagnostics.headerRow = bestHeaderRow.cells.map(cell => cleanCell(cell));
  diagnostics.normalizedHeaders = diagnostics.headerRow.map(h => cleanHeader(h));

  // Detect and ignore completely empty columns
  const nonEmptyColIndices = diagnostics.normalizedHeaders
    .map((_, i) => i)
    .filter(i => !isColumnEmpty(matrix, i));

  const clientIdx = diagnostics.normalizedHeaders.indexOf(EXPECTED_HEADERS.client);
  const classesIdx = diagnostics.normalizedHeaders.indexOf(EXPECTED_HEADERS.classes);
  const paymentDateIdx = diagnostics.normalizedHeaders.indexOf(EXPECTED_HEADERS.paymentDate);
  const amountIdx = diagnostics.normalizedHeaders.indexOf(EXPECTED_HEADERS.amount);
  const claseIndices = diagnostics.normalizedHeaders
    .map((header, index) => (isClaseHeader(header) ? index : -1))
    .filter(index => index >= 0);

  diagnostics.clientColumnFound = clientIdx >= 0;
  diagnostics.mappedColumns.CLIENTE = clientIdx >= 0 ? diagnostics.headerRow[clientIdx] : null;
  diagnostics.mappedColumns.CLASES = classesIdx >= 0 ? diagnostics.headerRow[classesIdx] : null;
  diagnostics.mappedColumns['FECHA DE PAGO'] = paymentDateIdx >= 0 ? diagnostics.headerRow[paymentDateIdx] : null;
  diagnostics.mappedColumns['CANTIDAD DE PAGO'] = amountIdx >= 0 ? diagnostics.headerRow[amountIdx] : null;
  diagnostics.claseColumns = claseIndices.map(index => diagnostics.headerRow[index]);

  const dataRows = matrix.filter(({ index }) => index > bestHeaderRow.index);
  diagnostics.totalRawRows = dataRows.length;

  if (bestHeaderScore < 6) {
    diagnostics.errors.push('Headers not recognized. Expected CLIENTE, CLASES, FECHA DE PAGO, CANTIDAD DE PAGO, and CLASE 1 / CLASE 2 / ... columns.');
  }

  if (!diagnostics.clientColumnFound) {
    diagnostics.errors.push('No CLIENTE column detected in the header row.');
  }

  if (claseIndices.length === 0) {
    diagnostics.errors.push('No CLASE 1 / CLASE 2 / ... columns detected.');
  }

  const rows: ParsedRow[] = [];

  for (const rawRow of dataRows) {
    const cells = rawRow.cells;
    const clientName = clientIdx >= 0 ? cleanCell(cells[clientIdx]) : '';
    const packageRaw = classesIdx >= 0 ? cells[classesIdx] : '';
    const paymentDateRaw = paymentDateIdx >= 0 ? cells[paymentDateIdx] : '';
    const amountRaw = amountIdx >= 0 ? cells[amountIdx] : '';

    // Process CLASE cells — separate completed vs no-show
    const completedDates: string[] = [];
    const noShowDates: string[] = [];
    const invalidClaseValues: { header: string; value: string }[] = [];

    for (const colIdx of claseIndices) {
      const rawValue = cells[colIdx];
      const cellText = cleanCell(rawValue);
      if (!cellText) continue;

      if (isNoShowCell(rawValue)) {
        // Try to parse a date from it anyway, otherwise use today
        const dateFromCell = parseDate(cellText.replace(/no\s*show/gi, '').replace(/falta/gi, '').trim());
        noShowDates.push(dateFromCell || `no_show_clase_${diagnostics.headerRow[colIdx]}`);
        continue;
      }

      const parsed = parseDate(rawValue);
      if (parsed) {
        completedDates.push(parsed);
      } else {
        invalidClaseValues.push({ header: diagnostics.headerRow[colIdx], value: cellText });
      }
    }

    const lessonDates = uniqueSorted(completedDates);
    const hasClient = clientName.length > 0;
    const hasClaseData = lessonDates.length > 0 || noShowDates.length > 0 || invalidClaseValues.length > 0;

    if (!hasClient && !hasClaseData) {
      // Check if any non-empty cell exists in non-header columns
      const hasAnyCellData = nonEmptyColIndices.some(i => {
        if (i === clientIdx || claseIndices.includes(i)) return false;
        return cleanCell(cells[i]) !== '';
      });
      if (!hasAnyCellData) {
        diagnostics.skippedRows += 1;
        diagnostics.skipReasons.push(`Row ${rawRow.index + 1}: completely blank.`);
        continue;
      }
      diagnostics.skippedRows += 1;
      diagnostics.skipReasons.push(`Row ${rawRow.index + 1}: missing CLIENTE and no CLASE data.`);
      continue;
    }

    const warnings: string[] = [];

    if (!diagnostics.clientColumnFound) {
      warnings.push('CLIENTE column was not found in the header. Enter a student name before importing.');
    }

    if (!hasClient) {
      warnings.push('Missing CLIENTE value. This row needs a student name before importing.');
    }

    let packageSize = parsePackageSize(packageRaw);
    if (packageSize <= 0) {
      packageSize = 0;
      warnings.push('CLASES is blank or invalid. Coach must assign package size (5, 10, 20, or 30) after import.');
    }

    const paymentDate = paymentDateIdx >= 0 ? parseDate(paymentDateRaw) : null;
    if (paymentDateIdx >= 0 && cleanCell(paymentDateRaw) && !paymentDate) {
      warnings.push(`Could not parse FECHA DE PAGO: "${cleanCell(paymentDateRaw)}".`);
    }

    const amountPaid = amountIdx >= 0 ? parseAmount(amountRaw) : 0;
    if (amountIdx >= 0 && cleanCell(amountRaw) && amountPaid === 0 && cleanCell(amountRaw) !== '0') {
      warnings.push(`Could not confidently parse CANTIDAD DE PAGO: "${cleanCell(amountRaw)}".`);
    }

    if (noShowDates.length > 0) {
      warnings.push(`${noShowDates.length} no-show(s) detected and classified separately.`);
    }

    if (invalidClaseValues.length > 0) {
      const preview = invalidClaseValues
        .slice(0, 3)
        .map(item => `${item.header}: "${item.value}"`)
        .join(', ');
      warnings.push(`Unparsed CLASE values: ${preview}${invalidClaseValues.length > 3 ? '…' : ''}`);
    }

    if (packageSize > 0 && lessonDates.length + noShowDates.length > packageSize) {
      warnings.push(`Total lessons (${lessonDates.length} completed + ${noShowDates.length} no-shows) exceed CLASES (${packageSize}).`);
    }

    rows.push({
      clientName,
      packageSize,
      paymentDate,
      amountPaid,
      lessonDates,
      noShowDates: uniqueSorted(noShowDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))),
      warnings,
      sourceRowNumber: rawRow.index + 1,
      clientColumnMissing: !diagnostics.clientColumnFound,
    });
    diagnostics.validRows += 1;
  }

  if (rows.length === 0 && diagnostics.errors.length === 0) {
    diagnostics.errors.push('No valid student rows were found after parsing the file.');
  }

  return { rows, diagnostics };
}
