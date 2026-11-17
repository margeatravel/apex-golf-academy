import { Pause } from 'lucide-react';
import { getCancunToday } from '@/lib/cancunDate';
import { formatShortDate } from '@/lib/pendingRecurringMove';
import { useLanguage } from '@/contexts/LanguageContext';

/** Read-only "Paused until [date]" chip for recurring slot cards. */
export function PausedChip({ slot, className = '' }: { slot: any; className?: string }) {
  const { language } = useLanguage();
  const paused = slot?.paused_until ? String(slot.paused_until).substring(0, 10) : null;
  if (!paused || paused <= getCancunToday()) return null;
  const en = language === 'en';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-[1px] font-semibold normal-case tracking-normal shrink-0 ${className}`}
      style={{ background: 'rgba(148,163,184,0.2)', color: '#cbd5e1', fontSize: 9 }}
    >
      <Pause className="h-2.5 w-2.5" />
      {en ? `Paused until ${formatShortDate(paused, 'en')}` : `Pausado hasta ${formatShortDate(paused, 'es')}`}
    </span>
  );
}
