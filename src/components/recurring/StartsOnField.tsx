import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { getCancunToday } from '@/lib/cancunDate';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Extra class for the wrapper. */
  className?: string;
  labelClassName?: string;
}

/**
 * Shared "Starting from" date field for recurring-spot flows (assign open spot
 * and add weekly recurring spot). Defaults to today in America/Cancun; a future
 * date means no lessons are generated before it.
 */
export function StartsOnField({ value, onChange, className, labelClassName }: Props) {
  const today = getCancunToday();
  return (
    <div className={className ?? 'space-y-2'}>
      <Label className={labelClassName}>Starting from</Label>
      <DateField
        value={value}
        min={today}
        onChange={(e) => onChange(e.target.value || today)}
      />
      <p className="text-xs text-muted-foreground">
        {value > today
          ? 'No lessons are generated before this date.'
          : 'Starts today — same behaviour as before.'}
      </p>
    </div>
  );
}

/** Short label for the generate checkbox, e.g. "Oct 7". */
export function startsOnShortLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
