import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  planTier: string;          // e.g. "pro" or "scratch"
  paidThrough: string;       // ISO date
}

/** Compact notice shown to users in their downgrade/cancellation grace window. */
export function GraceBanner({ planTier, paidThrough }: Props) {
  const date = new Date(paidThrough);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const tierLabel = planTier.charAt(0).toUpperCase() + planTier.slice(1);

  return (
    <div
      className="glass-card p-3 flex items-center gap-3"
      style={{
        borderColor: 'rgba(240,192,64,0.3)',
        background: 'linear-gradient(135deg, rgba(240,192,64,0.08), rgba(240,192,64,0.02))',
      }}
    >
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(240,192,64,0.18)' }}
      >
        <Clock className="h-4 w-4 text-gold-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ivory text-xs sm:text-sm leading-snug">
          Your <span className="font-semibold">{tierLabel}</span> membership stays
          active until <span className="font-semibold">{formatted}</span>.
        </p>
        <Link
          to="/plans"
          className="text-[11px] text-gold-accent hover:underline"
        >
          Renew anytime →
        </Link>
      </div>
    </div>
  );
}