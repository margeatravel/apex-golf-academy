import { SlotItem, SLOT_STYLE, fmtTime12h, subscriptionTierLabel, subscriptionTierStyle } from './calendarTypes';
import { Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  slot: SlotItem;
  compact?: boolean;
  onClick?: (slot: SlotItem) => void;
}

/**
 * Single colored slot tile used in both the dashboard mini-calendar and the
 * full /admin/calendar grid. Color & label are driven exclusively by
 * SLOT_STYLE so the legend always matches what's on screen.
 */
export function SlotTile({ slot, compact = false, onClick }: Props) {
  const style = SLOT_STYLE[slot.kind];
  const muted = slot.kind === 'skipped' || slot.status === 'cancelled';
  const sharedNames = slot.shared_with ?? [];
  const isShared = sharedNames.length > 0;
  const isPaidSub = !!slot.has_active_subscription;
  const tierLabel = subscriptionTierLabel(slot.subscription_tier);
  const tierStyle = subscriptionTierStyle(slot.subscription_tier);

  const primary =
    slot.kind === 'open'
      ? 'Open spot'
      : slot.kind === 'blocked'
      ? slot.notes || 'Blocked'
      : slot.student_name || 'Unassigned';

  const sub = slot.lesson_type ? `${slot.lesson_type}` : '';
  const hasRemaining =
    slot.package_remaining != null && (slot.kind === 'fixed' || slot.kind === 'one_time');

  return (
    <button
      type="button"
      onClick={() => onClick?.(slot)}
      className="w-full text-left rounded-md transition-colors hover:brightness-110 active:scale-[0.98]"
      style={{
        position: 'relative',
        background: style.bg,
        border: style.border,
        borderLeft: isPaidSub && tierStyle ? `3px solid ${tierStyle.accent}` : style.border,
        color: style.text,
        padding: compact ? '4px 6px' : '6px 8px',
        opacity: muted ? 0.75 : 1,
      }}
      title={`${fmtTime12h(slot.start_time)} · ${primary}${sub ? ' · ' + sub : ''}${
        isShared ? ` · Shared with ${sharedNames.join(', ')}` : ''
      }`}
    >
      {hasRemaining && (
        <span
          className="absolute rounded px-1 py-[1px] font-semibold"
          style={(() => {
            const r = slot.package_remaining!;
            // white: 6+ left · yellow: 5-3 · red: 2 or fewer (incl. 0)
            const tone =
              r >= 6
                ? { text: '#FFFFFF', bg: 'rgba(255,255,255,0.18)', border: 'rgba(255,255,255,0.55)' }
                : r >= 3
                ? { text: '#F0C040', bg: 'rgba(240,192,64,0.2)', border: 'rgba(240,192,64,0.55)' }
                : { text: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.45)' };
            return {
              position: 'absolute' as const,
              top: compact ? 2 : 3,
              right: compact ? 3 : 4,
              zIndex: 5,
              color: tone.text,
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              fontSize: compact ? 8 : 9,
              lineHeight: 1,
            };
          })()}
          title={`${slot.package_remaining} lessons left in package`}
        >
          {slot.package_remaining}
        </span>
      )}
      <div
        className="flex items-center justify-between gap-1"
        style={{ fontSize: compact ? 10 : 11, lineHeight: 1.1, opacity: 0.85, paddingRight: hasRemaining ? (compact ? 14 : 16) : undefined }}
      >
        <span className="font-medium">{fmtTime12h(slot.start_time)}</span>
        <span className="flex items-center gap-1">
          {tierLabel && tierStyle && (slot.kind === 'fixed' || slot.kind === 'one_time') && (
            <span
              className="rounded px-1 py-[1px] font-semibold uppercase tracking-wide"
              style={{
                color: tierStyle.text,
                background: tierStyle.bg,
                border: tierStyle.border,
                fontSize: compact ? 8 : 9,
                lineHeight: 1,
              }}
              title={`Active ${tierLabel} subscription`}
            >
              {tierLabel}
            </span>
          )}
          {isShared && (
            <Popover>
              <PopoverTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 rounded px-1 py-[1px] hover:bg-white/15 cursor-pointer"
                  style={{
                    background: 'rgba(240,192,64,0.18)',
                    color: '#F0C040',
                    fontSize: compact ? 8 : 9,
                  }}
                  title={`Shared with ${sharedNames.join(', ')}`}
                >
                  <Users className="h-2.5 w-2.5" />
                  {sharedNames.length > 0 && <span className="font-semibold">+{sharedNames.length}</span>}
                </span>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-[220px] p-2 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="font-semibold mb-1 text-[#F0C040]">Shared package</div>
                <div className="text-foreground/85">
                  Shared with: {sharedNames.join(', ')}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {slot.kind === 'skipped' && (
            <span
              className="uppercase tracking-wider px-1 py-[1px] rounded"
              style={{
                fontSize: compact ? 8 : 9,
                background: 'rgba(156,163,175,0.2)',
                color: '#9CA3AF',
              }}
            >
              Skipped
            </span>
          )}
        </span>
      </div>
      <div
        className="font-semibold mt-0.5 break-words line-clamp-2"
        style={{ fontSize: compact ? 11 : 12, textDecoration: muted ? 'line-through' : 'none' }}
      >
        {primary}
      </div>
      {sub && !compact && (
        <div className="truncate" style={{ fontSize: 10, opacity: 0.75 }}>
          {sub}
        </div>
      )}
    </button>
  );
}