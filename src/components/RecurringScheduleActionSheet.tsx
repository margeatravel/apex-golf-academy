import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Pencil,
  UserPlus,
  UserCog,
  ExternalLink,
  CalendarPlus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cancelPendingMove, getPendingMove, pendingMoveLabel } from '@/lib/pendingRecurringMove';

const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function fmtTime12h(t: string) {
  if (!t) return '';
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

export interface RecurringSheetSlot {
  id: string;
  // shared fields used for header rendering
  start_time: string;
  duration_minutes: number;
  lesson_type?: string | null;
  // recurring slots
  weekday?: number;
  student_id?: string | null;
  profile?: { full_name?: string | null; email?: string | null } | null;
  // open spots
  day_of_week?: number;
  // scheduled day/time change
  pending_weekday?: number | null;
  pending_start_time?: string | null;
  pending_effective_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 'open' = unclaimed fixed_schedule_slots row · 'claimed' = recurring_lesson_slots row */
  mode: 'open' | 'claimed' | null;
  slot: RecurringSheetSlot | null;

  // Open-spot actions
  onEditOpenSpot?: (slot: RecurringSheetSlot) => void;
  onAssignToStudent?: (slot: RecurringSheetSlot) => void;
  onRemoveOpenSpot?: (slot: RecurringSheetSlot) => void;

  // Claimed-slot actions
  onEditRecurring?: (slot: RecurringSheetSlot) => void;
  onChangeStudent?: (slot: RecurringSheetSlot) => void;
  onRemoveRecurring?: (slot: RecurringSheetSlot) => void;
  /** Fired after a successful inline "Release as open spot". Parent should refetch. */
  onReleased?: () => void;
}

/**
 * Quick-action sheet for the Recurring Schedules view. Mirrors the visual
 * pattern of calendar/SlotActionSheet so a tap on any tile opens this first;
 * the existing edit modals (EditOpenSpotModal / EditRecurringSlotModal) only
 * open when the coach picks "Edit" from this sheet.
 *
 * The "Release as open spot" flow runs inline here using the same logic as
 * EditRecurringSlotModal.handleConvertToOpen so coaches don't need to hop
 * through the edit modal just to release a slot.
 */
export function RecurringScheduleActionSheet({
  open,
  onOpenChange,
  mode,
  slot,
  onEditOpenSpot,
  onAssignToStudent,
  onRemoveOpenSpot,
  onEditRecurring,
  onChangeStudent,
  onRemoveRecurring,
  onReleased,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [cancellingPending, setCancellingPending] = useState(false);

  if (!slot || !mode) return null;

  const weekday = mode === 'open' ? slot.day_of_week ?? 0 : slot.weekday ?? 0;
  const studentName =
    slot.profile?.full_name || slot.profile?.email || 'Unassigned';
  const pendingMove = mode === 'claimed' ? getPendingMove(slot) : null;

  const headerTitle =
    mode === 'open' ? 'Open spot' : studentName;
  const headerSub = `${WEEKDAYS_FULL[weekday]} · ${fmtTime12h(slot.start_time)} · ${slot.duration_minutes} min${
    slot.lesson_type ? ` · ${slot.lesson_type}` : ''
  }${pendingMove ? ` · ${pendingMoveLabel(pendingMove)}` : ''}`;

  const close = () => onOpenChange(false);

  const handleReleaseConfirmed = async () => {
    if (!slot || mode !== 'claimed') return;
    if (!user?.id) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    setReleasing(true);
    try {
      const newTime =
        slot.start_time.length === 5 ? `${slot.start_time}:00` : slot.start_time;

      // 1) Post a new OPEN spot in fixed_schedule_slots.
      const { error: insertErr } = await supabase
        .from('fixed_schedule_slots')
        .insert({
          day_of_week: weekday,
          start_time: newTime,
          duration_minutes: slot.duration_minutes,
          lesson_type: slot.lesson_type ?? '1on1',
          is_available: true,
          student_id: null,
          created_by: user.id,
          coach_id: user.id,
          notes: 'Released from recurring schedule',
        });
      if (insertErr) throw insertErr;

      // 2) Wipe future auto-generated, still-scheduled lessons tied to this slot.
      const todayStr = new Date().toISOString().substring(0, 10);
      await supabase
        .from('lessons')
        .delete()
        .eq('recurring_slot_id', slot.id)
        .eq('auto_generated', true)
        .eq('status', 'scheduled')
        .gte('lesson_date', todayStr);

      // 3) Remove the recurring slot itself.
      const { error: delErr } = await supabase
        .from('recurring_lesson_slots')
        .delete()
        .eq('id', slot.id);
      if (delErr) throw delErr;

      toast({
        title: 'Slot released and posted as open',
        description: 'Students can now claim it from the open spots list.',
      });
      setConfirmReleaseOpen(false);
      onReleased?.();
      close();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to release spot',
        variant: 'destructive',
      });
    } finally {
      setReleasing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{headerTitle}</DialogTitle>
            <DialogDescription className="text-xs">{headerSub}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 mt-2">
            {mode === 'open' && (
              <>
                <Button
                  variant="outline"
                  className="justify-start h-10"
                  onClick={() => {
                    close();
                    onEditOpenSpot?.(slot);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit open spot
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-10 border-[#4a7c59]/40 text-[#4a7c59] hover:bg-[#4a7c59]/10"
                  onClick={() => {
                    close();
                    onAssignToStudent?.(slot);
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign to a student
                </Button>
              </>
            )}

            {mode === 'claimed' && (
              <>
                <Button
                  variant="outline"
                  className="justify-start h-10"
                  onClick={() => {
                    close();
                    onEditRecurring?.(slot);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit recurring slot
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-10"
                  onClick={() => {
                    close();
                    onChangeStudent?.(slot);
                  }}
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  Change student
                </Button>
                {slot.student_id && (
                  <Button
                    variant="outline"
                    className="justify-start h-10"
                    onClick={() => {
                      close();
                      navigate(`/admin/student/${slot.student_id}`);
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open student profile
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="justify-start h-10 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  onClick={() => setConfirmReleaseOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Release as open spot
                </Button>
                {pendingMove && (
                  <Button
                    variant="outline"
                    className="justify-start h-10 border-[#F0C040]/40 text-[#F0C040] hover:bg-[#F0C040]/10"
                    disabled={cancellingPending}
                    onClick={async () => {
                      setCancellingPending(true);
                      try {
                        await cancelPendingMove(slot.id);
                        if (slot.student_id) {
                          await supabase.functions.invoke('generate-recurring-lessons', {
                            body: { student_id: slot.student_id },
                          });
                        }
                        toast({ title: 'Scheduled change cancelled' });
                        onReleased?.();
                        close();
                      } catch (e: any) {
                        toast({ title: 'Error', description: e?.message, variant: 'destructive' });
                      } finally {
                        setCancellingPending(false);
                      }
                    }}
                  >
                    {cancellingPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-4 w-4 mr-2" />
                    )}
                    Cancel scheduled change
                  </Button>
                )}
              </>
            )}

            <div className="border-t border-white/10 my-1" />

            <Button
              variant="outline"
              className="justify-start h-10 border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                close();
                if (mode === 'open') onRemoveOpenSpot?.(slot);
                else onRemoveRecurring?.(slot);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {mode === 'open' ? 'Remove open spot' : 'Remove recurring slot (all weeks)'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release this slot as an open spot?</AlertDialogTitle>
            <AlertDialogDescription>
              The recurring slot for <strong>{studentName}</strong> on{' '}
              <strong>
                {WEEKDAYS_FULL[weekday]} at {fmtTime12h(slot.start_time)}
              </strong>{' '}
              will be converted into an open spot any eligible student can claim.
              Future auto-generated lessons for this slot will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReleaseConfirmed();
              }}
              disabled={releasing}
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold"
            >
              {releasing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Yes, release it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}