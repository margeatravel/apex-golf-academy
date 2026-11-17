import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Gift, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { InternalHeader } from '@/components/InternalHeader';
import { Button } from '@/components/ui/button';
import { isPendingRedemption, scopeRedemptions } from '@/lib/redemptionInbox';

export default function CoachInbox() {
  const { user, effectiveCoachId, effectiveIsAdmin } = useAuth();
  const { language } = useLanguage();
  const es = language === 'es';
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const query = useQuery({
    queryKey: ['coach-redemption-inbox', user?.id, effectiveCoachId, effectiveIsAdmin],
    enabled: !!user && !!effectiveCoachId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!effectiveCoachId) return [];
      let studentsQuery = supabase.from('profiles').select('id, full_name');
      if (!effectiveIsAdmin) studentsQuery = studentsQuery.eq('assigned_coach_id', effectiveCoachId);
      const { data: students, error: studentError } = await studentsQuery;
      if (studentError) throw studentError;
      const ids = (students ?? []).map(student => student.id);
      if (!ids.length) return [];
      let redemptionsQuery = supabase.from('point_redemptions')
        .select('id, user_id, reward_id, reward_type, cost, created_at, fulfillment_status')
        .order('created_at', { ascending: false });
      if (!effectiveIsAdmin) redemptionsQuery = redemptionsQuery.in('user_id', ids);
      const { data: redemptions, error } = await redemptionsQuery;
      if (error) throw error;
      const { data: rewards, error: rewardsError } = await supabase.from('point_rewards').select('id, name');
      if (rewardsError) throw rewardsError;
      const names = new Map((students ?? []).map(student => [student.id, student.full_name]));
      const rewardNames = new Map((rewards ?? []).map(reward => [reward.id, reward.name]));
      const rows = effectiveIsAdmin ? redemptions ?? [] : scopeRedemptions(redemptions ?? [], ids);
      return rows.map(row => ({ ...row, studentName: names.get(row.user_id), rewardName: row.reward_id ? rewardNames.get(row.reward_id) : undefined }));
    },
  });
  const pending = (query.data ?? []).filter(row => isPendingRedemption(row.fulfillment_status));
  const rows = filter === 'pending' ? pending : query.data ?? [];
  return <div className="app-bg min-h-screen pb-mobile-safe">
    <InternalHeader title={es ? 'Bandeja de entrada' : 'Inbox'} subtitle="SC Points" backTo="/admin"
      actionSlot={<Button variant="ghost" size="icon" aria-label={es ? 'Actualizar' : 'Refresh'} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></Button>} />
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div className="flex gap-2" role="group" aria-label={es ? 'Filtrar canjes' : 'Filter redemptions'}>
        <Button variant={filter === 'all' ? 'default' : 'secondary'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{es ? 'Todos los canjes' : 'All redemptions'} ({query.data?.length ?? 0})</Button>
        <Button variant={filter === 'pending' ? 'default' : 'secondary'} aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>{es ? 'Pendientes' : 'Pending'} ({pending.length})</Button>
      </div>
      {query.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto my-12" /> : query.isError ?
        <p role="alert" className="text-destructive">{es ? 'No se pudieron cargar los canjes.' : 'Unable to load redemptions.'}</p> : rows.length === 0 ?
        <div className="py-12 text-center text-muted-foreground"><Inbox className="h-9 w-9 mx-auto mb-3" /><p>{es ? 'No hay canjes' : 'No redemptions'}</p></div> :
        <ul className="space-y-3">{rows.map(row => <li key={row.id} className="glass-card p-4">
          <div className="flex gap-3 items-start">
            <div className="bg-accent/15 text-accent rounded-lg p-2 shrink-0"><Gift className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <Button asChild variant="link" className="p-0 h-auto text-foreground whitespace-normal text-left justify-start"><Link to={`/admin/student/${row.user_id}`}>{row.studentName || (es ? 'Alumno' : 'Student')}<ChevronRight className="h-3 w-3" /></Link></Button>
              <p className="text-sm text-foreground mt-1 break-words">{row.rewardName || (row.reward_type === 'video_analysis' ? (es ? 'Análisis de video' : 'Video analysis') : row.reward_type.replace(/_/g, ' '))}</p>
              <p className="text-xs text-muted-foreground mt-2">{new Intl.DateTimeFormat(es ? 'es-MX' : 'en-US', { timeZone: 'America/Cancun', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(row.created_at))}</p>
            </div>
            <div className="text-right shrink-0"><p className="text-accent font-semibold text-sm">{row.cost}</p><p className="text-muted-foreground text-[10px]">SC Points</p></div>
          </div>
          <p className={`text-xs mt-3 ${isPendingRedemption(row.fulfillment_status) ? 'text-accent' : 'text-muted-foreground'}`}>{isPendingRedemption(row.fulfillment_status) ? (es ? 'Pendiente de entrega' : 'Awaiting fulfillment') : row.fulfillment_status === 'cancelled' ? (es ? 'Cancelado' : 'Cancelled') : (es ? 'Entregado / procesado' : 'Fulfilled / processed')}</p>
        </li>)}</ul>}
    </main>
  </div>;
}