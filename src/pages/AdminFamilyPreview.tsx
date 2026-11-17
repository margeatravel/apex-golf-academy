import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Eye } from 'lucide-react';
import { ChildOverview, DEFAULT_VISIBILITY, type Visibility } from '@/components/family/ChildOverview';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const SECTIONS: { key: keyof Visibility; label: string }[] = [
  { key: 'profile', label: 'Encabezado del perfil' },
  { key: 'points', label: 'SC Points' },
  { key: 'packages', label: 'Paquetes de clases' },
  { key: 'lessons', label: 'Lecciones recientes' },
  { key: 'media', label: 'Videos recientes' },
  { key: 'plan', label: 'Plan de entrenamiento' },
];

export default function AdminFamilyPreview() {
  const { linkId } = useParams<{ linkId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: link, isLoading } = useQuery({
    queryKey: ['admin-family-link', linkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_links')
        .select('id, child_user_id, parent_user_id, visibility')
        .eq('id', linkId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!linkId,
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin-family-link-profiles', link?.child_user_id, link?.parent_user_id],
    queryFn: async () => {
      if (!link) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', [link.child_user_id, link.parent_user_id]);
      const map: Record<string, any> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p));
      return map;
    },
    enabled: !!link,
  });

  const visibility: Required<Visibility> = {
    ...DEFAULT_VISIBILITY,
    ...((link as any)?.visibility ?? {}),
  };

  const updateMut = useMutation({
    mutationFn: async (next: Visibility) => {
      const { error } = await supabase
        .from('family_links')
        .update({ visibility: next })
        .eq('id', linkId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-family-link', linkId] });
    },
    onError: (e: any) =>
      toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
  });

  const toggle = (key: keyof Visibility, val: boolean) => {
    updateMut.mutate({ ...visibility, [key]: val });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ivory">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-ivory p-6 text-center">
        <p>Vínculo familiar no encontrado.</p>
        <Link to="/admin/family" className="text-[#F0C040] underline text-sm">Volver</Link>
      </div>
    );
  }

  const childName = profiles?.[link.child_user_id]?.full_name || profiles?.[link.child_user_id]?.email || 'Hijo';
  const parentName = profiles?.[link.parent_user_id]?.full_name || profiles?.[link.parent_user_id]?.email || 'Papá';

  return (
    <div className="min-h-screen pb-20" style={{ background: '#0d1f18' }}>
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 backdrop-blur"
        style={{ background: 'rgba(13,31,24,0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Link to="/admin/family" className="text-ivory/70 hover:text-ivory">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#F0C040] flex items-center gap-1">
            <Eye className="h-3 w-3" /> Vista previa de papá
          </p>
          <h1 className="text-base font-semibold text-ivory truncate">
            {parentName} → {childName}
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        <section className="rounded-xl p-4 border border-[#F0C040]/30 bg-[#F0C040]/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ivory">Secciones visibles para el papá</h2>
              <p className="text-xs text-ivory/50">Apaga lo que no quieras que el familiar vea.</p>
            </div>
            {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin text-ivory/60" />}
          </div>
          <div className="space-y-2">
            {SECTIONS.map((s) => (
              <label
                key={s.key}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-ivory/5 border border-ivory/10"
              >
                <span className="text-sm text-ivory">{s.label}</span>
                <Switch
                  checked={!!visibility[s.key]}
                  onCheckedChange={(v) => toggle(s.key, v)}
                />
              </label>
            ))}
          </div>
        </section>

        <div className="rounded-xl border border-dashed border-ivory/20 p-1">
          <ChildOverview childId={link.child_user_id} visibility={visibility} />
        </div>
      </main>
    </div>
  );
}