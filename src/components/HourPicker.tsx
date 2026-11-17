import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HourPickerProps {
  /** Stored value in 'HH:MM' 24h format (:00 or :30), or '' for empty */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'default' | 'sm';
  placeholder?: string;
}

/** Format 'HH:MM' 24h as "7 AM" / "12:30 PM" (minutes shown only when not :00). */
export function formatHourOnly(value: string | null | undefined): string {
  if (!value) return '';
  const hh = parseInt(value.slice(0, 2), 10);
  if (isNaN(hh)) return '';
  const mm = value.slice(3, 5) || '00';
  const period = hh >= 12 ? 'PM' : 'AM';
  const display = hh % 12 === 0 ? 12 : hh % 12;
  return mm === '00' ? `${display} ${period}` : `${display}:${mm} ${period}`;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i); // 0..23

export function HourPicker({
  value,
  onChange,
  className,
  size = 'default',
  placeholder = 'Pick hour',
}: HourPickerProps) {
  const [open, setOpen] = useState(false);

  // Hour first (defaults to :00), then optional :00 / :30 choice.
  const currentHour = value ? value.slice(0, 2) : '';
  const currentMin = value ? value.slice(3, 5) || '00' : '00';
  const select = (h: number) => {
    const hh = String(h).padStart(2, '0');
    onChange(`${hh}:00`);
  };
  const selectMinutes = (mm: '00' | '30') => {
    if (!currentHour) return;
    onChange(`${currentHour}:${mm}`);
    setOpen(false);
  };
  const btnClass = (active: boolean) =>
    cn(
      'rounded-full text-xs font-medium transition-all flex items-center justify-center border',
      active
        ? 'bg-accent text-accent-foreground border-accent'
        : 'bg-secondary text-foreground border-border hover:bg-secondary/80',
    );

  const display = formatHourOnly(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size === 'sm' ? 'sm' : 'default'}
          className={cn(
            'justify-start text-left bg-white/5 border-white/10 hover:bg-white/10 text-[#F5F0E8]',
            !value && 'text-[#F5F0E8]/40',
            className,
          )}
        >
          <Clock className={cn('mr-2', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {display || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3 bg-background border-border text-foreground"
        align="start"
      >
        <div className="space-y-3">
          {/* AM */}
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1.5 text-muted-foreground">AM</p>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS_24.slice(0, 12).map((h) => {
                const label = h === 0 ? 12 : h;
                const isActive = currentHour === String(h).padStart(2, '0');
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => select(h)}
                    className={cn('h-9 w-9', btnClass(isActive))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* PM */}
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1.5 text-muted-foreground">PM</p>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS_24.slice(12, 24).map((h) => {
                const label = h % 12 === 0 ? 12 : h % 12;
                const isActive = currentHour === String(h).padStart(2, '0');
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => select(h)}
                    className={cn('h-9 w-9', btnClass(isActive))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {currentHour && (
            <div className="grid grid-cols-2 gap-1.5">
              {(['00', '30'] as const).map((mm) => (
                <button
                  key={mm}
                  type="button"
                  onClick={() => selectMinutes(mm)}
                  className={cn('h-9', btnClass(currentMin === mm))}
                >
                  :{mm}
                </button>
              ))}
            </div>
          )}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
