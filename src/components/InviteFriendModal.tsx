import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, Loader2, Mail, Hash, MessageCircle } from 'lucide-react';

interface Invite {
  id: string;
  code: string;
  recipient_email: string | null;
  recipient_name: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Inviter context — used for the share message. */
  inviterName?: string | null;
  /**
   * Which kind of invite this modal is sharing.
   * - 'friend' (default): legacy student-side flow — shows Email + Code tabs, copies just the code.
   * - 'coach_code': owner shares a reusable link that auto-assigns the invitee to them as coach.
   * - 'access_link': owner shares a reusable "member" link with no coach assignment.
   * Both owner flows hide the Email tab and copy/share the full signup URL.
   */
  purpose?: 'friend' | 'coach_code' | 'access_link';
  /** Pre-fetched invite code so the modal can skip a network roundtrip. */
  prefetchedCode?: string | null;
}

const APP_URL = 'https://margeagolfacademy.com';

export function InviteFriendModal({
  open,
  onOpenChange,
  inviterName,
  purpose = 'friend',
  prefetchedCode = null,
}: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'email' | 'code'>('code');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(prefetchedCode);
  const [copied, setCopied] = useState(false);

  const isOwnerLink = purpose === 'coach_code' || purpose === 'access_link';
  // All invite types show and share only the raw code (owner request: no link).
  const sharesFullUrl = false;
  const headerTitle =
    purpose === 'coach_code' ? 'Share your Coach code'
    : purpose === 'access_link' ? 'Share your access code'
    : 'Invite a friend';
  const headerDescription =
    purpose === 'coach_code'
      ? 'Anyone who signs up and enters this code is automatically linked to you as their coach.'
      : purpose === 'access_link'
      ? 'A reusable code that grants app access without assigning you as their coach. They sign up and enter this code.'
      : `Share your invite code with someone you play with. They sign up at ${APP_URL.replace('https://', '')} and enter your code.`;
  const chipLabel = purpose === 'coach_code' ? 'Coach code' : purpose === 'access_link' ? 'Access code' : null;
  const chipClass =
    purpose === 'coach_code'
      ? 'bg-green-accent/15 text-green-accent border-green-accent/40'
      : 'bg-gold-accent/15 text-gold-accent border-gold-accent/40';

  // Coach links share the full signup URL (auto-link). Friend + access codes share just the raw code.
  const shareUrl = shareCode ? `${APP_URL}/auth?ref=${shareCode}` : '';
  const shareValue = sharesFullUrl ? shareUrl : (shareCode ?? '');

  // Reset the local code whenever the modal switches between coach/member code
  // modes. Otherwise the previously-opened code can remain in state and make
  // the two invite types appear identical.
  useEffect(() => {
    if (!open) return;
    setShareCode(prefetchedCode ?? null);
    setCopied(false);
  }, [open, purpose, prefetchedCode]);

  // If the parent passed a fresh prefetched code while the modal is open, sync it.
  useEffect(() => {
    if (prefetchedCode && prefetchedCode !== shareCode) setShareCode(prefetchedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchedCode]);

  const loadInvites = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    let query = supabase
      .from('student_invites')
      .select('id, code, recipient_email, recipient_name, status, expires_at, created_at, accepted_at, is_reusable, inviter_is_coach, assigned_coach_id')
      .eq('inviter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    // Scope the recent-invites list and the auto-pick logic to the current purpose
    // so a friend code never shows up as a coach/member link, and vice versa.
    if (purpose === 'coach_code') {
      query = query.eq('is_reusable', true).eq('inviter_is_coach', true).is('assigned_coach_id', null);
    } else if (purpose === 'access_link') {
      query = query.eq('is_reusable', true).eq('inviter_is_coach', false).is('assigned_coach_id', null);
    }
    const { data } = await query;
    setInvites((data as Invite[]) ?? []);
    if (!shareCode) {
      // Reuse the most recent pending shareable code if there is one.
      // Reusable owner links are valid even after status flips, so accept those too.
      const sharable = (data as Invite[] | null)?.find((i) => {
        if (i.recipient_email) return false;
        if (new Date(i.expires_at) <= new Date()) return false;
        if (isOwnerLink) return true; // is_reusable already filtered above
        return i.status === 'pending';
      });
      if (sharable) setShareCode(sharable.code);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ensureShareCode = async () => {
    if (shareCode) return;
    setGeneratingCode(true);
    try {
      const body: Record<string, unknown> = {};
      if (purpose === 'coach_code') body.purpose = 'coach_code';
      else if (purpose === 'access_link') body.purpose = 'access_link';
      const { data, error } = await supabase.functions.invoke('create-invite', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShareCode(data?.code || data?.invite?.code || null);
      loadInvites();
    } catch (err: any) {
      toast({ title: 'Could not create invite code', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingCode(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'code' && !shareCode && !generatingCode) ensureShareCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const sendEmail = async () => {
    if (!recipientEmail.trim()) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: {
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Invitation sent', description: `${recipientEmail} will receive an email shortly.` });
      setRecipientEmail('');
      setRecipientName('');
      loadInvites();
    } catch (err: any) {
      toast({ title: 'Could not send invitation', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Clipboard with fallback: the Clipboard API is often blocked inside iframes
  // (preview) and some mobile browsers, so fall back to a hidden textarea.
  const writeClipboard = async (value: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  // Copy button copies ONLY the code.
  const copyCode = async () => {
    if (!shareCode) return;
    if (await writeClipboard(shareCode)) {
      setCopied(true);
      toast({ title: 'Código copiado', description: shareCode });
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({ title: 'No se pudo copiar', description: shareCode, variant: 'destructive' });
    }
  };

  const whatsappShare = async () => {
    if (!shareCode) return;
    const who = inviterName || 'a friend';
    const intro =
      purpose === 'coach_code'
        ? `${who} invited you to train at Margea Golf Academy ⛳ — entering this code links you as their student.`
        : purpose === 'access_link'
        ? `${who} invited you to Margea Golf Academy ⛳ — use this code to get app access.`
        : `${who} invited you to join Margea Golf Academy ⛳ — track lessons, swing videos and pro tips.`;
    const message = isOwnerLink
      ? shareCode
      : `${intro}\n\n` +
        `1. Sign up at ${APP_URL}\n` +
        `2. Enter invite code: ${shareCode}`;
    // Native share sheet first (mobile), then WhatsApp link, then clipboard.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Margea Golf Academy', text: message });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      if (await writeClipboard(message)) {
        toast({ title: 'Mensaje copiado', description: 'Pégalo en WhatsApp.' });
      } else {
        window.location.assign(url);
      }
    }
  };

  const statusLabel = (inv: Invite) => {
    if (inv.status === 'accepted') return { text: 'Joined', cls: 'bg-green-accent/20 text-green-accent border-green-accent/40' };
    if (inv.status === 'cancelled') return { text: 'Cancelled', cls: 'bg-white/10 text-ivory/50 border-white/20' };
    if (new Date(inv.expires_at) < new Date()) return { text: 'Expired', cls: 'bg-white/10 text-ivory/50 border-white/20' };
    return { text: 'Pending', cls: 'bg-gold-accent/15 text-gold-accent border-gold-accent/40' };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-ivory">{headerTitle}</DialogTitle>
            {chipLabel && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${chipClass}`}>{chipLabel}</span>
            )}
          </div>
          <DialogDescription className="text-ivory/60">{headerDescription}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'code')} className="w-full">
          {!isOwnerLink && (
            <TabsList className="grid grid-cols-2 w-full bg-white/5">
              <TabsTrigger value="code" className="data-[state=active]:bg-green-accent/20">
                <Hash className="h-4 w-4 mr-1.5" /> My code
              </TabsTrigger>
              <TabsTrigger value="email" className="data-[state=active]:bg-green-accent/20">
                <Mail className="h-4 w-4 mr-1.5" /> Email
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="code" className="space-y-3 pt-3">
            {generatingCode ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-green-accent" />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-ivory/80 text-xs">
                    {sharesFullUrl ? 'Your shareable link' : 'Your invite code'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={shareValue}
                      className={`glass-input ${sharesFullUrl ? 'text-xs text-left' : 'font-mono text-base tracking-widest text-center'}`}
                    />
                    <Button onClick={copyCode} variant="outline" size="icon" className="shrink-0" aria-label="Copiar código" title="Copiar código">
                      {copied ? <Check className="h-4 w-4 text-green-accent" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  {sharesFullUrl && shareCode && (
                    <p className="text-[11px] text-ivory/45 font-mono tracking-wider pt-0.5">Code: {shareCode}</p>
                  )}
                </div>
                <Button onClick={whatsappShare} className="w-full bg-[#25D366] text-white hover:bg-[#25D366]/90">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {isOwnerLink ? 'Compartir código' : 'Compartir (con código)'}
                </Button>
                <p className="text-[11px] text-ivory/50 text-center">
                  {isOwnerLink
                    ? 'Código reutilizable — compártelo con quien quieras.'
                    : `Code expires in 30 days. They sign up at ${APP_URL.replace('https://', '')} and enter this code.`}
                </p>
              </>
            )}
          </TabsContent>

          {!isOwnerLink && (
          <TabsContent value="email" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label className="text-ivory/80 text-xs">Their email</Label>
              <Input
                type="email"
                placeholder="friend@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="glass-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-ivory/80 text-xs">Their name (optional)</Label>
              <Input
                placeholder="Optional"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="glass-input"
              />
            </div>
            <Button onClick={sendEmail} disabled={sending} className="w-full bg-green-accent text-ivory hover:bg-green-accent/90">
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send invitation
            </Button>
          </TabsContent>
          )}
        </Tabs>

        <div className="mt-2 pt-3 border-t border-white/10">
          <p className="text-[11px] uppercase tracking-wider text-ivory/50 mb-2">Recent invites</p>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-ivory/50" /></div>
          ) : invites.length === 0 ? (
            <p className="text-xs text-ivory/40 italic py-2">No invitations yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {invites.map((inv) => {
                const s = statusLabel(inv);
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-xs bg-white/[0.03] px-2.5 py-2 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-ivory truncate">{inv.recipient_email || `Code · ${inv.code}`}</p>
                      <p className="text-ivory/40 text-[10px]">{new Date(inv.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default InviteFriendModal;