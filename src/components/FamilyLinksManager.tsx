import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users2, Loader2, X, Baby as BabyIcon, Pencil } from 'lucide-react';
import { SearchableStudentSelect } from '@/components/SearchableStudentSelect';
import { ManagedMemberDialog, type ManagedMemberDraft } from '@/components/family/ManagedMemberDialog';

/** Max managed (account-less) family members per student. */
const MAX_MANAGED = 3;


interface Props {
  /** The student being viewed in AdminStudentDetail. */
  studentId: string;
}

type Relationship = 'papa' | 'mama' | 'hijo' | 'pareja';

type LinkRow = {
  id: string;
  parent_user_id: string;
  child_user_id: string;
  created_at: string;
  relationship: Relationship | null;
};

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  papa: 'Papá',
  mama: 'Mamá',
  hijo: 'Hijo',
  pareja: 'Pareja',
};

/**
 * Coach-side manager: lets staff link two student accounts with a relationship.
 *
 * Direction convention (relationship describes the SELECTED account relative to
 * the student currently being viewed):
 *  - 'hijo'         -> viewed student is the parent: parent=studentId, child=selected
 *  - 'papa'/'mama'  -> selected account is the parent: parent=selected, child=studentId
 *  - 'pareja'       -> symmetric: two rows are inserted (both directions)
 *
 * Deletion note: rows are removed one at a time, including partner links — removing
 * one side of a 'pareja' pair leaves the mirrored row until it is removed too.
 */
export function FamilyLinksManager({ studentId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pick, setPick] = useState('');
  const [relationship, setRelationship] = useState<Relationship | ''>('');
  const [memberDialog, setMemberDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<ManagedMemberDraft | null>(null);


  const { data: links = [], isLoading } = useQuery({
    queryKey: ['family-links', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_links')
        .select('id, parent_user_id, child_user_id, created_at, relationship')
        .or(`parent_user_id.eq.${studentId},child_user_id.eq.${studentId}`);
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
    enabled: !!studentId,
  });

  const otherIds = Array.from(
    new Set(links.flatMap((l) => [l.parent_user_id, l.child_user_id]).filter((id) => id !== studentId)),
  );

  const { data: profileMap = {} } = useQuery({
    queryKey: ['family-link-profiles', otherIds.sort().join(',')],
    queryFn: async () => {
      if (!otherIds.length) return {};
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_managed, birth_date, photo_url')
        .in('id', otherIds);
      if (error) throw error;
      const map: Record<string, ManagedMemberDraft & { email: string | null; is_managed?: boolean | null }> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        is_managed: p.is_managed,
        birth_date: p.birth_date,
        photo_url: p.photo_url,
      }));
      return map;
    },
    enabled: otherIds.length > 0,
  });

  const managedCount = Object.values(profileMap).filter((p: any) => p?.is_managed).length;


  const partnerLinks = links.filter((l) => l.relationship === 'pareja');
  const parentLinks = links.filter((l) => l.relationship !== 'pareja' && l.child_user_id === studentId);
  const childLinks = links.filter((l) => l.relationship !== 'pareja' && l.parent_user_id === studentId);

  const addMut = useMutation({
    mutationFn: async (vars: { otherId: string; relationship: Relationship }) => {
      const { otherId, relationship: rel } = vars;
      const rows: { parent_user_id: string; child_user_id: string; relationship: Relationship }[] =
        rel === 'hijo'
          ? [{ parent_user_id: studentId, child_user_id: otherId, relationship: rel }]
          : rel === 'pareja'
            ? [
                { parent_user_id: studentId, child_user_id: otherId, relationship: rel },
                { parent_user_id: otherId, child_user_id: studentId, relationship: rel },
              ]
            : [{ parent_user_id: otherId, child_user_id: studentId, relationship: rel }];

      // Skip rows that already exist (respects the unique pair constraint).
      const pending = rows.filter(
        (r) => !links.some((l) => l.parent_user_id === r.parent_user_id && l.child_user_id === r.child_user_id),
      );
      if (pending.length) {
        const { error } = await supabase.from('family_links').insert(pending);
        if (error) throw error;
      }

      // Partners share account-less family members: every managed child of one
      // account gets linked to the other account too.
      if (rel === 'pareja') {
        const pair = [studentId, otherId];
        const { data: managed } = await supabase
          .from('profiles')
          .select('id, managed_by')
          .eq('is_managed', true)
          .in('managed_by', pair);

        const { data: existing } = await supabase
          .from('family_links')
          .select('parent_user_id, child_user_id')
          .in('parent_user_id', pair);

        const has = new Set((existing ?? []).map((l: any) => `${l.parent_user_id}:${l.child_user_id}`));
        const shared = (managed ?? [])
          .flatMap((m: any) =>
            pair.map((parentId) => ({
              parent_user_id: parentId,
              child_user_id: m.id as string,
              relationship: 'hijo' as Relationship,
            })),
          )
          .filter((r) => r.child_user_id !== r.parent_user_id && !has.has(`${r.parent_user_id}:${r.child_user_id}`));

        if (shared.length) {
          const { error: shareErr } = await supabase.from('family_links').insert(shared);
          if (shareErr && (shareErr as any).code !== '23505') throw shareErr;
        }
      }
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family-links', studentId] });
      setPick('');
      setRelationship('');
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
      qc.invalidateQueries({ queryKey: ['family-links', studentId] });
      toast({ title: 'Family link removed' });
    },
    onError: (e: any) => toast({ title: 'Could not remove link', description: e.message, variant: 'destructive' }),
  });

  const renderRow = (l: LinkRow, otherId: string, role: 'parent' | 'child' | 'partner') => {
    const p = profileMap[otherId];
    const caption = l.relationship
      ? RELATIONSHIP_LABEL[l.relationship]
      : role === 'parent'
        ? 'Parent of this student'
        : 'Child of this student';
    return (
      <div
        key={l.id}
        className="flex items-center justify-between gap-2 rounded-md border border-ivory/10 bg-ivory/5 px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-sm text-ivory truncate">
            {p?.full_name || (p as any)?.email || otherId.slice(0, 8)}
            {(p as any)?.is_managed && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-[#F0C040]">Sin cuenta</span>
            )}
          </p>
          <p className="text-xs text-ivory/50 truncate">
            {caption}
            {(p as any)?.email && !(p as any)?.is_managed ? ` · ${(p as any).email}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(p as any)?.is_managed && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-ivory/60 hover:text-[#F0C040]"
              onClick={() => { setEditingMember(p as ManagedMemberDraft); setMemberDialog(true); }}
              aria-label="Edit member"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-ivory/60 hover:text-red-400"
            onClick={() => removeMut.mutate(l.id)}
            disabled={removeMut.isPending}
            aria-label="Remove link"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

      </div>
    );
  };

  return (
    <div className="rounded-lg border border-ivory/10 bg-ivory/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users2 className="h-4 w-4 text-[#F0C040]" />
        <h3 className="text-sm font-semibold text-ivory">Family links</h3>
      </div>
      <p className="text-xs text-ivory/60">
        Link this student to a family account. The linked account gets a read-only view of lessons, videos, packages,
        points and progress from their own dashboard.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-ivory/60 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Existing links */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-ivory/50">Parent</p>
            {parentLinks.length > 0 ? (
              parentLinks.map((l) => renderRow(l, l.parent_user_id, 'parent'))
            ) : (
              <p className="text-xs text-ivory/40">No parent linked.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-ivory/50">Children</p>
            {childLinks.length > 0 ? (
              childLinks.map((l) => renderRow(l, l.child_user_id, 'child'))
            ) : (
              <p className="text-xs text-ivory/40">No children linked.</p>
            )}
          </div>

          {partnerLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-ivory/50">Pareja</p>
              {partnerLinks.map((l) =>
                renderRow(l, l.parent_user_id === studentId ? l.child_user_id : l.parent_user_id, 'partner'),
              )}
            </div>
          )}

          {/* Add link */}
          <div className="space-y-2 border-t border-ivory/10 pt-3">
            <p className="text-xs uppercase tracking-wide text-ivory/50">Add link</p>
            <SearchableStudentSelect value={pick} onValueChange={setPick} />
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={relationship} onValueChange={(v) => setRelationship(v as Relationship)}>
                  <SelectTrigger className="bg-ivory/5 border-ivory/10 text-ivory">
                    <SelectValue placeholder="Relación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="papa">Papá</SelectItem>
                    <SelectItem value="mama">Mamá</SelectItem>
                    <SelectItem value="hijo">Hijo</SelectItem>
                    <SelectItem value="pareja">Pareja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => pick && relationship && addMut.mutate({ otherId: pick, relationship })}
                disabled={!pick || !relationship || addMut.isPending}
                className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
              >
                {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vincular'}
              </Button>
            </div>
            <p className="text-[11px] text-ivory/40">
              La relación describe a la cuenta seleccionada respecto a este alumno. “Pareja” crea el vínculo en ambos
              sentidos.
            </p>
          </div>

          {/* Managed (account-less) family member */}
          <div className="space-y-2 border-t border-ivory/10 pt-3">
            <p className="text-xs uppercase tracking-wide text-ivory/50">Familiar sin cuenta</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-[#F0C040]/40 text-[#F0C040] hover:bg-[#F0C040]/10"
              disabled={managedCount >= MAX_MANAGED}
              onClick={() => { setEditingMember(null); setMemberDialog(true); }}
            >
              <BabyIcon className="h-4 w-4 mr-2" />
              Agregar familiar sin cuenta
            </Button>
            <p className="text-[11px] text-ivory/40">
              {managedCount >= MAX_MANAGED
                ? 'Este alumno ya tiene el máximo de 3 familiares sin cuenta.'
                : 'Crea a un hijo o familiar sin cuenta propia (nombre y fecha de nacimiento). Queda ligado a este alumno y a su pareja.'}
            </p>
          </div>
        </div>
      )}

      <ManagedMemberDialog
        open={memberDialog}
        onOpenChange={setMemberDialog}
        member={editingMember}
        ownerId={studentId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['family-links', studentId] });
          qc.invalidateQueries({ queryKey: ['family-link-profiles'] });
        }}
      />

    </div>
  );
}
