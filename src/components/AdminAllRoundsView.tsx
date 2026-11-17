import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Loader2, Trash2, Pencil, User, BarChart3, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogRoundModal } from '@/components/LogRoundModal';
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
import { toast } from 'sonner';

interface RoundWithStudent {
  id: string;
  student_id: string;
  course_id: string | null;
  course_name_snapshot: string;
  round_type: 'practice' | 'tournament';
  played_on: string;
  holes_played: number;
  course_par: number;
  total_score: number;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_in_regulation: number | null;
  putts: number | null;
  penalties: number | null;
  weather: string | null;
  notes: string | null;
  tees: string | null;
  lost_balls?: number | null;
  tournament_position?: number | null;
  up_downs_attempted?: number | null;
  up_downs_converted?: number | null;
  eagles?: number | null;
  birdies?: number | null;
  pars?: number | null;
  bogeys?: number | null;
  doubles_plus?: number | null;
  par3_avg?: number | null;
  par4_avg?: number | null;
  par5_avg?: number | null;
  student_name: string;
  student_email: string;
}

function formatDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreDiff(score: number, par: number) {
  const d = score - par;
  if (d === 0) return <span className="text-green-accent font-semibold">E</span>;
  if (d > 0) return <span className="text-red-400 font-semibold">+{d}</span>;
  return <span className="text-green-400 font-semibold">{d}</span>;
}

export function AdminAllRoundsView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [editingRound, setEditingRound] = useState<RoundWithStudent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoundWithStudent | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: rounds, isLoading } = useQuery({
    queryKey: ['admin-all-rounds', limit],
    queryFn: async () => {
      // Fetch rounds
      const { data: roundsData, error: rErr } = await supabase
        .from('golf_rounds')
        .select('*')
        .order('played_on', { ascending: false })
        .limit(limit);
      if (rErr) throw rErr;
      if (!roundsData?.length) return [] as RoundWithStudent[];

      // Get unique student IDs and fetch profiles
      const studentIds = [...new Set(roundsData.map((r: any) => r.student_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);

      const profileMap = new Map<string, { name: string; email: string }>();
      (profiles ?? []).forEach((p: any) => {
        profileMap.set(p.id, { name: p.full_name || '', email: p.email || '' });
      });

      return roundsData.map((r: any) => ({
        ...r,
        student_name: profileMap.get(r.student_id)?.name || 'Unknown',
        student_email: profileMap.get(r.student_id)?.email || '',
      })) as RoundWithStudent[];
    },
  });

  const filtered = useMemo(() => {
    if (!rounds) return [];
    if (!search.trim()) return rounds;
    const q = search.toLowerCase();
    return rounds.filter(
      (r) =>
        r.student_name.toLowerCase().includes(q) ||
        r.student_email.toLowerCase().includes(q) ||
        r.course_name_snapshot.toLowerCase().includes(q),
    );
  }, [rounds, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-all-rounds'] });

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('golf_rounds').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) toast.error('Failed to delete round');
    else {
      toast.success('Round deleted');
      refresh();
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-ivory/40" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ivory/40" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student or course…"
          className="pl-9 bg-white/5 border-white/10 text-ivory placeholder:text-ivory/40"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-ivory/50 text-sm">
          {rounds?.length === 0 ? 'No rounds logged by any student yet.' : 'No results match your search.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.id;
            const girPct = r.greens_in_regulation != null && r.holes_played
              ? Math.round((r.greens_in_regulation / r.holes_played) * 100)
              : null;
            const firPct = r.fairways_hit != null && r.fairways_total && r.fairways_total > 0
              ? Math.round((r.fairways_hit / r.fairways_total) * 100)
              : null;

            return (
              <div key={r.id} className="glass-card overflow-hidden">
                {/* Collapsed row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full p-3 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors"
                >
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-accent/10">
                    <User className="h-4 w-4 text-green-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ivory truncate">{r.student_name}</span>
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full font-semibold ${
                        r.round_type === 'tournament'
                          ? 'bg-gold-accent/15 text-gold-accent'
                          : 'bg-green-accent/15 text-green-accent'
                      }`}>
                        {r.round_type === 'tournament' ? '🏆' : '⛳'} {r.round_type}{r.round_type === 'tournament' && r.tournament_position != null ? ` · #${r.tournament_position}` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-ivory/50 truncate">
                      {r.course_name_snapshot} · {formatDate(r.played_on)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-ivory">{r.total_score}</div>
                    <div className="text-xs">{scoreDiff(r.total_score, r.course_par)}</div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-ivory/40 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-ivory/40 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-ivory/40 uppercase">GIR</p>
                        <p className="text-sm font-semibold text-ivory leading-tight">
                          {r.greens_in_regulation != null
                            ? r.greens_in_regulation.toFixed(1)
                            : '—'}
                        </p>
                        {girPct != null && (
                          <p className="text-[10px] text-ivory/40 tabular-nums">{girPct}%</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-ivory/40 uppercase">FIR</p>
                        <p className="text-sm font-semibold text-ivory leading-tight">
                          {r.fairways_hit != null
                            ? r.fairways_hit.toFixed(1)
                            : '—'}
                        </p>
                        {firPct != null && (
                          <p className="text-[10px] text-ivory/40 tabular-nums">{firPct}%</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-ivory/40 uppercase">Putts</p>
                        <p className="text-sm font-semibold text-ivory">{r.putts ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ivory/40 uppercase">Lost balls / Pen.</p>
                        <p className="text-sm font-semibold text-ivory">{r.lost_balls ?? r.penalties ?? '—'}</p>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    {(r.eagles || r.birdies || r.pars || r.bogeys || r.doubles_plus) && (
                      <div className="grid grid-cols-5 gap-1 text-center">
                        {r.eagles != null && (
                          <div>
                            <p className="text-[10px] text-ivory/40">Eagles</p>
                            <p className="text-xs font-semibold text-green-400">{r.eagles}</p>
                          </div>
                        )}
                        {r.birdies != null && (
                          <div>
                            <p className="text-[10px] text-ivory/40">Birdies</p>
                            <p className="text-xs font-semibold text-green-400">{r.birdies}</p>
                          </div>
                        )}
                        {r.pars != null && (
                          <div>
                            <p className="text-[10px] text-ivory/40">Pars</p>
                            <p className="text-xs font-semibold text-ivory">{r.pars}</p>
                          </div>
                        )}
                        {r.bogeys != null && (
                          <div>
                            <p className="text-[10px] text-ivory/40">Bogeys</p>
                            <p className="text-xs font-semibold text-red-400">{r.bogeys}</p>
                          </div>
                        )}
                        {r.doubles_plus != null && (
                          <div>
                            <p className="text-[10px] text-ivory/40">Dbl+</p>
                            <p className="text-xs font-semibold text-red-400">{r.doubles_plus}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {r.notes && (
                      <p className="text-xs text-ivory/60 italic">"{r.notes}"</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link
                        to={`/admin/student/${r.student_id}`}
                        className="flex-1"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 bg-white/5 border-white/10 text-ivory hover:bg-white/10 text-xs"
                        >
                          <User className="h-3.5 w-3.5" />
                          View Student
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 bg-white/5 border-white/10 text-ivory hover:bg-white/10 text-xs"
                        onClick={() => setEditingRound(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 bg-white/5 border-red-400/20 text-red-400 hover:bg-red-400/10 text-xs"
                        onClick={() => setConfirmDelete(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {rounds && rounds.length >= limit && (
        <Button
          variant="outline"
          className="w-full bg-white/5 border-white/10 text-ivory/70 hover:bg-white/10"
          onClick={() => setLimit((l) => l + 50)}
        >
          Load more rounds
        </Button>
      )}

      {/* Edit modal */}
      {editingRound && (
        <LogRoundModal
          open={!!editingRound}
          onOpenChange={(v) => !v && setEditingRound(null)}
          studentId={editingRound.student_id}
          round={editingRound}
          onSaved={() => {
            setEditingRound(null);
            refresh();
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Delete Round?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              This will permanently delete {confirmDelete?.student_name}'s round at{' '}
              {confirmDelete?.course_name_snapshot} ({confirmDelete?.played_on}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-ivory hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}