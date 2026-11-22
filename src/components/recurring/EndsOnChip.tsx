import { CalendarClock } from 'lucide-react';
import { getCancunToday } from '@/lib/cancunDate';
import { formatShortDate } from '@/lib/pendingRecurringMove';
import { useLanguage } from '@/contexts/LanguageContext';

/** Read-only "Ends [date]" chip for temporary recurring slots. */
export function EndsOnChip({ slot, className = '' }: { slot: any; className?: string }) {
  const { language } = useLanguage();
  const endsOn = slot?.ends_on ? String(slot.ends_on).substring(0, 10) : null;
  if (!endsOn || endsOn <= getCancunToday()) return null;
  const en = language === 'en';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-[1px] font-semibold normal-case tracking-normal shrink-0 ${className}`}
      style={{ background: 'rgba(240,192,64,0.18)', color: '#F0C040', fontSize: 9 }}
    >
      <CalendarClock className="h-2.5 w-2.5" />
      {en ? `Ends ${formatShortDate(endsOn, 'en')}` : `Termina ${formatShortDate(endsOn, 'es')}`}
    </span>
  );
}
