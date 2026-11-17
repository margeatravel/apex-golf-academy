import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoFreeTrialStudents, demoFreeTrialDefaultDays } from '@/data/demoData';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Clock, Pencil, Check, X, Loader2, Users, History, ChevronDown, ChevronUp,
  RotateCcw, TimerOff, Plus, Search,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ── Types ── */
interface FreeStudent {
  id: string;
  email: string;
  full_name: string | null;
  trial_ends_at: string | null;
}

interface TrialLog {
  id: string;
  student_id: string;
  action: string;
  days_added: number | null;
  old_trial_ends_at: string | null;
  new_trial_ends_at: string | null;
  created_at: string;
}

/* ── Helpers ── */
function trialStatus(t: string | null): { label: string; color: string } {
  if (!t) return { label: 'No trial', color: 'bg-white/10 text-ivory/50' };
  const end = new Date(t);
  if (end > new Date()) return { label: 'Active', color: 'bg-green-500/20 text-green-400' };
  return { label: 'Expired', color: 'bg-red-500/20 text-red-400' };
}

function daysRemaining(t: string | null): number | null {
  if (!t) return null;
  const diff = (new Date(t).getTime() - Date.now()) / 86400000;
  return Math.ceil(diff);
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Section wrapper (matches AdminSettings pattern) ── */
function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5 space-y-4">{children}</div>;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
        <Icon className="h-4 w-4" style={{ color: '#4a7c59' }} />
      </div>
      <div>
        <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function FreeTrialSettingsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? '';

  /* state */
  const [defaultDays, setDefaultDays] = useState(30);
  const [editingDefault, setEditingDefault] = useState(false);
  const [draftDays, setDraftDays] = useState(30);
  const [savingDefault, setSavingDefault] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDays, setBulkDays] = useState(7);
  const [confirmBulk, setConfirmBulk] = useState<'all' | 'selected' | null>(null);
  const [busy, setBusy] = useState(false);

  const [expandStudent, setExpandStudent] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(7);

  const [showHistory, setShowHistory] = useState(false);

  const [search, setSearch] = useState('');

  /* queries */
  const { data: settingsMap } = useQuery({
    queryKey: ['academy-settings', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return { free_trial_defaults: { days: demoFreeTrialDefaultDays } } as Record<string, any>;
      const { data } = await supabase.from('academy_settings').select('*');
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  // sync default days from settings
  const storedDefault = (settingsMap as any)?.free_trial_defaults?.days;
  if (storedDefault && storedDefault !== defaultDays && !editingDefault) {
    setDefaultDays(storedDefault);
    setDraftDays(storedDefault);
  }

  const { data: freeStudents = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['free-trial-students', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoFreeTrialStudents as FreeStudent[];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, trial_ends_at')
        .in('plan_tier', ['free', 'member'])
        .not('email', 'ilike', '%placeholder%')
        .range(0, 9999)
        .order('full_name');
      if (error) throw error;
      return (data || []) as FreeStudent[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['trial-change-log', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return [] as unknown as TrialLog[];
      const { data, error } = await supabase
        .from('trial_change_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as TrialLog[];
    },
  });

  /* helpers */
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filteredStudents.length && filteredStudents.length > 0) setSelected(new Set());
    else setSelected(new Set(filteredStudents.map(s => s.id)));
  };

  const saveDefault = async () => {
    setSavingDefault(true);
    try {
      await supabase
        .from('academy_settings')
        .upsert({ key: 'free_trial_defaults', value: { days: draftDays }, updated_at: new Date().toISOString(), updated_by: userId } as any, { onConflict: 'key' });
      setDefaultDays(draftDays);
      setEditingDefault(false);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Default trial duration updated');
    } catch { toast.error('Failed to save'); }
    finally { setSavingDefault(false); }
  };

  const extendStudents = async (studentIds: string[], days: number, action: string) => {
    setBusy(true);
    try {
      for (const sid of studentIds) {
        const student = freeStudents.find(s => s.id === sid);
        if (!student) continue;
        const oldEnd = student.trial_ends_at;
        const base = oldEnd && new Date(oldEnd) > new Date() ? new Date(oldEnd) : new Date();
        const newEnd = new Date(base.getTime() + days * 86400000);

        const { error } = await supabase
          .from('profiles')
          .update({ trial_ends_at: newEnd.toISOString() })
          .eq('id', sid);
        if (error) throw error;

        await supabase
          .from('trial_change_log' as any)
          .insert({
            student_id: sid,
            changed_by: userId,
            action,
            days_added: days,
            old_trial_ends_at: oldEnd,
            new_trial_ends_at: newEnd.toISOString(),
          } as any);
      }
      toast.success(`Extended ${studentIds.length} student(s) by ${days} days`);
      qc.invalidateQueries({ queryKey: ['free-trial-students'] });
      qc.invalidateQueries({ queryKey: ['trial-change-log'] });
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy(false); setConfirmBulk(null); }
  };

  const endTrial = async (sid: string) => {
    setBusy(true);
    const student = freeStudents.find(s => s.id === sid);
    try {
      await supabase.from('profiles').update({ trial_ends_at: null }).eq('id', sid);
      await supabase.from('trial_change_log' as any).insert({
        student_id: sid, changed_by: userId, action: 'end',
        days_added: 0, old_trial_ends_at: student?.trial_ends_at, new_trial_ends_at: null,
      } as any);
      toast.success('Trial ended');
      qc.invalidateQueries({ queryKey: ['free-trial-students'] });
      qc.invalidateQueries({ queryKey: ['trial-change-log'] });
    } catch { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const resetTrial = async (sid: string) => {
    const student = freeStudents.find(s => s.id === sid);
    const newEnd = new Date(Date.now() + defaultDays * 86400000);
    setBusy(true);
    try {
      await supabase.from('profiles').update({ trial_ends_at: newEnd.toISOString() }).eq('id', sid);
      await supabase.from('trial_change_log' as any).insert({
        student_id: sid, changed_by: userId, action: 'reset',
        days_added: defaultDays, old_trial_ends_at: student?.trial_ends_at, new_trial_ends_at: newEnd.toISOString(),
      } as any);
      toast.success('Trial reset to default');
      qc.invalidateQueries({ queryKey: ['free-trial-students'] });
      qc.invalidateQueries({ queryKey: ['trial-change-log'] });
    } catch { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const bulkTargets = confirmBulk === 'all' ? freeStudents.map(s => s.id) : Array.from(selected);

  /* counts */
  const activeCount = freeStudents.filter(s => s.trial_ends_at && new Date(s.trial_ends_at) > new Date()).length;
  const expiredCount = freeStudents.filter(s => s.trial_ends_at && new Date(s.trial_ends_at) <= new Date()).length;
  const noTrialCount = freeStudents.filter(s => !s.trial_ends_at).length;

  /* student name map for logs */
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    freeStudents.forEach(s => { m[s.id] = s.full_name || s.email; });
    return m;
  }, [freeStudents]);

  /* filter */
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return freeStudents;
    return freeStudents.filter(s =>
      (s.full_name || '').toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  }, [freeStudents, search]);

  return (
    <SettingsCard>
      <SectionHeader icon={Clock} title="Free Trial Settings" subtitle="Manage trial access for free students" />

      {/* ── Default duration ── */}
      <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: '#F5F0E8' }}>Default trial duration</p>
          <p className="text-xs" style={{ color: '#E8D5B0', opacity: 0.5 }}>Applied when resetting a student's trial</p>
        </div>
        {editingDefault ? (
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={365} value={draftDays} onChange={e => setDraftDays(Number(e.target.value))}
              className="w-20 h-8 text-center bg-white/5 border-white/10" />
            <span className="text-xs text-ivory/40">days</span>
            <Button size="sm" variant="ghost" onClick={() => setEditingDefault(false)} className="h-7 w-7 p-0 text-red-400"><X className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={saveDefault} disabled={savingDefault} className="h-7 w-7 p-0 text-green-400">
              {savingDefault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 text-ivory/70">{defaultDays} days</Badge>
            <Button size="sm" variant="ghost" onClick={() => { setDraftDays(defaultDays); setEditingDefault(true); }} className="h-7 w-7 p-0 text-ivory/40 hover:text-ivory">
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Summary badges ── */}
      <div className="flex gap-2 flex-wrap">
        <Badge className="bg-green-500/20 text-green-400 border-0">{activeCount} Active</Badge>
        <Badge className="bg-red-500/20 text-red-400 border-0">{expiredCount} Expired</Badge>
        <Badge className="bg-white/10 text-ivory/50 border-0">{noTrialCount} No Trial</Badge>
      </div>

      {/* ── Bulk actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="number" min={1} max={365} value={bulkDays} onChange={e => setBulkDays(Number(e.target.value))}
          className="w-20 h-8 text-center bg-white/5 border-white/10" />
        <span className="text-xs text-ivory/40">days</span>
        <Button size="sm" variant="outline" disabled={selected.size === 0 || busy}
          onClick={() => setConfirmBulk('selected')}
          className="h-8 text-xs border-white/10 bg-white/5 hover:bg-white/10">
          <Plus className="h-3 w-3 mr-1" /> Extend selected ({selected.size})
        </Button>
        <Button size="sm" variant="outline" disabled={freeStudents.length === 0 || busy}
          onClick={() => setConfirmBulk('all')}
          className="h-8 text-xs border-white/10 bg-white/5 hover:bg-white/10">
          <Users className="h-3 w-3 mr-1" /> Extend all ({freeStudents.length})
        </Button>
      </div>

      {/* ── Student list ── */}
      {loadingStudents ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-ivory/30" /></div>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {/* search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ivory/30" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-white/5 border-white/10 placeholder:text-ivory/30"
            />
          </div>
          {/* header */}
          <div className="flex items-center gap-2 px-2 py-1 text-[11px] uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.4 }}>
            <Checkbox checked={selected.size === filteredStudents.length && filteredStudents.length > 0} onCheckedChange={toggleAll} className="h-3.5 w-3.5" />
            <span className="flex-1">Student</span>
            <span className="w-16 text-center">Status</span>
            <span className="w-24 text-center hidden sm:block">Ends</span>
            <span className="w-14 text-center">Days</span>
            <span className="w-24" />
          </div>
          {filteredStudents.map(s => {
            const st = trialStatus(s.trial_ends_at);
            const rem = daysRemaining(s.trial_ends_at);
            const expanded = expandStudent === s.id;
            return (
              <div key={s.id}>
                <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} className="h-3.5 w-3.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: '#F5F0E8' }}>{s.full_name || s.email}</p>
                    <p className="text-[11px] truncate" style={{ color: '#E8D5B0', opacity: 0.4 }}>{s.email}</p>
                  </div>
                  <Badge className={`${st.color} border-0 text-[10px] w-16 justify-center`}>{st.label}</Badge>
                  <span className="w-24 text-center text-xs hidden sm:block" style={{ color: '#E8D5B0', opacity: 0.6 }}>{fmtDate(s.trial_ends_at)}</span>
                  <span className="w-14 text-center text-xs font-medium" style={{ color: rem !== null && rem > 0 ? '#4ade80' : rem !== null ? '#f87171' : '#888' }}>
                    {rem !== null ? (rem > 0 ? `${rem}d` : `${Math.abs(rem)}d ago`) : '—'}
                  </span>
                  <div className="w-24 flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setExpandStudent(expanded ? null : s.id)} className="h-7 w-7 p-0 text-ivory/30 hover:text-ivory">
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="ml-8 mb-2 p-3 rounded-lg flex flex-wrap items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <Input type="number" min={1} max={365} value={extendDays} onChange={e => setExtendDays(Number(e.target.value))}
                      className="w-16 h-7 text-center text-xs bg-white/5 border-white/10" />
                    <Button size="sm" disabled={busy} onClick={() => extendStudents([s.id], extendDays, 'extend')}
                      className="h-7 text-xs bg-green-600/30 hover:bg-green-600/50 text-green-300 border-0">
                      <Plus className="h-3 w-3 mr-1" /> Extend
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => resetTrial(s.id)}
                      className="h-7 text-xs border-white/10 text-ivory/60 hover:text-ivory">
                      <RotateCcw className="h-3 w-3 mr-1" /> Reset
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => endTrial(s.id)}
                      className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10">
                      <TimerOff className="h-3 w-3 mr-1" /> End trial
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredStudents.length === 0 && (
            <p className="text-center py-6 text-sm text-ivory/30">{search ? 'No students match your search' : 'No free students found'}</p>
          )}
        </div>
      )}

      {/* ── History toggle ── */}
      <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="text-ivory/40 hover:text-ivory text-xs">
        <History className="h-3.5 w-3.5 mr-1" /> {showHistory ? 'Hide' : 'Show'} change history
      </Button>
      {showHistory && logs.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {logs.map((l: TrialLog) => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="text-ivory/30 w-24 shrink-0">{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <Badge variant="outline" className="border-white/10 text-ivory/50 text-[10px]">{l.action}</Badge>
              <span className="text-ivory/60 truncate flex-1">{nameMap[l.student_id] || l.student_id.slice(0, 8)}</span>
              {l.days_added !== null && l.days_added !== 0 && <span className="text-green-400">+{l.days_added}d</span>}
            </div>
          ))}
        </div>
      )}
      {showHistory && logs.length === 0 && <p className="text-xs text-ivory/30 text-center py-3">No changes recorded yet</p>}

      {/* ── Confirmation dialog ── */}
      <AlertDialog open={!!confirmBulk} onOpenChange={() => setConfirmBulk(null)}>
        <AlertDialogContent className="bg-[#1a2e23] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Confirm bulk extension</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              This will extend the free trial by <strong className="text-ivory">{bulkDays} days</strong> for{' '}
              <strong className="text-ivory">{bulkTargets.length}</strong> student(s). This action updates their access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-ivory/60">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => extendStudents(bulkTargets, bulkDays, confirmBulk === 'all' ? 'bulk_extend_all' : 'bulk_extend_selected')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Extend {bulkTargets.length} student(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}