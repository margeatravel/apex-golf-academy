import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { demoStudents } from '@/data/demoData';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  UserCheck, Link2, Unlink, Loader2, Search,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SANTIAGO_ID = '13480fb4-e4d2-423c-b035-c65846b061fc';

interface Student {
  id: string;
  email: string;
  full_name: string | null;
  assigned_coach_id: string | null;
}

type Filter = 'all' | 'linked' | 'unlinked';

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5 space-y-4">{children}</div>;
}

export function CoachSettingsSection() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const COACH_ID = user?.id ?? SANTIAGO_ID;
  const COACH_NAME = profile?.full_name || 'tu cuenta';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'link' | 'unlink' | null>(null);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['coach-settings-students', isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) {
        return demoStudents.map((s) => ({
          id: s.id,
          email: s.email,
          full_name: s.full_name,
          assigned_coach_id: COACH_ID,
        })) as Student[];
      }
      // First get student user IDs
      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles' as any)
        .select('user_id')
        .eq('role', 'student');
      if (roleErr) throw roleErr;
      const studentIds = (roleData || []).map((r: any) => r.user_id);
      if (studentIds.length === 0) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, assigned_coach_id')
        .in('id', studentIds)
        .order('full_name');
      if (error) throw error;
      return (data || []) as Student[];
    },
  });

  const filtered = useMemo(() => {
    let list = students;
    if (filter === 'linked') list = list.filter(s => s.assigned_coach_id === COACH_ID);
    else if (filter === 'unlinked') list = list.filter(s => s.assigned_coach_id !== COACH_ID);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    return list;
  }, [students, filter, search]);

  const linkedCount = students.filter(s => s.assigned_coach_id === COACH_ID).length;
  const unlinkedCount = students.length - linkedCount;

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(s => s.id)));
  };

  const linkStudents = async (ids: string[]) => {
    if (isDemoModeActive()) { toast.error('Lectura sola en Modo Demo'); setConfirmAction(null); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        const { error } = await supabase.from('profiles').update({ assigned_coach_id: COACH_ID }).eq('id', id);
        if (error) throw error;
      }
      toast.success(`Linked ${ids.length} student(s) to ${COACH_NAME}`);
      qc.invalidateQueries({ queryKey: ['coach-settings-students'] });
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy(false); setConfirmAction(null); }
  };

  const unlinkStudents = async (ids: string[]) => {
    if (isDemoModeActive()) { toast.error('Lectura sola en Modo Demo'); setConfirmAction(null); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        const { error } = await supabase.from('profiles').update({ assigned_coach_id: null }).eq('id', id);
        if (error) throw error;
      }
      toast.success(`Unlinked ${ids.length} student(s) from ${COACH_NAME}`);
      qc.invalidateQueries({ queryKey: ['coach-settings-students'] });
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy(false); setConfirmAction(null); }
  };

  const selectedArr = Array.from(selected);
  const filterBtns: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${students.length})` },
    { key: 'linked', label: `${t('i18nExtras.linked')} (${linkedCount})` },
    { key: 'unlinked', label: `${t('i18nExtras.unlinked')} (${unlinkedCount})` },
  ];

  return (
    <SettingsCard>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
          <UserCheck className="h-4 w-4" style={{ color: '#4a7c59' }} />
        </div>
        <div>
          <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>Coach Settings</h3>
          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>Link or unlink students to {COACH_NAME}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ivory/30" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('i18nExtras.searchStudents')}
            className="pl-8 h-8 text-sm bg-white/5 border-white/10" />
        </div>
        {filterBtns.map(f => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => { setFilter(f.key); setSelected(new Set()); }}
            className={`h-8 text-xs ${filter === f.key ? 'bg-[#4a7c59] hover:bg-[#3d6a4c] text-white border-0' : 'border-white/10 text-ivory/50 hover:text-ivory bg-white/5'}`}>
            {f.label}
          </Button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" disabled={busy} onClick={() => linkStudents(selectedArr)}
            className="h-8 text-xs bg-green-600/30 hover:bg-green-600/50 text-green-300 border-0">
            <Link2 className="h-3 w-3 mr-1" /> Link selected ({selected.size})
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmAction('unlink')}
            className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10">
            <Unlink className="h-3 w-3 mr-1" /> Unlink selected ({selected.size})
          </Button>
        </div>
      )}

      {/* Student list */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-ivory/30" /></div>
      ) : (
        <div className="space-y-1 max-h-[420px] overflow-y-auto">
          <div className="flex items-center gap-2 px-2 py-1 text-[11px] uppercase tracking-wider" style={{ color: '#E8D5B0', opacity: 0.4 }}>
            <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} className="h-3.5 w-3.5" />
            <span className="flex-1">Student</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-24" />
          </div>
          {filtered.map(s => {
            const linked = s.assigned_coach_id === COACH_ID;
            return (
              <div key={s.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} className="h-3.5 w-3.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: '#F5F0E8' }}>{s.full_name || s.email}</p>
                  <p className="text-[11px] truncate" style={{ color: '#E8D5B0', opacity: 0.4 }}>{s.email}</p>
                </div>
                <Badge className={`${linked ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-ivory/50'} border-0 text-[10px] w-20 justify-center`}>
                  {linked ? t('i18nExtras.linked') : t('i18nExtras.unlinked')}
                </Badge>
                <div className="w-24 flex justify-end">
                  {linked ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => unlinkStudents([s.id])}
                      className="h-7 text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10 px-2">
                      <Unlink className="h-3 w-3 mr-1" /> Unlink
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => linkStudents([s.id])}
                      className="h-7 text-[11px] bg-green-600/30 hover:bg-green-600/50 text-green-300 border-0 px-2">
                      <Link2 className="h-3 w-3 mr-1" /> Link
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center py-6 text-sm text-ivory/30">No students match</p>
          )}
        </div>
      )}

      {/* Confirm unlink dialog */}
      <AlertDialog open={confirmAction === 'unlink'} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-[#1a2e23] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Confirm bulk unlink</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              This will unlink <strong className="text-ivory">{selected.size}</strong> student(s) from {COACH_NAME}.
              Their lessons, packages, and data will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-ivory/60">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => unlinkStudents(selectedArr)}
              className="bg-red-600 hover:bg-red-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Unlink {selected.size} student(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
