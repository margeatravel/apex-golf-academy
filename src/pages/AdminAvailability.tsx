import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Loader2, Trash2, Calendar as CalIcon, Settings as SettingsIcon, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getAffectedStudentsOnDate,
  formatSpanishDate,
  formatTime12,
  type AffectedStudent,
} from '@/lib/affectedStudentsOnDate';


const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function timeToMinutesLocal(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function AdminAvailability() {
  const qc = useQueryClient();
  const { user, effectiveCoachId } = useAuth();
  const coachId = effectiveCoachId ?? user?.id ?? null;

  // Add weekly rule modal
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [ruleWeekday, setRuleWeekday] = useState<number>(1);
  const [ruleStart, setRuleStart] = useState('08:00');
  const [ruleEnd, setRuleEnd] = useState('18:00');
  const [ruleNotes, setRuleNotes] = useState('');
  const [pendingDeleteRule, setPendingDeleteRule] = useState<any>(null);

  // Add date block modal
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [blockDate, setBlockDate] = useState('');
  const [blockDates, setBlockDates] = useState<string[]>([]);
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState('09:00');
  const [blockEnd, setBlockEnd] = useState('12:00');
  const [blockReason, setBlockReason] = useState('');
  const [pendingDeleteBlock, setPendingDeleteBlock] = useState<any>(null);

  // Affected-students confirmation (all-day blocks)
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [affectedStudents, setAffectedStudents] = useState<(AffectedStudent & { date: string })[]>([]);
  const [notifyStudents, setNotifyStudents] = useState(true);


  const [busy, setBusy] = useState(false);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['coach-availability-rules', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_availability_rules')
        .select('*')
        .eq('coach_id', coachId!)
        .order('weekday')
        .order('start_time');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['coach-availability-blocks', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('coach_availability_blocks')
        .select('*')
        .eq('coach_id', coachId!)
        .gte('block_date', today)
        .order('block_date');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Active recurring commitments (Priority Spots + coach-assigned recurring)
  const { data: recurringSlots = [], isLoading: recurringLoading } = useQuery({
    queryKey: ['coach-recurring-commitments', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_lesson_slots')
        .select('id, weekday, start_time, duration_minutes, lesson_type, student_id, notes')
        .eq('coach_id', coachId!)
        .eq('is_active', true)
        .order('weekday')
        .order('start_time');
      if (error) throw error;
      const rows = data ?? [];
      const studentIds = Array.from(new Set(rows.map((r: any) => r.student_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);
        for (const p of profs ?? []) {
          nameMap.set((p as any).id, (p as any).full_name || (p as any).email || 'Student');
        }
      }
      return rows.map((r: any) => ({
        ...r,
        student_name: nameMap.get(r.student_id) ?? 'Student',
      }));
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['booking-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Local settings form state
  const [duration, setDuration] = useState<number | null>(null);
  const [buffer, setBuffer] = useState<number | null>(null);
  const [increment, setIncrement] = useState<number | null>(null);
  const [minNotice, setMinNotice] = useState<number | null>(null);
  const [maxAdvance, setMaxAdvance] = useState<number | null>(null);
  const [allowUnpaid, setAllowUnpaid] = useState<boolean | null>(null);

  const effDuration = duration ?? settings?.default_lesson_duration_minutes ?? 60;
  const effBuffer = buffer ?? settings?.buffer_minutes ?? 0;
  const effIncrement = increment ?? settings?.slot_increment_minutes ?? 30;
  const effMinNotice = minNotice ?? settings?.min_notice_hours ?? 12;
  const effMaxAdvance = maxAdvance ?? settings?.max_advance_days ?? 60;
  const effAllowUnpaid = allowUnpaid ?? settings?.allow_unpaid_booking ?? false;

  async function saveSettings() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('booking_settings')
        .upsert({
          id: 'default',
          default_lesson_duration_minutes: effDuration,
          buffer_minutes: effBuffer,
          slot_increment_minutes: effIncrement,
          min_notice_hours: effMinNotice,
          max_advance_days: effMaxAdvance,
          allow_unpaid_booking: effAllowUnpaid,
        });
      if (error) throw error;
      toast.success('Booking settings saved');
      qc.invalidateQueries({ queryKey: ['booking-settings'] });
      setDuration(null); setBuffer(null); setIncrement(null);
      setMinNotice(null); setMaxAdvance(null); setAllowUnpaid(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    if (ruleEnd <= ruleStart) {
      toast.error('End time must be after start time');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('coach_availability_rules')
        .insert({
          coach_id: coachId!,
          weekday: ruleWeekday,
          start_time: ruleStart,
          end_time: ruleEnd,
          notes: ruleNotes || null,
          is_active: true,
        });
      if (error) throw error;
      toast.success('Availability added');
      setAddRuleOpen(false);
      setRuleNotes('');
      qc.invalidateQueries({ queryKey: ['coach-availability-rules'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: any) {
    const { error } = await supabase
      .from('coach_availability_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ['coach-availability-rules'] });
  }

  async function deleteRule() {
    if (!pendingDeleteRule) return;
    const { error } = await supabase
      .from('coach_availability_rules')
      .delete()
      .eq('id', pendingDeleteRule.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Availability removed');
      qc.invalidateQueries({ queryKey: ['coach-availability-rules'] });
    }
    setPendingDeleteRule(null);
  }

  const selectedDates = (): string[] => {
    const all = [...blockDates];
    if (blockDate && !all.includes(blockDate)) all.push(blockDate);
    return all.sort();
  };

  function addDateToList() {
    if (!blockDate) return;
    setBlockDates((prev) => (prev.includes(blockDate) ? prev : [...prev, blockDate].sort()));
    setBlockDate('');
  }

  // Step 1: for all-day blocks, look up affected students and confirm first.
  async function addBlock() {
    const dates = selectedDates();
    if (dates.length === 0) {
      toast.error('Pick a date');
      return;
    }
    if (!blockAllDay && blockEnd <= blockStart) {
      toast.error('End time must be after start time');
      return;
    }
    if (!blockAllDay || !coachId) {
      await performBlock(false);
      return;
    }
    setBusy(true);
    try {
      const lists = await Promise.all(
        dates.map(async (d) =>
          (await getAffectedStudentsOnDate(coachId, d)).map((s) => ({ ...s, date: d })),
        ),
      );
      const affected = lists.flat();
      setAffectedStudents(affected);
      setNotifyStudents(affected.length > 0);
      setConfirmBlockOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not load affected students');
    } finally {
      setBusy(false);
    }
  }

  // Step 2: save the blocks (always) and optionally email affected students.
  async function performBlock(notify: boolean) {
    const dates = selectedDates();
    const reason = blockReason.trim();
    setBusy(true);
    try {
      const { error } = await supabase
        .from('coach_availability_blocks')
        .insert(
          dates.map((d) => ({
            coach_id: coachId!,
            block_date: d,
            start_time: blockAllDay ? null : blockStart,
            end_time: blockAllDay ? null : blockEnd,
            reason: reason || null,
          })),
        );
      if (error) throw error;
      toast.success(dates.length > 1 ? `${dates.length} dates blocked` : 'Date blocked');
      setConfirmBlockOpen(false);
      setAddBlockOpen(false);
      setBlockReason('');
      setBlockDates([]);
      setBlockDate('');
      qc.invalidateQueries({ queryKey: ['coach-availability-blocks'] });

      // Auto-cancel lessons on each blocked date and restore package credits
      let cancelled = 0;
      let restored = 0;
      for (const d of dates) {
        try {
          const { data: cancelData } = await supabase.functions.invoke('cancel-blocked-lessons', {
            body: {
              block_date: d,
              start_time: blockAllDay ? undefined : blockStart,
              end_time: blockAllDay ? undefined : blockEnd,
              reason: reason || undefined,
            },
          });
          cancelled += cancelData?.cancelled ?? 0;
          restored += cancelData?.restored ?? 0;
        } catch (_) {
          // Non-critical
        }
      }
      if (cancelled > 0) {
        toast.info(
          `${cancelled} lesson${cancelled > 1 ? 's' : ''} cancelled` +
          (restored > 0 ? ` · ${restored} package credit${restored > 1 ? 's' : ''} restored` : ''),
        );
        qc.invalidateQueries({ queryKey: ['master-calendar-week'] });
        qc.invalidateQueries({ queryKey: ['master-calendar-month'] });
      }

      // Notify affected students — failures never revert the block.
      const recipients = affectedStudents;
      if (notify && recipients.length > 0) {
        try {
          const { error: mailErr } = await supabase.functions.invoke('notify-blocked-date', {
            body: {
              blockDate: recipients[0].date,
              note: reason || undefined,
              recipients: recipients.map((s) => ({ student_id: s.student_id, email: s.email, name: s.name, time: s.time, date: s.date })),
            },
          });
          if (mailErr) throw mailErr;
          toast.success(`Aviso enviado a ${recipients.length} alumno${recipients.length > 1 ? 's' : ''}`);
        } catch (mailErr: any) {
          toast.error(mailErr?.message ?? 'No se pudieron enviar los avisos por email');
        }
      }
      setAffectedStudents([]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }


  async function deleteBlock() {
    if (!pendingDeleteBlock) return;
    const { error } = await supabase
      .from('coach_availability_blocks')
      .delete()
      .eq('id', pendingDeleteBlock.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Block removed');
      qc.invalidateQueries({ queryKey: ['coach-availability-blocks'] });
    }
    setPendingDeleteBlock(null);
  }

  // Group rules by weekday
  const rulesByDay = new Map<number, any[]>();
  for (let i = 0; i < 7; i++) rulesByDay.set(i, []);
  for (const r of rules) rulesByDay.get(r.weekday)?.push(r);

  // Group recurring commitments by weekday
  const recurringByDay = new Map<number, any[]>();
  for (let i = 0; i < 7; i++) recurringByDay.set(i, []);
  for (const r of recurringSlots) recurringByDay.get(r.weekday)?.push(r);

  function endTimeFor(start: string, dur: number): string {
    const m = timeToMinutesLocal(start) + (dur || 60);
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${h}:${mm}`;
  }

  return (
    <div className="min-h-screen pb-24">
      <InternalHeader title="Availability" backTo="/dashboard" />
      <div className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Weekly Hours */}
        <section className="glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-5 w-5 text-gold-accent shrink-0" />
              <h2 className="font-heading text-xl text-ivory">Weekly Hours</h2>
            </div>
            <Button onClick={() => setAddRuleOpen(true)} className="btn-green">
              <Plus className="h-4 w-4 mr-1" /> Add hours
            </Button>
          </div>
          <p className="text-ivory/60 text-sm mb-4">
            Define which days and time blocks you're available for lessons. Students will only see slots inside these hours.
          </p>
          {rulesLoading ? (
            <div className="flex items-center justify-center py-8 text-ivory/60">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {WEEKDAYS.map((label, idx) => {
                const dayRules = rulesByDay.get(idx) || [];
                return (
                  <div key={idx} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                    <div className="w-20 shrink-0 text-ivory/80 font-medium pt-1">{SHORT_WEEKDAYS[idx]}</div>
                    <div className="flex-1 min-w-0">
                      {dayRules.length === 0 ? (
                        <p className="text-ivory/40 text-sm pt-1">— Unavailable</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {dayRules.map((r: any) => (
                            <div
                              key={r.id}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${
                                r.is_active
                                  ? 'bg-green-accent/15 border-green-accent/30 text-ivory'
                                  : 'bg-white/5 border-white/10 text-ivory/40 line-through'
                              }`}
                            >
                              <span>{fmtTime(r.start_time)} – {fmtTime(r.end_time)}</span>
                              <button
                                onClick={() => toggleRule(r)}
                                className="text-xs text-ivory/60 hover:text-ivory"
                                title={r.is_active ? 'Disable' : 'Enable'}
                              >
                                {r.is_active ? 'Off' : 'On'}
                              </button>
                              <button
                                onClick={() => setPendingDeleteRule(r)}
                                className="text-ivory/60 hover:text-red-400"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>


        {/* Blocked dates */}
        <section className="glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <CalIcon className="h-5 w-5 text-gold-accent shrink-0" />
              <h2 className="font-heading text-xl text-ivory">Blocked Dates</h2>
            </div>
            <Button onClick={() => setAddBlockOpen(true)} className="btn-green">
              <Plus className="h-4 w-4 mr-1" /> Block date
            </Button>
          </div>
          <p className="text-ivory/60 text-sm mb-4">
            One-off vacations, holidays, or partial blocks. These override your weekly hours.
          </p>
          {blocksLoading ? (
            <div className="flex items-center justify-center py-8 text-ivory/60">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : blocks.length === 0 ? (
            <p className="text-ivory/40 text-sm py-2">No upcoming blocks.</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory font-medium">
                      {new Date(b.block_date + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                      })}
                      {b.start_time && b.end_time
                        ? ` · ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`
                        : ' · All day'}
                    </p>
                    {b.reason && <p className="text-ivory/50 text-xs mt-0.5">{b.reason}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDeleteBlock(b)}
                    className="text-ivory/60 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Booking settings */}
        <section className="glass-card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon className="h-5 w-5 text-gold-accent shrink-0" />
            <h2 className="font-heading text-xl text-ivory">Booking Settings</h2>
          </div>
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8 text-ivory/60">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-ivory/80">Default lesson duration (min)</Label>
                <Input
                  type="number" min={15} max={240} step={5}
                  value={effDuration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-ivory/80">Buffer between lessons (min)</Label>
                <Input
                  type="number" min={0} max={120} step={5}
                  value={effBuffer}
                  onChange={(e) => setBuffer(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-ivory/80">Slot increments (min)</Label>
                <Select value={String(effIncrement)} onValueChange={(v) => setIncrement(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Every 15 min</SelectItem>
                    <SelectItem value="30">Every 30 min</SelectItem>
                    <SelectItem value="60">Every hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-ivory/80">Minimum notice (hours)</Label>
                <Input
                  type="number" min={0} max={168}
                  value={effMinNotice}
                  onChange={(e) => setMinNotice(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-ivory/80">Max booking window (days)</Label>
                <Input
                  type="number" min={1} max={365}
                  value={effMaxAdvance}
                  onChange={(e) => setMaxAdvance(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <div>
                  <Label className="text-ivory/80">Allow unpaid bookings</Label>
                  <p className="text-xs text-ivory/50 mt-0.5">Otherwise students need a plan or package</p>
                </div>
                <Switch checked={effAllowUnpaid} onCheckedChange={(v) => setAllowUnpaid(v)} />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={saveSettings} disabled={busy} className="btn-green">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save settings
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <SocialFooter />

      {/* Add rule dialog */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ivory font-heading">Add weekly hours</DialogTitle>
            <DialogDescription className="text-ivory/60">
              Pick a day and the time window you're available.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Day</Label>
              <Select value={String(ruleWeekday)} onValueChange={(v) => setRuleWeekday(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="time" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={ruleNotes} onChange={(e) => setRuleNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddRuleOpen(false)}>Cancel</Button>
            <Button onClick={addRule} disabled={busy} className="btn-green">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add block dialog */}
      <Dialog open={addBlockOpen} onOpenChange={setAddBlockOpen}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ivory font-heading">Block a date</DialogTitle>
            <DialogDescription className="text-ivory/60">
              Mark a date (or part of it) as unavailable for new bookings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Date</Label>
              <div className="flex gap-2 mt-1">
                <DateField value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
                <Button type="button" variant="outline" onClick={addDateToList} disabled={!blockDate}>
                  <Plus className="h-4 w-4 mr-1" /> Add day
                </Button>
              </div>
              {blockDates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {blockDates.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-xs text-ivory">
                      {formatSpanishDate(d)}
                      <button type="button" aria-label="Remove" onClick={() => setBlockDates((p) => p.filter((x) => x !== d))} className="text-ivory/60 hover:text-ivory">×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-ivory/50 text-xs mt-1">Pick a date and tap "Add day" to block several days at once.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-4 py-2">
              <Label>All day</Label>
              <Switch checked={blockAllDay} onCheckedChange={setBlockAllDay} />
            </div>
            {!blockAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From</Label>
                  <Input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
            <div>
              <Label>Note for students (optional)</Label>
              <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="mt-1" rows={2} placeholder="Vacation, tournament, …" />
              <p className="text-ivory/50 text-xs mt-1">Included in the email sent to students with lessons those days.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddBlockOpen(false)}>Cancel</Button>
            <Button onClick={addBlock} disabled={busy} className="btn-green">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Affected students confirm (all-day block) */}
      <Dialog open={confirmBlockOpen} onOpenChange={(o) => { if (!busy) setConfirmBlockOpen(o); }}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ivory font-heading">
              {selectedDates().length > 1
                ? `Bloquear ${selectedDates().length} días`
                : `Bloquear ${selectedDates()[0] ? formatSpanishDate(selectedDates()[0]) : ''}`}
            </DialogTitle>
            <DialogDescription className="text-ivory/60">
              {affectedStudents.length === 0
                ? 'No hay alumnos con clase ese día.'
                : `${affectedStudents.length} alumno${affectedStudents.length > 1 ? 's' : ''} afectado${affectedStudents.length > 1 ? 's' : ''} ese día.`}
            </DialogDescription>
          </DialogHeader>

          {affectedStudents.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto py-1">
              {affectedStudents.map((s) => (
                <div key={`${s.date}-${s.student_id}`} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-ivory text-sm truncate">{s.name}</p>
                    <p className="text-ivory/50 text-xs truncate">{s.email || 'Sin email'}</p>
                    {s.parent_emails?.map((pe) => (
                      <p key={pe} className="text-gold/80 text-xs truncate">Papá/Mamá: {pe}</p>
                    ))}
                  </div>
                  <span className="text-ivory/70 text-xs shrink-0">{formatTime12(s.time)}</span>
                </div>
              ))}
            </div>
          )}

          {affectedStudents.length > 0 && (
            <label className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 cursor-pointer">
              <Checkbox checked={notifyStudents} onCheckedChange={(v) => setNotifyStudents(!!v)} />
              <span className="text-ivory text-sm">Enviar aviso por email</span>
            </label>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBlockOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => performBlock(notifyStudents)} disabled={busy} className="btn-green">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar bloqueo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete rule confirm */}

      <AlertDialog open={!!pendingDeleteRule} onOpenChange={(o) => !o && setPendingDeleteRule(null)}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Remove this time block?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              Students won't be able to book during these hours anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRule} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete block confirm */}
      <AlertDialog open={!!pendingDeleteBlock} onOpenChange={(o) => !o && setPendingDeleteBlock(null)}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Remove this block?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              Booking will reopen during the previously blocked time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteBlock} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}