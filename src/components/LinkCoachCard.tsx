import { useState } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  variant?: 'card' | 'banner';
  onLinked?: () => void;
}

/**
 * Lets a student enter a coach code at any time after sign-up to be linked
 * to a coach. Calls the shared `accept-invite` edge function — same code
 * path used at signup — which sets `assigned_coach_id` on the profile only
 * when the code belongs to a coach. Friend codes return inviter_is_coach
 * = false and the user is told to ask their coach for a coach code.
 */
export function LinkCoachCard({ variant = 'card', onLinked }: Props) {
  const { toast } = useToast();
  const { refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast({ title: t('misc.linkCoachEnterCodeTitle'), description: t('misc.linkCoachEnterCodeDesc'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-invite', { body: { code: trimmed } });
      if (error) {
        // supabase-js wraps non-2xx responses in FunctionsHttpError; the real
        // JSON body lives on error.context. Pull it out so we can show the
        // specific message from the edge function instead of the generic
        // "Edge Function returned a non-2xx status code".
        let body: any = null;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') body = await ctx.json();
          else if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            try { body = JSON.parse(txt); } catch { body = { error: txt }; }
          }
        } catch {
          // ignore parse failures and fall through to error.message
        }
        // eslint-disable-next-line no-console
        console.error('accept-invite failed', { error, body });
        const code = body?.code as string | undefined;
        const message = body?.error as string | undefined;
        let friendly = message || (error as any).message || t('misc.linkCoachDoubleCheck');
        if (code === 'self_invite' || message === 'You cannot accept your own invite') {
          friendly = t('coachLink.errSelfInvite');
        } else if (code === 'unauthorized' || message === 'Unauthorized') {
          friendly = t('coachLink.errUnauthorized');
        }
        toast({ title: t('coachLink.errGeneric'), description: friendly, variant: 'destructive' });
        return;
      }
      if (data?.error) throw new Error(data.error);

      if (data?.assigned_coach_id) {
        toast({
          title: t('misc.linkCoachLinkedTitle'),
          description: data.inviter_name ? t('misc.linkCoachLinkedWithName').replace('{name}', data.inviter_name) : t('misc.linkCoachAdded'),
        });
        await refreshProfile?.();
        onLinked?.();
      } else if (data?.inviter_is_coach === false) {
        toast({
          title: t('misc.linkCoachFriendCodeTitle'),
          description: t('misc.linkCoachFriendCodeDesc'),
          variant: 'destructive',
        });
      } else {
        toast({ title: t('misc.linkCoachAcceptedTitle'), description: t('misc.linkCoachThanks') });
        await refreshProfile?.();
        onLinked?.();
      }
      setCode('');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('accept-invite unexpected error', err);
      toast({ title: t('coachLink.errGeneric'), description: err?.message || t('misc.linkCoachDoubleCheck'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'banner') {
    return (
      <form
        onSubmit={submit}
        className="glass-card p-4 flex items-center gap-3 flex-wrap"
      >
        <div className="h-9 w-9 rounded-lg bg-green-accent/15 flex items-center justify-center shrink-0">
          <Link2 className="h-4 w-4 text-green-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ivory">{t('misc.linkCoachBannerTitle')}</p>
          <p className="text-[11px] text-ivory/50">{t('misc.linkCoachBannerDesc')}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={32}
            className="glass-input h-9 font-mono text-sm w-full sm:w-32"
          />
          <Button type="submit" disabled={loading} className="h-9 bg-green-accent text-ivory hover:bg-green-accent/90">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('misc.linkCoachBannerButton')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-white/10">
        <h3 className="section-header-gold flex items-center gap-2">
          <Link2 className="h-4 w-4" /> {t('misc.linkCoachCardTitle')}
        </h3>
        <p className="text-ivory/50 text-sm mt-1">
          {t('misc.linkCoachCardDesc')}
        </p>
      </div>
      <form onSubmit={submit} className="p-6 space-y-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. ABCD2345"
          maxLength={32}
          className="glass-input h-12 font-mono tracking-wider"
        />
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-green-accent text-ivory hover:bg-green-accent/90 font-semibold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
          {t('misc.linkCoachSubmitButton')}
        </Button>
      </form>
    </div>
  );
}

export default LinkCoachCard;