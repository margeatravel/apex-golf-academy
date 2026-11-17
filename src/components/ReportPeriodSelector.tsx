import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';
import type { PeriodState, ReportPeriodPreset } from '@/lib/reportPeriods';

interface Props {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  options: { value: ReportPeriodPreset; labelKey: string }[];
  disabledPresets?: ReportPeriodPreset[];
  /** Years offered for "Mes"/"Año" (e.g. only years with rounds). */
  years?: number[];
}

/** Shared period picker (preset buttons + custom start/end + month/year selects). */
export function ReportPeriodSelector({ value, onChange, options, disabledPresets = [], years = [] }: Props) {
  const { t, language } = useLanguage();
  const set = (patch: Partial<PeriodState>) => onChange({ ...value, ...patch });
  const yearList = years.length ? years : [value.year];
  const locale = localeFor(language);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map((p) => (
          <Button
            key={p.value}
            variant={value.preset === p.value ? 'default' : 'outline'}
            size="sm"
            disabled={disabledPresets.includes(p.value)}
            onClick={() => set({ preset: p.value })}
            className={value.preset === p.value ? 'bg-[#4a7c59] hover:bg-[#3d6b4a]' : ''}
          >
            {t(p.labelKey)}
          </Button>
        ))}
      </div>

      {(value.preset === 'month' || value.preset === 'year') && (
        <div className="flex gap-2">
          {value.preset === 'month' && (
            <Select value={String(value.month)} onValueChange={(v) => set({ month: Number(v) })}>
              <SelectTrigger className="flex-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const label = new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'long' });
                  return <SelectItem key={m} value={String(m)}>{label.charAt(0).toUpperCase() + label.slice(1)}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          )}
          <Select value={String(value.year)} onValueChange={(v) => set({ year: Number(v) })}>
            <SelectTrigger className="flex-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearList.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.preset === 'custom' && (
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('flex-1 justify-start text-left', !value.customStart && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value.customStart ? format(value.customStart, 'MMM d, yyyy') : t('reports.startDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={value.customStart} onSelect={(d) => set({ customStart: d })} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('flex-1 justify-start text-left', !value.customEnd && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value.customEnd ? format(value.customEnd, 'MMM d, yyyy') : t('reports.endDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={value.customEnd} onSelect={(d) => set({ customEnd: d })} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
