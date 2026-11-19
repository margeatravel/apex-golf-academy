import { useQuery } from '@tanstack/react-query';
import { Check, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function ProMembershipCard({ studentId, name, es }: { studentId?: string; name?: string | null; es: boolean }) {
  const { data: startedAt } = useQuery({
    queryKey: ['pro-sub-start', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('started_at, created_at')
        .eq('student_id', studentId!)
        .eq('plan_tier', 'pro')
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.started_at || data?.created_at || null;
    },
  });

  const benefits = es
    ? ['Precio preferencial en clases', 'Análisis de video mensual gratis', '1 clase en campo gratis cada 2 meses', 'Acceso total a la plataforma']
    : ['Preferred lesson pricing', 'Free monthly video analysis', '1 free playing lesson every 2 months', 'Full platform access'];

  return (
    <section className="lesson-glass rounded-3xl p-5 space-y-4">
      <div className="text-center">
        <p className="text-xs tracking-[0.3em] font-bold text-gold">MARGEA GOLF ACADEMY</p>
        <p className="text-[10px] text-ivory/50">by Santiago Castilla</p>
        {name && <p className="mt-2 text-lg font-semibold text-ivory">{name}</p>}
      </div>
      <div className="rounded-2xl p-4 bg-ivory/5 border border-ivory/10">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-gold"><Crown className="h-4 w-4" />{es ? 'ACTUALIZACIÓN DE TU MEMBRESÍA' : 'YOUR MEMBERSHIP UPDATE'}</p>
        <p className="mt-2 text-sm text-ivory/80">{es ? 'Después de tus primeros 4 meses empieza tu descuento y baja poco a poco cada 2 meses, hasta llegar a una mensualidad permanente.' : 'After your first 4 months your discount begins, dropping step by step every 2 months until it reaches a permanent monthly price.'}</p>
        {startedAt && <p className="mt-2 text-[11px] text-ivory/50">{es ? 'Puedes ver tu precio actual y toda la progresión en la pestaña de Membresías o en Clases y paquetes.' : 'You can see your current price and the full progression in the Memberships or Lessons & Packages tab.'}</p>}
      </div>
      <div>
        <p className="text-xs font-bold tracking-wider text-gold mb-2">{es ? 'MANTIENES TODOS TUS BENEFICIOS PRO' : 'YOU KEEP ALL YOUR PRO BENEFITS'}</p>
        <ul className="space-y-1.5">
          {benefits.map(b => <li key={b} className="flex items-center gap-2 text-sm text-ivory/85"><Check className="h-4 w-4 text-gold shrink-0" />{b}</li>)}
        </ul>
      </div>
      <p className="text-xs text-ivory/60 border-t border-ivory/10 pt-3">
        {es ? 'Tus beneficios y precios preferenciales se mantienen mientras sigas en Margea Golf Academy. Si cancelas, al volver empiezas de nuevo desde el precio público.' : 'Your benefits and preferred pricing stay as long as you remain with Margea Golf Academy. If you cancel, you start again at the public price.'}
      </p>
    </section>
  );
}
