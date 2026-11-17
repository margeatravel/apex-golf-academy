import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Repeat, Trash2, Loader2, CalendarOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddRecurringSlotModal } from './AddRecurringSlotModal';
import { SkipWeekModal } from './SkipWeekModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { CadenceBadge } from '@/components/recurring/CadenceBadge';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string) {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

interface Props {
  studentId: string;
  packages?: Array<{ id: string; package_name?: string | null; package_size: number; classes_remaining: number; is_active: boolean }>;
}

export function RecurringScheduleCard({ studentId, packages = [] }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [skipSlot, setSkipSlot] = useState<any | null>(null);

  const { data: slots = [], refetch } = useQuery({
    queryKey: ['recurring-slots', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_lesson_slots')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_active', true)
        .order('weekday', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
  });



  const confirmDelete = async (alsoDeleteFuture: boolean) => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      if (alsoDeleteFuture) {
        const todayStr = new Date().toISOString().substring(0, 10);
        await supabase
          .from('lessons')
          .delete()
          .eq('recurring_slot_id', pendingDeleteId)
          .eq('auto_generated', true)
          .eq('status', 'scheduled')
          .gte('lesson_date', todayStr);
      }
      const { error } = await supabase
        .from('recurring_lesson_slots')
        .delete()
        .eq('id', pendingDeleteId);
      if (error) throw error;

      toast({ title: 'Spot removed' });
      setPendingDeleteId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to remove', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4 text-[#4a7c59]" />
            Recurring Schedule
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-8 text-xs bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add spot
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No priority weekly spots yet. Add one and the system will auto-create lessons based on remaining package balance.
            </p>
          ) : (
            <ul className="space-y-2">
              {slots.map((s: any) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-medium">{WEEKDAYS[s.weekday]} {fmtTime(s.start_time)}</span>
                    <CadenceBadge weeks={s.interval_weeks} className="ml-1" />
                    <span className="text-muted-foreground"> · {s.lesson_type} · {s.duration_minutes} min</span>
                    {s.package_id && (
                      <span className="text-xs text-[#4a7c59] ml-2">· auto-deducts package</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs border-[#F0C040]/40 text-[#F0C040] hover:bg-[#F0C040]/10"
                      onClick={() => setSkipSlot(s)}
                      title="Skip a specific week"
                    >
                      <CalendarOff className="h-3 w-3 mr-1" /> Skip Week
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => setPendingDeleteId(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddRecurringSlotModal
        open={addOpen}
        onOpenChange={setAddOpen}
        studentId={studentId}
        packages={packages}
        onSlotAdded={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
        }}
      />

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove recurring spot?</AlertDialogTitle>
            <AlertDialogDescription>
              You can also delete future auto-generated lessons from this spot. Past and edited lessons will always stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 flex-wrap">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmDelete(false)} disabled={deleting}>
              Keep future lessons
            </Button>
            <AlertDialogAction
              onClick={() => confirmDelete(true)}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete spot + future lessons
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SkipWeekModal
        open={!!skipSlot}
        onOpenChange={(o) => !o && setSkipSlot(null)}
        slot={skipSlot}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['student-lessons', studentId] });
        }}
      />
    </>
  );
}
