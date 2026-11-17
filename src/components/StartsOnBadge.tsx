import { getCancunToday } from '@/lib/cancunDate';
import { formatShortDate } from '@/lib/pendingRecurringMove';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Small gold chip for a recurring slot that only starts on a future date
 * ("Desde 5 oct"). Renders nothing once that date has arrived.
 */
export function StartsOnBadge({ slot, className = '' }: { slot: any; className?: string }) {
  const { language } = useLanguage();
  const startsOn = slot?.starts_on ? String(slot.starts_on).substring(0, 10) : null;
  if (!startsOn || startsOn <= getCancunToday()) return null;
  const short = formatShortDate(startsOn, language as 'es' | 'en');
  const label = language === 'en' ? `From ${short}` : `Desde ${short}`;
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-[1px] font-semibold normal-case tracking-normal shrink-0 ${className}`}
      style={{ background: 'rgba(240,192,64,0.18)', color: '#F0C040', fontSize: 9 }}
      title={label}
    >
      {label}
    </span>
  );
}
