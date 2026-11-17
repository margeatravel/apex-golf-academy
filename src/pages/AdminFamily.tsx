import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Users2, ChevronRight, ChevronDown, X, Loader2, Plus, ExternalLink, Eye } from 'lucide-react';
import { useAssignedStudentIds } from '@/hooks/useAssignedStudentIds';

type FLink = { id: string; parent_user_id: string; child_user_id: string };
type Profile = { id: string; full_name: string | null; email: string | null; photo_url?: string | null };

export default function AdminFamily() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isOwner, studentIds } = useAssignedStudentIds();
  const scopeKey = isOwner ? 'all' : `coach:${(studentIds ?? []).slice().sort().join(',')}`;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newParent, setNewParent] = useState('');
  const [newChild, setNewChild] = useState('');
  const [childPick, setChildPick] = useState<Record<string, string>>({});

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['admin-family-links', scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_links')
        .select('id, parent_user_id, child_user_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const all = (data ?? []) as FLink[];
      if (isOwner) return all;
      // Non-owner coach: only show family links that touch one of their assigned students.
      const assigned = new Set(studentIds ?? []);
      if (assigned.size === 0) return [];
      return all.filter(l => assigned.has(l.parent_user_id) || assigned.has(l.child_user_id));
    },
    enabled: isOwner || Array.isArray(studentIds),
  });

  const ids = Array.from(new Set(links.flatMap(l => [l.parent_user_id, l.child_user_id])));

  const { data: profileMap = {} } = useQuery({
    queryKey: ['admin-family-profiles', ids.sort().join(',')],
    queryFn: async () => {
      if (!ids.length) return {} as Record<string, Profile>;
      const { data } = await supabase.from('profiles').select('id, full_name, email, photo_url').in('id', ids);
      const map: Record<string, Profile> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p));
      return map;
    },
    enabled: ids.length > 0,
  });

  // Group children by parent
  const families = Array.from(
    links.reduce((acc, l) => {
      const arr = acc.get(l.parent_user_id) ?? [];
      arr.push(l);
      acc.set(l.parent_user_id, arr);
      return acc;
    }, new Map<string, FLink[]>()).entries()
  ).map(([parentId, kids]) => ({ parentId, kids }));

  const addMut = useMutation({
    mutationFn: async (vars: { parent_user_id: string; child_user_id: string }) => {
      if (vars.parent_user_id === vars.child_user_id) throw new Error('Parent and child must be different students');
      const { error } = await supabase.from('family_links').insert(vars);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-family-links'] });
      setNewParent(''); setNewChild(''); setAddOpen(false); setChildPick({});
      toast({ title: 'Family link created' });
    },
    onError: (e: any) => toast({ title: 'Could not create link', description: e.message, variant: 'destructive' }),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_links').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-family-links'] });
      toast({ title: 'Family link removed' });
    },
    onError: (e: any) => toast({ title: 'Could not remove link', description: e.message, variant: 'destructive' }),
  });

  const labelOf = (id: string) => {
    const p = profileMap[id];
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  const Avatar = ({ id }: { id: string }) => {
    const p = profileMap[id];
    if (p?.photo_url) return <img src={p.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />;
    return (
      <div className="h-10 w-10 rounded-full bg-[#4a7c59]/40 flex items-center justify-center text-ivory text-sm font-semibold">
        {(p?.full_name || p?.email || '?').slice(0, 1).toUpperCase()}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: '#0d1f18' }}>
      <InternalHeader title="Family View" subtitle={`${families.length} familias vinculadas`} backTo="/admin" />

      <main className="p-5 max-w-3xl mx-auto space-y-4 pb-20">
        <button
          onClick={() => setAddOpen(o => !o)}
          className="w-full glass-card p-4 flex items-center justify-between hover:scale-[1.005] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.2)' }}>
              <Plus className="h-5 w-5" style={{ color: '#F0C040' }} />
            </div>
            <div className="text-left">
              <h3 className="text-ivory font-semibold">Vincular nueva familia</h3>
              <p className="text-xs text-ivory/50">Asigna un papá a un hijo</p>
            </div>
          </div>
          {addOpen ? <ChevronDown className="h-5 w-5 text-ivory/60" /> : <ChevronRight className="h-5 w-5 text-ivory/60" />}
        </button>

        {addOpen && (
          <div className="glass-card p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-ivory/50 mb-1">Papá</p>
              <SearchableStudentSelect value={newParent} onValueChange={setNewParent} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ivory/50 mb-1">Hijo</p>
              <SearchableStudentSelect value={newChild} onValueChange={setNewChild} />
            </div>
            <Button
              size="sm"
              disabled={!newParent || !newChild || addMut.isPending}
              onClick={() => addMut.mutate({ parent_user_id: newParent, child_user_id: newChild })}
              className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear vínculo'}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-ivory/60 text-sm p-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : families.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Users2 className="h-10 w-10 text-ivory/30 mx-auto mb-3" />
            <p className="text-ivory/60 text-sm">No hay familias vinculadas todavía.</p>
          </div>
        ) : (
          families.map(({ parentId, kids }) => {
            const isOpen = expanded === parentId;
            return (
              <div key={parentId} className="glass-card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : parentId)}
                  className="w-full p-4 flex items-center justify-between hover:bg-ivory/5 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar id={parentId} />
                    <div className="text-left min-w-0">
                      <p className="text-ivory font-semibold truncate">{labelOf(parentId)}</p>
                      <p className="text-xs text-ivory/50">
                        {kids.length} {kids.length === 1 ? 'hijo vinculado' : 'hijos vinculados'}
                      </p>
                    </div>
                  </div>
                  {isOpen ? <ChevronDown className="h-5 w-5 text-ivory/60" /> : <ChevronRight className="h-5 w-5 text-ivory/60" />}
                </button>

                {isOpen && (
                  <div className="border-t border-ivory/10 p-4 space-y-3">
                    <p className="text-xs uppercase tracking-wide text-ivory/50">Hijos</p>
                    <div className="space-y-2">
                      {kids.map(l => (
                        <div
                          key={l.id}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 bg-ivory/5 border border-ivory/10"
                        >
                          <Avatar id={l.child_user_id} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ivory truncate">{labelOf(l.child_user_id)}</p>
                            <p className="text-xs text-ivory/50 truncate">
                              {profileMap[l.child_user_id]?.email || ''}
                            </p>
                          </div>
                          <Link
                            to={`/admin/student/${l.child_user_id}`}
                            className="text-xs text-[#F0C040] hover:underline flex items-center gap-1"
                          >
                            Ver <ExternalLink className="h-3 w-3" />
                          </Link>
                          <Link
                            to={`/admin/family/preview/${l.id}`}
                            className="text-xs text-[#F0C040] hover:underline flex items-center gap-1"
                            title="Ver y editar la vista del papá"
                          >
                            Vista papá <Eye className="h-3 w-3" />
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-ivory/60 hover:text-red-400"
                            onClick={() => removeMut.mutate(l.id)}
                            disabled={removeMut.isPending}
                            aria-label="Remove"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <div className="flex-1">
                        <SearchableStudentSelect
                          value={childPick[parentId] || ''}
                          onValueChange={(v) => setChildPick(s => ({ ...s, [parentId]: v }))}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!childPick[parentId] || addMut.isPending}
                        onClick={() => addMut.mutate({ parent_user_id: parentId, child_user_id: childPick[parentId] })}
                        className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
                      >
                        Agregar hijo
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      <SocialFooter />
    </div>
  );
}