import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HourPicker } from '@/components/HourPicker';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const LESSON_TYPES = ['Range', 'Playing Lesson'] as const;
export type LessonTypeValue = typeof LESSON_TYPES[number];

export interface DateRow {
  id: string;
  date: Date | undefined;
  time: string;
  lessonType: LessonTypeValue;
}

let rowCounter = 0;
export function makeRow(lessonType: LessonTypeValue = 'Range', date?: Date, time = ''): DateRow {
  return { id: String(++rowCounter), date, time, lessonType };
}

/** Local-component ISO date (never toISOString(), which shifts the day in America/Cancun). */
export function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Compact, brand-styled single-date calendar used inside the date-row pickers.
 * Styling only — selection logic stays with the caller. Scoped here so other
 * usages of `@/components/ui/calendar` keep their current look.
 */
export function RowDateCalendar({
  selected,
  onSelect,
  disabled,
}: {
  selected?: Date;
  onSelect: (d: Date | undefined) => void;
  disabled?: (d: Date) => boolean;
}) {
  return (
    <Calendar
      mode="single"
      locale={es}
      weekStartsOn={0}
      selected={selected}
      onSelect={onSelect}
      disabled={disabled}
      initialFocus
      fixedWeeks={false}
      showOutsideDays={false}
      formatters={{
        formatCaption: (date) => cap(format(date, 'LLLL yyyy', { locale: es })),
        formatWeekdayName: (date) => cap(format(date, 'EEEEEE', { locale: es })),
      }}
      className="p-3 pointer-events-auto"
      classNames={{
        caption: 'flex justify-center items-center relative h-7',
        caption_label: 'text-sm font-medium',
        nav_button: 'h-7 w-7 p-0 inline-flex items-center justify-center rounded-md border border-white/10 bg-transparent opacity-70 hover:opacity-100',
        nav_button_previous: 'absolute left-0',
        nav_button_next: 'absolute right-0',
        head_cell: 'w-9 text-[12px] font-normal text-muted-foreground',
        cell: 'h-9 w-9 text-center p-0 relative',
        day: 'h-9 w-9 p-0 font-normal text-[14px] rounded-full inline-flex items-center justify-center transition-colors hover:bg-white/10',
        day_selected:
          'bg-[#4a7c59] text-white hover:bg-[#4a7c59] hover:text-white focus:bg-[#4a7c59] focus:text-white rounded-full',
        day_today: 'bg-transparent border border-[#E8D5B0]/50 text-[#E8D5B0]',
        day_disabled: 'opacity-35 pointer-events-none cursor-default',
      }}
    />
  );
}

interface LessonDateRowsProps {
  rows: DateRow[];
  onChange: (rows: DateRow[]) => void;
  label?: string;
  addLabel?: string;
  countLabel?: (n: number) => string;
  /** Disable dates in the picker (e.g. past dates for open spots). */
  disabledDate?: (d: Date) => boolean;
  /** Default lesson type for newly added rows. */
  defaultType?: LessonTypeValue;
  /** Extra content rendered between the header and the rows. */
  children?: React.ReactNode;
}

/**
 * Numbered date + hour + lesson-type rows. Extracted from AddLessonModal's
 * "Lesson Dates" section so other modals (e.g. AddOpenSpotModal) reuse the
 * exact same pattern instead of duplicating it.
 */
export function LessonDateRows({
  rows,
  onChange,
  label = 'Lesson Dates',
  addLabel = 'Add Another Date',
  countLabel = (n) => `${n} selected`,
  disabledDate,
  defaultType = 'Range',
  children,
}: LessonDateRowsProps) {
  const validCount = rows.filter((r) => r.date).length;

  const addRow = () => onChange([...rows, makeRow(defaultType)]);
  const removeRow = (id: string) => onChange(rows.length > 1 ? rows.filter((r) => r.id !== id) : rows);
  const patch = (id: string, p: Partial<DateRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[#F5F0E8]/70 text-sm">{label}</Label>
        <span className="text-[10px] text-[#F5F0E8]/40">{countLabel(validCount)}</span>
      </div>

      {children}

      {rows.map((row, idx) => (
        <div key={row.id} className="flex items-center gap-2">
          <span className="text-xs w-5 text-center shrink-0" style={{ color: '#E8D5B0', opacity: 0.6 }}>{idx + 1}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                'flex-1 justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8] h-9',
                !row.date && 'text-[#F5F0E8]/40'
              )}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {row.date ? format(row.date, 'MMM dd, yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-[#0d1f18] border-white/10" align="start">
              <RowDateCalendar
                selected={row.date}
                onSelect={(d) => patch(row.id, { date: d })}
                disabled={disabledDate}
              />
            </PopoverContent>
          </Popover>
          <HourPicker
            value={row.time}
            onChange={(t) => patch(row.id, { time: t })}
            size="sm"
            className="h-9 w-[92px] shrink-0 px-2 text-xs"
            placeholder="Hr"
          />
          <button
            onClick={() => patch(row.id, { lessonType: row.lessonType === 'Range' ? 'Playing Lesson' : 'Range' })}
            className="h-9 w-[104px] shrink-0 px-2 rounded text-xs leading-none truncate text-center transition-colors"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#E8D5B0',
            }}
            title="Click to toggle type"
          >{row.lessonType}</button>
          {rows.length > 1 && (
            <button onClick={() => removeRow(row.id)}
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors">
              <X className="h-3.5 w-3.5 text-red-400" />
            </button>
          )}
        </div>
      ))}

      <Button variant="ghost" size="sm" onClick={addRow}
        className="w-full text-xs gap-1 text-[#4a7c59] hover:text-[#4a7c59] hover:bg-[#4a7c59]/10 border border-dashed border-[#4a7c59]/30">
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}
