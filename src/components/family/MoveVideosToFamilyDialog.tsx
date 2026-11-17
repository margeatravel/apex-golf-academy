import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useFamilyTargets } from '@/hooks/useFamilyTargets';

export interface MovableItem {
  id: string;
  source: 'videos' | 'media';
  /** Current owner of the file; defaults to the student being viewed. */
  ownerId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  items: MovableItem[];
  onMoved: () => void;
}

/**
 * Moves already-uploaded videos / media between a student and their linked
 * family members (children with or without their own account, partner).
 * Items may belong to different owners, so they are grouped per owner and the
 * server function is called once per group. The heavy lifting (rows + storage
 * files + URLs) happens server-side.
 */
export function MoveVideosToFamilyDialog({ open, onOpenChange, studentId, items, onMoved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: targets = [], isLoading } = useFamilyTargets(open ? studentId : null);
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!targetId) return;
    setSaving(true);
    try {
      // Group by current owner: everything that already belongs to the target
      // is skipped, the rest is moved owner by owner.
      const groups = new Map<string, MovableItem[]>();
      for (const it of items) {
        const owner = it.ownerId || studentId;
        if (owner === targetId) continue;
        groups.set(owner, [...(groups.get(owner) || []), it]);
      }

      let moved = 0;
      for (const [owner, groupItems] of groups) {
        const { data, error } = await supabase.functions.invoke('move-videos-to-family', {
          body: {
            fromStudentId: owner,
            toStudentId: targetId,
            items: groupItems.map((i) => ({ id: i.id, source: i.source })),
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        moved += (data as any)?.moved ?? 0;
      }

      toast({ title: `${moved} archivo(s) movido(s)` });
      qc.invalidateQueries({ queryKey: ['student-videos', studentId] });
      qc.invalidateQueries({ queryKey: ['student-media', studentId] });
      qc.invalidateQueries({ queryKey: ['student-family-videos', studentId] });
      onOpenChange(false);
      setTargetId('');
      onMoved();
    } catch (e: any) {
      toast({ title: 'No se pudo mover', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Mover a un familiar
          </DialogTitle>
          <DialogDescription>
            {items.length} archivo(s) seleccionado(s). Al moverlos cambian de dueño y se desligan
            de sus clases; la familia los ve en la sección Familia.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : targets.length < 2 ? (
          <p className="text-sm text-muted-foreground py-4">
            Este alumno no tiene familiares vinculados.
          </p>
        ) : (
          <div className="space-y-2">
            {targets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setTargetId(o.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  targetId === o.id
                    ? 'border-[#F0C040] bg-[#F0C040]/10'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {o.name}
                {o.isSelf && <span className="text-xs text-muted-foreground"> · este alumno</span>}
                {o.isManaged && <span className="text-xs text-muted-foreground"> · sin cuenta</span>}
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!targetId || saving || items.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
