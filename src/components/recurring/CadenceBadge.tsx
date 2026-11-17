import { useLanguage } from '@/contexts/LanguageContext';

/** Gold chip "Cada N sem" / "Every N wks"; nothing when weekly. Same style as StartsOnBadge. */
export function CadenceBadge({ weeks, className = '' }: { weeks?: number | null; className?: string }) {
  const { language } = useLanguage();
  const n = Number(weeks ?? 1);
  if (!n || n <= 1) return null;
  const label = language === 'en' ? `Every ${n} wks` : `Cada ${n} sem`;
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
