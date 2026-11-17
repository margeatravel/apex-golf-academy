import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Send, Loader2, X, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Grant {
  id: string;
  parent_email: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  relationship: 'papa' | 'mama' | 'tutor' | null;
}

interface ParentAccessManagerProps {
  studentId: string;
  /** Visual variant: 'card' adds glass-card wrapper; 'inline' is unwrapped */
  variant?: 'card' | 'inline';
  /** Optional intro copy override */
  intro?: string;
}

export function ParentAccessManager({
  studentId,
  variant = 'card',
  intro,
}: ParentAccessManagerProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState<'papa' | 'mama' | 'tutor'>('papa');

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ['parent-access-grants', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parent_access_grants')
        .select('id, parent_email, created_at, revoked_at, last_used_at, relationship')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Grant[];
    },
    enabled: !!studentId,
  });

  const sendMut = useMutation({
    mutationFn: async (vars: { parentEmail: string; relationship: 'papa' | 'mama' | 'tutor' }) => {
      const { data, error } = await supabase.functions.invoke('send-parent-access', {
        body: {
          studentId,
          parentEmail: vars.parentEmail,
          relationship: vars.relationship,
          redirectOrigin: window.location.origin,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Acceso enviado', description: 'Le mandamos el link al correo indicado.' });
      setEmail('');
      qc.invalidateQueries({ queryKey: ['parent-access-grants', studentId] });
    },
    onError: (err: any) => {
      toast({
        title: 'No se pudo enviar',
        description: err?.message || 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (grantId: string) => {
      const { data, error } = await supabase.functions.invoke('revoke-parent-access', {
        body: { grantId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Acceso revocado' });
      qc.invalidateQueries({ queryKey: ['parent-access-grants', studentId] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.message || 'No se pudo revocar.', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      toast({ title: 'Email inválido', variant: 'destructive' });
      return;
    }
    sendMut.mutate({ parentEmail: v, relationship });
  };

  const activeGrants = grants.filter((g) => !g.revoked_at);

  const Body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-gold-accent/15 flex items-center justify-center">
          <Users className="h-4 w-4 text-gold-accent" />
        </div>
        <h3 className="font-heading text-base font-semibold text-ivory">Acceso familiar</h3>
      </div>
      <p className="text-xs text-ivory/60 mb-4 leading-relaxed">
        {intro ??
          'Invita a tu papá, mamá o tutor a entrar a esta cuenta. Verá videos, lecciones, paquetes y avance — y podrá reservar o pagar a tu nombre. Le enviaremos un link mágico por correo.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {(['papa', 'mama', 'tutor'] as const).map((r) => {
          const label = r === 'papa' ? 'Papá' : r === 'mama' ? 'Mamá' : 'Tutor';
          const active = relationship === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRelationship(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                active
                  ? 'bg-gold-accent text-black border-gold-accent'
                  : 'bg-white/5 text-ivory/70 border-white/10 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="correo@familia.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sendMut.isPending}
          className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
        />
        <Button
          type="submit"
          disabled={sendMut.isPending || !email.trim()}
          className="bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2 shrink-0"
        >
          {sendMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar acceso
        </Button>
      </form>

      <div className="space-y-2">
        {isLoading && (
          <div className="text-xs text-ivory/50 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
          </div>
        )}
        {!isLoading && grants.length === 0 && (
          <div className="text-xs text-ivory/40 italic">Aún no has invitado a nadie.</div>
        )}
        {grants.map((g) => {
          const revoked = !!g.revoked_at;
          const relLabel =
            g.relationship === 'papa' ? 'Papá'
            : g.relationship === 'mama' ? 'Mamá'
            : g.relationship === 'tutor' ? 'Tutor'
            : null;
          return (
            <div
              key={g.id}
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                revoked
                  ? 'bg-white/[0.02] border-white/5 opacity-60'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ivory truncate font-medium">
                  {relLabel && (
                    <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide bg-gold-accent/15 text-gold-accent border border-gold-accent/30 align-middle">
                      {relLabel}
                    </span>
                  )}
                  {g.parent_email}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-ivory/40 mt-0.5">
                  <Clock className="h-3 w-3" />
                  Enviado {format(new Date(g.created_at), 'd MMM, yyyy')}
                  {g.last_used_at && (
                    <span className="text-emerald-400/70">
                      · Último ingreso {format(new Date(g.last_used_at), 'd MMM')}
                    </span>
                  )}
                  {revoked && <span className="text-red-400/70">· Revocado</span>}
                </div>
              </div>
              {!revoked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeMut.mutate(g.id)}
                  disabled={revokeMut.isPending}
                  className="text-ivory/50 hover:text-red-400 hover:bg-red-500/10 gap-1 h-8 px-2"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="text-xs">Revocar</span>
                </Button>
              )}
            </div>
          );
        })}
        {activeGrants.length > 0 && (
          <p className="text-[11px] text-ivory/40 leading-relaxed pt-1">
            Quien tenga el link puede entrar a la cuenta. Compártelo solo con familia de confianza.
          </p>
        )}
      </div>
    </>
  );

  if (variant === 'inline') return <div>{Body}</div>;
  return <div className="glass-card p-5">{Body}</div>;
}