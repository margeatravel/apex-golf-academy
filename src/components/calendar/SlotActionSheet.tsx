import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CalendarOff,
  CalendarPlus,
  UserPlus,
  Pencil,
  Trash2,
  Ban,
  Users,
  ExternalLink,
} from 'lucide-react';
import { SlotItem, SLOT_STYLE, fmtTime12h, WEEKDAYS_FULL } from './calendarTypes';

interface BaseProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Existing slot tapped, OR null when an empty cell was tapped. */
  slot: SlotItem | null;
  /** Date+time of the empty cell tap (used when slot is null). */
  emptyCell?: { date: string; suggestedTime?: string } | null;

  // Action handlers — provided by the parent so it can route to the right modal.
  onSkipWeek?: (slot: SlotItem) => void;
  onEditLesson?: (slot: SlotItem) => void;
  onEditRecurring?: (slot: SlotItem) => void;
  onEditOpenSpot?: (slot: SlotItem) => void;
  onAddOpenSpot?: (date: string) => void;
  onAddBlock?: (date: string) => void;
  onAssignToStudent?: (slot: SlotItem) => void;
  onConvertOpenToOneTime?: (slot: SlotItem) => void;
  onDeleteRecurring?: (slot: SlotItem) => void;
  onDeleteOpenSpot?: (slot: SlotItem) => void;
  onDeleteLesson?: (slot: SlotItem) => void;
}

function fmtNiceDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return `${WEEKDAYS_FULL[dt.getDay()]}, ${dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })}`;
}

/**
 * Universal per-slot action sheet for the Master Calendar.
 *
 * The visible actions adapt to the slot kind so the coach always sees the
 * right verbs for what they tapped (recurring, one-off, open, blocked,
 * skipped) — and on an empty cell, the "Add open spot / Block this time"
 * fast-path.
 */
export function SlotActionSheet(props: BaseProps) {
  const {
    open,
    onOpenChange,
    slot,
    emptyCell,
    onSkipWeek,
    onEditLesson,
    onEditRecurring,
    onEditOpenSpot,
    onAddOpenSpot,
    onAddBlock,
    onAssignToStudent,
    onConvertOpenToOneTime,
    onDeleteRecurring,
    onDeleteOpenSpot,
    onDeleteLesson,
  } = props;
  const navigate = useNavigate();

  const close = () => onOpenChange(false);
  const wrap = (fn?: () => void) => () => {
    fn?.();
    close();
  };

  // Empty-cell mode
  if (!slot && emptyCell) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#F5F0E8] text-base">
              {fmtNiceDate(emptyCell.date)}
            </DialogTitle>
            <DialogDescription className="text-[#F5F0E8]/65 text-xs">
              No slot here yet — what would you like to add?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 mt-2">
            <Button
              onClick={wrap(() => onAddOpenSpot?.(emptyCell.date))}
              className="justify-start gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              <CalendarPlus className="h-4 w-4" /> Add open spot (one-off or weekly)
            </Button>
            <Button
              onClick={wrap(() => navigate('/admin/students'))}
              variant="outline"
              className="justify-start gap-2"
            >
              <UserPlus className="h-4 w-4" /> Add fixed schedule for a student
            </Button>
            <Button
              onClick={wrap(() => onAddBlock?.(emptyCell.date))}
              variant="outline"
              className="justify-start gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
            >
              <Ban className="h-4 w-4" /> Block this time
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!slot) return null;

  const style = SLOT_STYLE[slot.kind];
  const headline =
    slot.kind === 'open'
      ? 'Open spot'
      : slot.kind === 'blocked'
      ? slot.notes || 'Blocked time'
      : slot.student_name || 'Unassigned';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block rounded"
              style={{ width: 12, height: 12, background: style.bg, border: style.border }}
            />
            <DialogTitle className="text-[#F5F0E8] text-base flex-1 truncate">
              {headline}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[#F5F0E8]/65 text-xs">
            {fmtNiceDate(slot.date)} · {fmtTime12h(slot.start_time)} · {slot.duration_minutes}m
            {slot.lesson_type ? ` · ${slot.lesson_type}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 mt-2">
          {/* FIXED (recurring) — assigned to a student */}
          {slot.kind === 'fixed' && (
            <>
              <Button
                onClick={wrap(() => onEditLesson?.(slot))}
                variant="outline"
                className="justify-start gap-2"
              >
                <Pencil className="h-4 w-4" /> Edit this lesson
              </Button>
              <Button
                onClick={wrap(() => onSkipWeek?.(slot))}
                className="justify-start gap-2 bg-[#F0C040] hover:bg-[#F0C040]/90 text-[#0d1f18] font-semibold"
              >
                <CalendarOff className="h-4 w-4" /> Skip this week
              </Button>
              {slot.student_id && (
                <Button
                  onClick={wrap(() => navigate(`/admin/student/${slot.student_id}`))}
                  variant="outline"
                  className="justify-start gap-2"
                >
                  <ExternalLink className="h-4 w-4" /> Open student profile
                </Button>
              )}
              <Button
                onClick={wrap(() => onDeleteRecurring?.(slot))}
                variant="outline"
                className="justify-start gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" /> Remove recurring slot (all weeks)
              </Button>
              {onDeleteLesson && (
                <Button
                  onClick={wrap(() => onDeleteLesson(slot))}
                  variant="outline"
                  className="justify-start gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete this lesson only
                </Button>
              )}
            </>
          )}

          {/* SKIPPED — restore + open as one-time */}
          {slot.kind === 'skipped' && (
            <>
              <Button
                onClick={wrap(() => onSkipWeek?.(slot))}
                variant="outline"
                className="justify-start gap-2"
              >
                <CalendarOff className="h-4 w-4" /> Restore this week
              </Button>
              <p className="text-[11px] text-[#F5F0E8]/60 px-1 leading-snug">
                {slot.raw?.lesson?.skip_keep_closed
                  ? 'This week is closed — no other student can book it.'
                  : 'This week is open in the booking calendar — any other student can grab it as a one-off.'}
              </p>
            </>
          )}

          {/* ONE-TIME lesson */}
          {slot.kind === 'one_time' && (
            <>
              <Button
                onClick={wrap(() => onEditLesson?.(slot))}
                variant="outline"
                className="justify-start gap-2"
              >
                <Pencil className="h-4 w-4" /> Edit lesson
              </Button>
              {slot.student_id && (
                <Button
                  onClick={wrap(() => navigate(`/admin/student/${slot.student_id}`))}
                  variant="outline"
                  className="justify-start gap-2"
                >
                  <ExternalLink className="h-4 w-4" /> Open student profile
                </Button>
              )}
              {slot.lesson_id && onDeleteLesson && (
                <Button
                  onClick={wrap(() => onDeleteLesson(slot))}
                  variant="outline"
                  className="justify-start gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete lesson
                </Button>
              )}
            </>
          )}

          {/* OPEN SPOT */}
          {slot.kind === 'open' && (
            <>
              <Button
                onClick={wrap(() => onEditOpenSpot?.(slot))}
                variant="outline"
                className="justify-start gap-2"
              >
                <Pencil className="h-4 w-4" /> Edit open spot
              </Button>
              <Button
                onClick={wrap(() => onAssignToStudent?.(slot))}
                className="justify-start gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
              >
                <Users className="h-4 w-4" /> Assign to a student (fixed schedule)
              </Button>
              <Button
                onClick={wrap(() => onConvertOpenToOneTime?.(slot))}
                variant="outline"
                className="justify-start gap-2"
              >
                <CalendarPlus className="h-4 w-4" /> Book a one-time lesson here
              </Button>
              <Button
                onClick={wrap(() => onDeleteOpenSpot?.(slot))}
                variant="outline"
                className="justify-start gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" /> Remove open spot
              </Button>
            </>
          )}

          {/* BLOCKED */}
          {slot.kind === 'blocked' && (
            <Button
              onClick={wrap(() => navigate('/admin/availability'))}
              variant="outline"
              className="justify-start gap-2"
            >
              <ExternalLink className="h-4 w-4" /> Manage on Availability page
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}