import { useMemo } from 'react';
import { Lock, Check, User, Plus } from 'lucide-react';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface FixedSlot {
  id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  duration_minutes: number;
  lesson_type?: string;
  student_id: string | null;
  is_available: boolean;
  notes: string | null;
  profile?: { id: string; full_name: string | null; email: string } | null;
}

export function fmtSlotTime(t: string): string {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
}

interface Props {
  slots: FixedSlot[];
  /** Coach view shows claimed students; student view doesn't reveal other students. */
  variant: 'coach' | 'student';
  /** Current user's id (student view) — used to highlight slots they own. */
  currentUserId?: string;
  /** Called when a slot is clicked. Coach view: edit/delete. Student view: claim. */
  onSlotClick?: (slot: FixedSlot) => void;
  /** Coach-only: called when an empty cell is clicked (to add a slot quickly). */
  onEmptyCellClick?: (dayOfWeek: number) => void;
  /** When true, claim actions are disabled (e.g. user lacks paid plan). */
  claimDisabled?: boolean;
}

/**
 * Priority Spot Calendar — weekly view of available recurring time slots.
 * Glassmorphism style consistent with the rest of the app.
 */
export function FixedScheduleCalendar({
  slots,
  variant,
  currentUserId,
  onSlotClick,
  onEmptyCellClick,
  claimDisabled,
}: Props) {
  // Group slots by day of week, sorted by start_time
  const slotsByDay = useMemo(() => {
    const grouped: Record<number, FixedSlot[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const s of slots) {
      grouped[s.day_of_week]?.push(s);
    }
    for (const k of Object.keys(grouped)) {
      grouped[Number(k)].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return grouped;
  }, [slots]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
      {WEEKDAYS_FULL.map((dayName, idx) => {
        const daySlots = slotsByDay[idx] ?? [];
        return (
          <div
            key={idx}
            className="glass-card rounded-2xl p-3 sm:p-4 flex flex-col min-h-[180px]"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-ivory font-heading font-semibold text-sm">
                  <span className="lg:hidden">{dayName}</span>
                  <span className="hidden lg:inline">{WEEKDAYS_SHORT[idx]}</span>
                </p>
                <p className="text-[10px] text-ivory/40 uppercase tracking-wider">
                  {daySlots.length} spot{daySlots.length === 1 ? '' : 's'}
                </p>
              </div>
              {variant === 'coach' && onEmptyCellClick && (
                <button
                  type="button"
                  onClick={() => onEmptyCellClick(idx)}
                  aria-label={`Add spot on ${dayName}`}
                  className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-ivory/60 hover:text-ivory transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-2 flex-1">
              {daySlots.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[11px] text-ivory/30 italic">No spots</p>
                </div>
              ) : (
                daySlots.map((slot) => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    variant={variant}
                    isMine={currentUserId === slot.student_id}
                    onClick={onSlotClick}
                    claimDisabled={claimDisabled}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SlotCard({
  slot,
  variant,
  isMine,
  onClick,
  claimDisabled,
}: {
  slot: FixedSlot;
  variant: 'coach' | 'student';
  isMine: boolean;
  onClick?: (slot: FixedSlot) => void;
  claimDisabled?: boolean;
}) {
  const isClaimed = !!slot.student_id;
  const studentLabel = slot.profile?.full_name || slot.profile?.email || 'Claimed';

  // Style: gold for "mine", green for available, muted for taken (other people)
  let style: React.CSSProperties = {};
  let icon = null;
  let label = '';
  let sublabel: string | null = null;

  if (isMine) {
    style = {
      background: 'rgba(240,192,64,0.12)',
      borderColor: 'rgba(240,192,64,0.4)',
    };
    icon = <Check className="h-3.5 w-3.5 text-gold-accent" />;
    label = 'Yours';
    sublabel = 'Confirmed';
  } else if (isClaimed) {
    style = {
      background: 'rgba(255,255,255,0.04)',
      borderColor: 'rgba(255,255,255,0.08)',
    };
    icon = variant === 'coach'
      ? <User className="h-3.5 w-3.5 text-ivory/60" />
      : <Lock className="h-3.5 w-3.5 text-ivory/40" />;
    label = variant === 'coach' ? studentLabel : 'Taken';
  } else {
    // Available
    style = {
      background: 'rgba(74,124,89,0.10)',
      borderColor: 'rgba(74,124,89,0.35)',
    };
    label = 'Available';
  }

  const clickable =
    !!onClick &&
    (variant === 'coach' || (variant === 'student' && !isClaimed && !claimDisabled));

  return (
    <button
      type="button"
      onClick={clickable ? () => onClick!(slot) : undefined}
      disabled={!clickable}
      className={`w-full text-left rounded-lg border p-2.5 transition-all ${
        clickable ? 'hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'
      }`}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-ivory font-medium text-sm leading-tight">
          {fmtSlotTime(slot.start_time)}
        </p>
        {icon}
      </div>
      <p className="text-[11px] text-ivory/60 mt-1 truncate">{label}</p>
      {sublabel && (
        <p className="text-[10px] text-gold-accent/80 mt-0.5">{sublabel}</p>
      )}
      {!isMine && !isClaimed && (
        <p className="text-[10px] text-ivory/40 mt-0.5">
          {slot.duration_minutes} min{slot.lesson_type ? ` · ${slot.lesson_type}` : ''}
        </p>
      )}
      {slot.notes && (
        <p className="text-[10px] text-ivory/40 mt-1 italic line-clamp-1">{slot.notes}</p>
      )}
    </button>
  );
}