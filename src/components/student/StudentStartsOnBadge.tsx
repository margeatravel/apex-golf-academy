import { getCancunToday } from '@/lib/cancunDate';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Student-portal chip for a recurring slot that starts on a future date:
 * "Comienza el vie 2 oct" / "Starts Fri, Oct 2". Nothing when null or past.
 * YYYY-MM-DD is parsed as a local date (never UTC-shifted).
 */
export function StudentStartsOnBadge({ startsOn, className = '' }: { startsOn?: string | null; className?: string }) {
  const { language } = useLanguage();
  const iso = startsOn ? String(startsOn).substring(0, 10) : null;
  if (!iso || iso <= getCancunToday()) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12);
  const label =
    language === 'en'
      ? `Starts ${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(dt)}`
      : `Comienza el ${new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
          .format(dt)
          .replace(/\./g, '')
          .replace(',', '')}`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
      style={{ background: 'rgba(240,192,64,0.18)', color: '#F0C040' }}
      title={label}
    >
      {label}
    </span>
  );
}
