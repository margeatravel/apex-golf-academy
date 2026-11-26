import { useState } from 'react';
import { findSlotConflicts, findWeeklySlotConflicts } from '@/lib/lessonSlotConflicts';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { getDemoFixedScheduleSlots, addDemoOpenSpots } from '@/data/demoData';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { FixedScheduleCalendar, FixedSlot, fmtSlotTime } from '@/components/FixedScheduleCalendar';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Trash2, UserMinus, CalendarCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { HourPicker } from '@/components/HourPicker';
import { PrioritySpotRequestsPanel } from '@/components/priority/PrioritySpotRequestsPanel';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminFixedSchedule() {
  const { user, effectiveCoachId } = useAuth();
  const previewedCoachId = effectiveCoachId ?? user?.id ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState<number>(1);
  const [addTime, setAddTime] = useState('09:00');
  const [addDuration, setAddDuration] = useState('60');
  const [addLessonType, setAddLessonType] = useState('Range');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [actionSlot, setActionSlot] = useState<FixedSlot | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FixedSlot | null>(null);
  const [pendingRelease, setPendingRelease] = useState<FixedSlot | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['admin-fixed-schedule-slots', previewedCoachId, isDemoModeActive() ? 'demo' : 'live'],
    enabled: isDemoModeActive() || !!previewedCoachId,
    queryFn: async () => {
      if (isDemoModeActive()) {
        return getDemoFixedScheduleSlots() as FixedSlot[];
      }
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .select('id, day_of_week, start_time, duration_minutes, lesson_type, student_id, is_available, notes')
        .eq('coach_id', previewedCoachId ?? '')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;

      const studentIds = Array.from(
        new Set((data ?? []).map((s: any) => s.student_id).filter(Boolean))
      );
      let profilesMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);
        profilesMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      }
      return (data ?? []).map((s: any) => ({
        ...s,
        profile: s.student_id ? profilesMap.get(s.student_id) ?? null : null,
      })) as FixedSlot[];
    },
  });

  const openAddFor = (day: number) => {
    setAddDay(day);
    setAddTime('09:00');
    setAddDuration('60');
    setAddLessonType('Range');
    setAddNotes('');
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      if (isDemoModeActive()) {
        addDemoOpenSpots([{
          day_of_week: addDay,
          start_time: addTime,
          duration_minutes: parseInt(addDuration, 10),
          lesson_type: addLessonType,
          notes: addNotes.trim() || null,
        }]);
        toast({ title: 'Spot added', description: `${WEEKDAYS_FULL[addDay]} at ${fmtSlotTime(addTime + ':00')}` });
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
        queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
        setSaving(false);
        return;
      }
      const clashes = await findWeeklySlotConflicts({
        weekday: addDay,
        time: addTime.slice(0, 5),
        durationMinutes: parseInt(addDuration, 10),
        lessonType: addLessonType,
        coachId: user.id,
      });
      if (clashes.length > 0) throw new Error(`Choca con ${clashes.join(', ')}. No se guardó.`);
      const { error } = await supabase.from('fixed_schedule_slots').insert({
        day_of_week: addDay,
        start_time: addTime.length === 5 ? `${addTime}:00` : addTime,
        duration_minutes: parseInt(addDuration, 10),
        lesson_type: addLessonType,
        notes: addNotes.trim() || null,
        created_by: user.id,
        coach_id: user.id,
        is_available: true,
      });
      if (error) throw error;
      toast({ title: 'Spot added', description: `${WEEKDAYS_FULL[addDay]} at ${fmtSlotTime(addTime + ':00')}` });
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to add spot', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('fixed_schedule_slots')
        .delete()
        .eq('id', pendingDelete.id)
        .eq('coach_id', user!.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) {
        toast({ title: 'Spot already removed or belongs to another coach', variant: 'destructive' });
        setPendingDelete(null);
        setActionSlot(null);
        queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
        return;
      }
      toast({ title: 'Spot deleted' });
      setPendingDelete(null);
      setActionSlot(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to delete', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async () => {
    if (!pendingRelease) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('fixed_schedule_slots')
        .update({ student_id: null, is_available: true, claimed_at: null })
        .eq('id', pendingRelease.id)
        .eq('coach_id', user!.id);
      if (error) throw error;
      toast({ title: 'Spot released', description: 'It is now available for any student to claim.' });
      setPendingRelease(null);
      setActionSlot(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-schedule-slots'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-week'] });
      queryClient.invalidateQueries({ queryKey: ['master-calendar-month'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to release', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const totalSlots = slots.length;
  const claimedSlots = slots.filter((s) => s.student_id).length;

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.prioritySpotTitle" subtitleKey="admin.prioritySpotSub" backTo="/admin" />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <PrioritySpotRequestsPanel coachId={isDemoModeActive() ? null : previewedCoachId} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="glass-card px-4 py-3 flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 text-green-accent" />
              <div>
                <p className="text-[10px] text-ivory/50 uppercase tracking-wider">Total spots</p>
                <p className="text-ivory font-heading font-semibold text-lg leading-none">{totalSlots}</p>
              </div>
            </div>
            <div className="glass-card px-4 py-3 flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 text-gold-accent" />
              <div>
                <p className="text-[10px] text-ivory/50 uppercase tracking-wider">Claimed</p>
                <p className="text-ivory font-heading font-semibold text-lg leading-none">{claimedSlots} / {totalSlots}</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => openAddFor(1)}
            className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 gap-2"
          >
            <Plus className="h-4 w-4" />
            Add spot
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-ivory/60" />
          </div>
        ) : (
          <FixedScheduleCalendar
            slots={slots}
            variant="coach"
            onSlotClick={(s) => setActionSlot(s)}
            onEmptyCellClick={(day) => openAddFor(day)}
          />
        )}
      </main>

      <SocialFooter />

      {/* Add slot dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add priority spot</DialogTitle>
            <DialogDescription>
              Publish an open weekly time spot. Students with a Scratch or Pro membership can claim it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Day of week</Label>
              <Select value={String(addDay)} onValueChange={(v) => setAddDay(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS_FULL.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Start time</Label>
                <HourPicker value={addTime} onChange={setAddTime} className="w-full" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Duration (min)</Label>
                <Select value={addDuration} onValueChange={setAddDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="45">45</SelectItem>
                    <SelectItem value="60">60</SelectItem>
                    <SelectItem value="90">90</SelectItem>
                    <SelectItem value="120">120</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Lesson type</Label>
              <Select value={addLessonType} onValueChange={setAddLessonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Range">Range</SelectItem>
                  <SelectItem value="Campo">Campo</SelectItem>
                  <SelectItem value="Playing Lesson">Playing Lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="e.g. Range only, Morning spot"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add spot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot action dialog */}
      <Dialog open={!!actionSlot} onOpenChange={(o) => !o && setActionSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionSlot && `${WEEKDAYS_FULL[actionSlot.day_of_week]} at ${fmtSlotTime(actionSlot.start_time)}`}
            </DialogTitle>
            <DialogDescription>
              {actionSlot?.student_id
                ? `Claimed by ${actionSlot.profile?.full_name || actionSlot.profile?.email || 'a student'}.`
                : 'This spot is open and available for students to claim.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {actionSlot?.notes && (
              <p className="text-sm text-ivory/70 italic">{actionSlot.notes}</p>
            )}
            <p className="text-xs text-ivory/50">{actionSlot?.duration_minutes} minute spot</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            {actionSlot?.student_id && (
              <Button
                variant="outline"
                onClick={() => setPendingRelease(actionSlot)}
                className="gap-2"
              >
                <UserMinus className="h-4 w-4" />
                Release student
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => setPendingDelete(actionSlot)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete spot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this spot?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.student_id
                ? 'A student has claimed this spot. Deleting it will remove their priority spot.'
                : 'This will remove the spot from the calendar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy} className="bg-red-600 hover:bg-red-700">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRelease} onOpenChange={(o) => !o && setPendingRelease(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release this spot?</AlertDialogTitle>
            <AlertDialogDescription>
              The spot will become available again and any student with a Scratch or Pro plan can claim it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRelease} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}