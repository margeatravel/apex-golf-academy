import { SLOT_STYLE } from './calendarTypes';

/**
 * Top-of-calendar legend explaining what each tile color means.
 * Rendered both on the dashboard hero and on the full /admin/calendar page.
 */
export function CalendarLegend({ compact = false }: { compact?: boolean }) {
  const order = ['fixed', 'one_time', 'open', 'skipped', 'blocked'] as const;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
      style={{ fontSize: compact ? 10 : 11, color: '#F5F0E8', opacity: 0.85 }}
    >
      {order.map((k) => {
        const s = SLOT_STYLE[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block rounded"
              style={{
                width: compact ? 10 : 12,
                height: compact ? 10 : 12,
                background: s.bg,
                border: s.border,
              }}
            />
            {s.label}
          </span>
        );
      })}
    </div>
  );
}