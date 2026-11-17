import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, Users, UserPlus, Loader2, X, Check, Trash2, Baby as BabyIcon, Pencil } from 'lucide-react';
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
import { useFamilyAccess } from '@/hooks/useFamilyAccess';
import { FamilyTeaser } from '@/components/family/FamilyTeaser';
import { FamilyUpsellCard } from '@/components/family/FamilyUpsellCard';
import { ManagedMemberDialog } from '@/components/family/ManagedMemberDialog';

/** Max managed (account-less) family members per paid account. */
const MAX_MANAGED = 3;

interface LinkedProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  is_managed?: boolean | null;
  birth_date?: string | null;
}

type Relationship = 'papa' | 'mama' | 'hijo' | 'pareja';

const RELATIONSHIPS: { value: Relationship; key: string }[] = [
  { value: 'papa', key: 'misc.familyRelPapa' },
  { value: 'mama', key: 'misc.familyRelMama' },
  { value: 'hijo', key: 'misc.familyRelHijo' },
  { value: 'pareja', key: 'misc.familyRelPareja' },
];

/**
 * Student portal "Family" page: lists every account linked to the logged-in
 * user in BOTH directions of family_links (my children and my parents),
 * plus an additive block to invite another registered account as family.
 */
export default function StudentFamily() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Coach-made links do not grant access: the page opens only if the viewer
  // pays (or is in trial) or a linked relative pays. Inviting needs own plan.
  const { canInvite, canUseFamily, linkedCount, loading: paidLoading } = useFamilyAccess();
  const hasPaidPlan = canInvite;


  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LinkedProfile | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [toRemove, setToRemove] = useState<LinkedProfile | null>(null);
  const [memberDialog, setMemberDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<LinkedProfile | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['family-accounts', user?.id],
    queryFn: async (): Promise<LinkedProfile[]> => {
      if (!user?.id) return [];
      const [asParent, asChild] = await Promise.all([
        supabase.from('family_links').select('child_user_id').eq('parent_user_id', user.id),
        supabase.from('family_links').select('parent_user_id').eq('child_user_id', user.id),
      ]);
      const ids = Array.from(
        new Set([
          ...((asParent.data ?? []).map((l: any) => l.child_user_id as string)),
          ...((asChild.data ?? []).map((l: any) => l.parent_user_id as string)),
        ]),
      ).filter((id) => id && id !== user.id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, photo_url, is_managed, birth_date')
        .in('id', ids);
      return (profiles ?? []) as LinkedProfile[];
    },
    enabled: !!user?.id,
  });

  // ── Candidate search (SECURITY DEFINER RPC: students cannot read other profiles) ──
  const term = search.trim();
  const { data: candidates = [], isFetching: searching } = useQuery({
    queryKey: ['family-candidates', term],
    queryFn: async (): Promise<LinkedProfile[]> => {
      const { data, error } = await supabase.rpc('search_family_candidates', { _q: term });
      if (error) throw error;
      return (data ?? []) as LinkedProfile[];
    },
    enabled: term.length >= 2 && !selected,
  });

  // ── Sent (pending) invitations ────────────────────────────────────
  const { data: sent = [] } = useQuery({
    queryKey: ['family-requests-sent', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('family_link_requests')
        .select('id, to_user_id, relationship, created_at')
        .eq('from_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: people = [] } = useQuery({
    queryKey: ['family-request-people', user?.id],
    queryFn: async (): Promise<LinkedProfile[]> => {
      const { data, error } = await supabase.rpc('family_request_people');
      if (error) throw error;
      return (data ?? []) as LinkedProfile[];
    },
    enabled: !!user?.id,
  });
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
  const managedCount = accounts.filter((a) => a.is_managed).length;

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selected || !relationship) return;
      const { data, error } = await supabase
        .from('family_link_requests')
        .insert({
          from_user_id: user.id,
          to_user_id: selected.id,
          relationship,
          status: 'pending',
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      // Complementary email notice — never blocks the in-app invitation.
      if (data?.id) {
        try {
          await supabase.functions.invoke('send-family-invite', {
            body: { requestId: data.id, redirectOrigin: window.location.origin },
          });
        } catch (_) { /* best effort */ }
      }
    },
    onSuccess: () => {
      toast({ title: t('misc.familyInviteSent') });
      setSelected(null);
      setRelationship(null);
      setSearch('');
      qc.invalidateQueries({ queryKey: ['family-requests-sent', user?.id] });
      qc.invalidateQueries({ queryKey: ['family-request-people', user?.id] });
    },
    onError: (e: any) =>
      toast({ title: t('misc.familyInviteError'), description: e?.message, variant: 'destructive' }),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('family_link_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('misc.familyCancelled') });
      qc.invalidateQueries({ queryKey: ['family-requests-sent', user?.id] });
    },
    onError: (e: any) =>
      toast({ title: t('misc.familyCancelError'), description: e?.message, variant: 'destructive' }),
  });

  // Remove a family link. Deletes BOTH directions so symmetric ('pareja')
  // links disappear completely instead of leaving a mirror row behind.
  const removeMut = useMutation({
    mutationFn: async (otherId: string) => {
      if (!user?.id) return;
      const a = await supabase
        .from('family_links')
        .delete()
        .eq('parent_user_id', user.id)
        .eq('child_user_id', otherId);
      if (a.error) throw a.error;
      const b = await supabase
        .from('family_links')
        .delete()
        .eq('parent_user_id', otherId)
        .eq('child_user_id', user.id);
      if (b.error) throw b.error;
    },
    onSuccess: () => {
      toast({ title: t('misc.familyRemoved') });
      setToRemove(null);
      qc.invalidateQueries({ queryKey: ['family-accounts', user?.id] });
      qc.invalidateQueries({ queryKey: ['family-candidates'] });
    },
    onError: (e: any) =>
      toast({ title: t('misc.familyRemoveError'), description: e?.message, variant: 'destructive' }),
  });



  const avatar = (p: { full_name?: string | null; email?: string | null; photo_url?: string | null }, size = 'h-11 w-11') =>
    p.photo_url ? (
      <img src={p.photo_url} alt="" className={`${size} rounded-full object-cover`} />
    ) : (
      <div className={`${size} rounded-full bg-[#4a7c59]/40 flex items-center justify-center text-ivory text-sm font-semibold`}>
        {(p.full_name || p.email || '?').slice(0, 1).toUpperCase()}
      </div>
    );

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="misc.navFamily" subtitleKey="misc.familySubtitle" backTo="/dashboard" />

      <main className="container mx-auto px-4 py-6 max-w-2xl pb-24 space-y-6">
        {paidLoading || (!canUseFamily && isLoading) ? (
          <div className="h-48 rounded-2xl bg-ivory/5 border border-ivory/10 animate-pulse" />
        ) : !canUseFamily ? (
          <FamilyTeaser linkedCount={linkedCount} />

        ) : (
        <>
        {/* Free viewers linked by someone else: read-only list + upsell. */}
        {!hasPaidPlan && <FamilyUpsellCard />}

        {hasPaidPlan && (
        <>
        {/* ── Family member without an account ───────────────────── */}
        <section
          className="rounded-2xl px-4 py-4 border border-white/10 backdrop-blur-md space-y-2"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <Button
            variant="outline"
            className="w-full border-[#F0C040]/40 text-[#F0C040] hover:bg-[#F0C040]/10"
            disabled={managedCount >= MAX_MANAGED}
            onClick={() => { setEditingMember(null); setMemberDialog(true); }}
          >
            <BabyIcon className="h-4 w-4 mr-2" />
            {t('misc.managedAddButton')}
          </Button>
          <p className="text-xs text-ivory/50">
            {managedCount >= MAX_MANAGED ? t('misc.managedLimitReached') : t('misc.managedHelp')}
          </p>
        </section>

        {/* ── Invite a family member ─────────────────────────────── */}
        <section
          className="rounded-2xl px-4 py-4 border border-white/10 backdrop-blur-md space-y-3"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#F0C040]" />
            <h2 className="text-sm font-semibold text-ivory">{t('misc.familyInviteTitle')}</h2>
          </div>

          {selected ? (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-ivory/5 border border-[#F0C040]/30">
              {avatar(selected, 'h-9 w-9')}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ivory truncate">{selected.full_name || selected.email}</p>
                {selected.full_name && selected.email && (
                  <p className="text-xs text-ivory/50 truncate">{selected.email}</p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-ivory/60 hover:text-ivory"
                onClick={() => setSelected(null)}
                aria-label={t('misc.familyCancel')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('misc.familySearchPlaceholder')}
                className="bg-ivory/5 border-ivory/15 text-ivory placeholder:text-ivory/40"
              />
              {term.length > 0 && term.length < 2 && (
                <p className="text-xs text-ivory/40">{t('misc.familySearchHint')}</p>
              )}
              {term.length >= 2 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {searching ? (
                    <div className="flex items-center gap-2 text-ivory/60 text-sm py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : candidates.length === 0 ? (
                    <p className="text-xs text-ivory/40 py-2">{t('misc.familyNoResults')}</p>
                  ) : (
                    candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelected(c)}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2 bg-ivory/5 border border-ivory/10 hover:border-[#F0C040]/40 transition text-left"
                      >
                        {avatar(c, 'h-9 w-9')}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ivory truncate">{c.full_name || c.email}</p>
                          {c.full_name && c.email && (
                            <p className="text-xs text-ivory/50 truncate">{c.email}</p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-ivory/50">{t('misc.familyRelationship')}</p>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRelationship(r.value)}
                  className={`rounded-full px-3 py-1.5 text-sm border transition ${
                    relationship === r.value
                      ? 'border-[#F0C040] bg-[#F0C040]/15 text-[#F0C040]'
                      : 'border-ivory/15 bg-ivory/5 text-ivory/70 hover:border-ivory/30'
                  }`}
                >
                  {relationship === r.value && <Check className="inline h-3 w-3 mr-1" />}
                  {t(r.key)}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => sendMut.mutate()}
            disabled={!selected || !relationship || sendMut.isPending}
            className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('misc.familySendInvite')}
          </Button>

          <p className="text-xs text-ivory/50">{t('misc.familyInviteHelp')}</p>
        </section>

        {/* ── Sent invitations ───────────────────────────────────── */}
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ivory/50">{t('misc.familySentTitle')}</p>
          {sent.length === 0 ? (
            <p className="text-xs text-ivory/40">{t('misc.familySentEmpty')}</p>
          ) : (
            sent.map((r: any) => {
              const p = peopleMap[r.to_user_id];
              const relKey = RELATIONSHIPS.find((x) => x.value === r.relationship)?.key;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-ivory/5 border border-ivory/10"
                >
                  {avatar(p ?? {}, 'h-9 w-9')}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ivory truncate">
                      {p?.full_name || p?.email || r.to_user_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-ivory/50">{relKey ? t(relKey) : r.relationship}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-ivory/60 hover:text-red-400"
                    onClick={() => cancelMut.mutate(r.id)}
                    disabled={cancelMut.isPending}
                  >
                    {t('misc.familyCancel')}
                  </Button>
                </div>
              );
            })
          )}
        </section>
        </>
        )}

        {/* ── Linked accounts (existing) ─────────────────────────── */}
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ivory/50">{t('misc.familyLinkedTitle')}</p>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-ivory/5 border border-ivory/10 animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div
              className="w-full rounded-2xl px-5 py-8 border border-white/10 backdrop-blur-md text-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <Users className="h-6 w-6 text-[#F0C040] mx-auto mb-3" />
              <p className="text-sm text-ivory/70">{t('misc.familyEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1 rounded-xl bg-ivory/5 border border-ivory/10 hover:border-[#F0C040]/40 transition"
                >
                  <Link to={`/family/${a.id}`} className="flex items-center gap-3 flex-1 min-w-0 px-3 py-3">
                    {avatar(a)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm text-ivory truncate">{a.full_name || a.email}</p>
                        {a.is_managed && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide border border-[#F0C040]/40 text-[#F0C040]">
                            {t('misc.managedBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ivory/50">{t('home.viewProgress')}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ivory/40" />
                  </Link>
                  {a.is_managed && hasPaidPlan && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-ivory/50 hover:text-ivory"
                      aria-label={t('misc.managedEdit')}
                      onClick={() => { setEditingMember(a); setMemberDialog(true); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 mr-2 text-ivory/50 hover:text-red-400"
                    aria-label={t('misc.familyRemove')}
                    disabled={removeMut.isPending}
                    onClick={() => setToRemove(a)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </main>

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('misc.familyRemoveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('misc.familyRemoveConfirm').replace(
                '{name}',
                toRemove?.full_name || toRemove?.email || '',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('misc.familyCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toRemove) removeMut.mutate(toRemove.id);
              }}
              disabled={removeMut.isPending}
            >
              {t('misc.familyRemove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManagedMemberDialog
        open={memberDialog}
        onOpenChange={(o) => { setMemberDialog(o); if (!o) setEditingMember(null); }}
        member={editingMember}
        onSaved={() => qc.invalidateQueries({ queryKey: ['family-accounts', user?.id] })}
      />

      <SocialFooter />
    </div>
  );
}
