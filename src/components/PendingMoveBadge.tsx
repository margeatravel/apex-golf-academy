import { getPendingMove, pendingMoveShortLabel } from '@/lib/pendingRecurringMove';

/**
 * Short gold chip for a recurring slot's scheduled change.
 * - variant "from"  → shown on the NEW card: "Desde 5 oct"
 * - variant "until" → shown on the ghost card at the old time: "Hasta 4 oct"
 */
export function PendingMoveBadge({
  slot,
  className = '',
  variant = 'from',
}: {
  slot: any;
  className?: string;
  variant?: 'from' | 'until';
}) {
  const move = getPendingMove(slot);
  if (!move) return null;
  const label = pendingMoveShortLabel(move, variant);
  const gold = variant === 'from';
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-[1px] font-semibold normal-case tracking-normal shrink-0 ${className}`}
      style={{
        background: gold ? 'rgba(240,192,64,0.18)' : 'rgba(156,163,175,0.18)',
        color: gold ? '#F0C040' : '#9CA3AF',
        fontSize: 9,
      }}
      title={label}
    >
      {label}
    </span>
  );
}
