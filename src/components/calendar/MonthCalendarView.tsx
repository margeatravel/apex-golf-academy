import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  WEEKDAYS_SHORT,
  toISODate,
  SLOT_STYLE,
  SlotKind,
} from './calendarTypes';
import { useCalendarMonth, monthGridDates } from './useCalendarMonth';

interface Props {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  /** Tap a day → jump back to week view anchored on that date. */
  onSelectDay: (d: Date) => void;
}

/**
 * Compact month overview: each cell shows the day number, the count of
 * scheduled items, and small color dots for the slot kinds present.
 * Tapping a day switches the parent calendar back to Week view anchored on it.
 */
export function MonthCalendarView({ anchor, onAnchorChange, onSelectDay }: Props) {
  const { dates, firstOfMonth } = useMemo(() => monthGridDates(anchor), [anchor]);
  const { data: byDate = {}, isLoading } = useCalendarMonth(dates);

  const monthLabel = firstOfMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const todayIso = toISODate(new Date());

  const goPrev = () => {
    const d = new Date(firstOfMonth);
    d.setMonth(d.getMonth() - 1);
    onAnchorChange(d);
  };
  const goNext = () => {
    const d = new Date(firstOfMonth);
    d.setMonth(d.getMonth() + 1);
    onAnchorChange(d);
  };
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    onAnchorChange(d);
  };

  // Order kinds for dot summary (most informative first)
  const dotOrder: SlotKind[] = ['fixed', 'one_time', 'open', 'skipped', 'blocked'];

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={goPrev} className="h-9 w-9 p-0" title="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={goToday} className="h-9 px-3 text-xs">
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={goNext} className="h-9 w-9 p-0" title="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm text-[#F5F0E8]/85 font-medium">{monthLabel}</span>
        </div>
      </div>

      {/* Weekday header (Mon-first) */}
      <div className="grid grid-cols-7 gap-1.5">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div
            key={d}
            className="text-[10px] uppercase tracking-wider text-center font-semibold"
            style={{ color: '#F5F0E8', opacity: 0.55 }}
          >
            {d}
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-[#F5F0E8]/70 text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading month…
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {dates.map((d) => {
            const iso = toISODate(d);
            const slots = byDate[iso] || [];
            const inMonth = d.getMonth() === firstOfMonth.getMonth();
            const isToday = iso === todayIso;
            const counts: Partial<Record<SlotKind, number>> = {};
            for (const s of slots) counts[s.kind] = (counts[s.kind] || 0) + 1;
            const total = slots.length;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDay(d)}
                className="rounded-lg p-2 min-h-[80px] sm:min-h-[96px] flex flex-col items-stretch text-left transition-all hover:bg-white/5 active:scale-[0.99]"
                style={{
                  background: isToday
                    ? 'rgba(240,192,64,0.10)'
                    : inMonth
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.015)',
                  border: isToday
                    ? '1px solid rgba(240,192,64,0.45)'
                    : '1px solid rgba(255,255,255,0.08)',
                  opacity: inMonth ? 1 : 0.4,
                }}
                title={`${d.toDateString()} — ${total} item${total === 1 ? '' : 's'}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[12px] font-bold"
                    style={{ color: isToday ? '#F0C040' : '#F5F0E8' }}
                  >
                    {d.getDate()}
                  </span>
                  {total > 0 && (
                    <span
                      className="text-[10px] font-semibold rounded-full px-1.5 py-[1px]"
                      style={{
                        background: 'rgba(245,240,232,0.10)',
                        color: '#F5F0E8',
                      }}
                    >
                      {total}
                    </span>
                  )}
                </div>

                {/* Dots summary */}
                <div className="flex items-center gap-1 mt-auto pt-2 flex-wrap">
                  {dotOrder
                    .filter((k) => counts[k])
                    .slice(0, 5)
                    .map((k) => (
                      <span
                        key={k}
                        className="inline-block rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          background: SLOT_STYLE[k].dot,
                        }}
                        title={`${counts[k]} ${SLOT_STYLE[k].label.toLowerCase()}`}
                      />
                    ))}
                </div>

                {/* Tiny weekday for current-week visibility (only on first row of grid not needed since header already shows) */}
                {WEEKDAYS_SHORT[d.getDay()] && false && null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}