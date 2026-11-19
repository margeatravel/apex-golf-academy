import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, Copy, Check, Ban, Plus, Search, RefreshCw, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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

type InviteRow = {
  id: string;
  code: string;
  inviter_id: string;
  inviter_is_coach: boolean;
  recipient_email: string | null;
  recipient_name: string | null;
  status: string;
  accepted_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  is_reusable: boolean;
  assigned_coach_id: string | null;
};

type StatusFilter = 'all' | 'active' | 'accepted' | 'expired';

type CodeKind = 'one_shot' | 'coach_code' | 'access_link';
type CoachOption = { id: string; name: string; email: string };

export default function AdminInviteCodes() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; email: string }>>({});
  const [redemptionCounts, setRedemptionCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genEmail, setGenEmail] = useState('');
  const [genName, setGenName] = useState('');
  const [genKind, setGenKind] = useState<CodeKind>('one_shot');
  const [genAssignCoach, setGenAssignCoach] = useState<string>('none');
  const [coachOptions, setCoachOptions] = useState<CoachOption[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);

  useEffect(() => {
    if (role && role !== 'admin') navigate('/not-authorized');
  }, [role, navigate]);

  async function load() {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('student_invites')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (rows ?? []) as InviteRow[];
      setInvites(list);

      const peopleIds = Array.from(
        new Set(
          list
            .flatMap((r) => [r.inviter_id, r.assigned_coach_id])
            .filter((v): v is string => !!v),
        ),
      );
      if (peopleIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', peopleIds);
        const map: Record<string, { name: string; email: string }> = {};
        (profs ?? []).forEach((p: any) => {
          map[p.id] = { name: p.full_name || p.email?.split('@')[0] || 'Unknown', email: p.email || '' };
        });
        setProfiles(map);
      }

      const reusableIds = list.filter((r) => r.is_reusable).map((r) => r.id);
      if (reusableIds.length) {
        const { data: reds } = await supabase
          .from('invite_redemptions')
          .select('invite_id')
          .in('invite_id', reusableIds);
        const counts: Record<string, number> = {};
        (reds ?? []).forEach((r: any) => {
          counts[r.invite_id] = (counts[r.invite_id] || 0) + 1;
        });
        setRedemptionCounts(counts);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Load list of admin/coach users for the "Assign to coach" dropdown.
  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      const opts: CoachOption[] = (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email?.split('@')[0] || 'Coach',
        email: p.email || '',
      }));
      opts.sort((a, b) => a.name.localeCompare(b.name));
      setCoachOptions(opts);
    })();
  }, []);

  function isExpired(row: InviteRow): boolean {
    if (row.status === 'expired') return true;
    const ts = new Date(row.expires_at).getTime();
    return !Number.isNaN(ts) && ts < Date.now();
  }

  function effectiveStatus(row: InviteRow): 'pending' | 'accepted' | 'expired' | 'cancelled' {
    if (row.status === 'accepted') return 'accepted';
    if (row.status === 'cancelled') return 'cancelled';
    if (isExpired(row)) return 'expired';
    return 'pending';
  }

  const filtered = useMemo(() => {
    return invites.filter((r) => {
      const eff = effectiveStatus(r);
      if (statusFilter === 'active' && eff !== 'pending') return false;
      if (statusFilter === 'accepted' && eff !== 'accepted') return false;
      if (statusFilter === 'expired' && !(eff === 'expired' || eff === 'cancelled')) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inv = profiles[r.inviter_id];
        const hay = [r.code, r.recipient_email, r.recipient_name, inv?.name, inv?.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invites, profiles, statusFilter, search]);

  async function handleCopy(code: string) {
    try {
      const url = `https://margeagolfacademy.com/auth?ref=${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(code);
      toast.success('Invite link copied');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Could not copy');
    }
  }

  async function handleRevoke(row: InviteRow) {
    try {
      const { error } = await supabase
        .from('student_invites')
        .update({ status: 'cancelled' })
        .eq('id', row.id);
      if (error) throw error;
      toast.success('Code revoked');
      setRevokeTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke');
    }
  }

  async function handleGenerate() {
    if (genKind === 'one_shot' && !genEmail.trim()) {
      toast.error('Enter a recipient email');
      return;
    }
    setGenerating(true);
    try {
      const payload =
        genKind === 'coach_code'
          ? { purpose: 'coach_code' as const }
          : genKind === 'access_link'
          ? {
              purpose: 'access_link' as const,
              assign_coach_id:
                genAssignCoach && genAssignCoach !== 'none' ? genAssignCoach : null,
            }
          : { recipient_email: genEmail.trim(), recipient_name: genName.trim() || null };
      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: payload,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Code created: ${(data as any)?.code ?? ''}`);
      setGenerateOpen(false);
      setGenEmail('');
      setGenName('');
      setGenKind('one_shot');
      setGenAssignCoach('none');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate code');
    } finally {
      setGenerating(false);
    }
  }

  function statusBadge(row: InviteRow) {
    const eff = effectiveStatus(row);
    const map: Record<string, { bg: string; color: string; label: string }> = {
      pending: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', label: 'Active' },
      accepted: { bg: 'rgba(74,124,89,0.2)', color: '#4a7c59', label: 'Accepted' },
      expired: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(245,240,232,0.6)', label: 'Expired' },
      cancelled: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Revoked' },
    };
    const s = map[eff];
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
        style={{ background: s.bg, color: s.color }}
      >
        {s.label}
      </span>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a1628' }}>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-1 text-sm text-ivory/60 hover:text-ivory transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-bold text-ivory flex items-center gap-2">
              <Ticket className="h-6 w-6 text-gold-accent" /> Invite Codes
            </h1>
            <p className="text-sm text-ivory/60 mt-1">
              Manage all invite & coach codes used for signup gating.
            </p>
          </div>
          <Button onClick={() => setGenerateOpen(true)} className="btn-green gap-2">
            <Plus className="h-4 w-4" /> Generate code
          </Button>
        </div>

        <div className="glass-card p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, email, inviter…"
                className="glass-input pl-9 h-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'active', 'accepted', 'expired'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 h-10 rounded-lg text-sm font-medium border transition-colors ${
                    statusFilter === s
                      ? 'bg-green-accent/20 border-green-accent/60 text-green-accent'
                      : 'bg-white/5 border-white/10 text-ivory/70 hover:bg-white/10'
                  }`}
                >
                  {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gold-accent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-ivory/50 text-sm">No invite codes match.</div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ivory/40 border-b border-white/10">
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Inviter</th>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Uses</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Expires</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const inv = profiles[row.inviter_id];
                    const eff = effectiveStatus(row);
                    const expiresLabel =
                      String(row.expires_at).startsWith('infinity') || row.is_reusable
                        ? 'Never'
                        : new Date(row.expires_at).toLocaleDateString();
                    return (
                      <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-3 font-mono text-ivory">{row.code}</td>
                        <td className="px-3 py-3">
                          {row.is_reusable && row.assigned_coach_id === null && !row.inviter_is_coach ? (
                            <Badge variant="outline" className="border-blue-400/40 text-blue-300">
                              Access link
                            </Badge>
                          ) : row.is_reusable && row.assigned_coach_id && row.assigned_coach_id !== row.inviter_id ? (
                            <Badge variant="outline" className="border-blue-400/40 text-blue-300">
                              Access link
                            </Badge>
                          ) : row.is_reusable ? (
                            <Badge variant="outline" className="border-gold-accent/40 text-gold-accent">
                              Coach
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-white/20 text-ivory/70">
                              One-shot
                            </Badge>
                          )}
                          {row.is_reusable && (row.assigned_coach_id || !row.inviter_is_coach) && (
                            <div className="text-[10px] text-ivory/40 mt-1">
                              {row.assigned_coach_id
                                ? `Assigns to: ${
                                    profiles[row.assigned_coach_id]?.name ?? '—'
                                  }`
                                : 'No coach assigned'}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ivory/80">
                          <div>{inv?.name ?? '—'}</div>
                          <div className="text-[11px] text-ivory/40">{inv?.email}</div>
                        </td>
                        <td className="px-3 py-3 text-ivory/80">
                          {row.recipient_email ? (
                            <>
                              <div>{row.recipient_name || '—'}</div>
                              <div className="text-[11px] text-ivory/40">{row.recipient_email}</div>
                            </>
                          ) : (
                            <span className="text-ivory/40">Anyone</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{statusBadge(row)}</td>
                        <td className="px-3 py-3 text-ivory/80">
                          {row.is_reusable
                            ? redemptionCounts[row.id] ?? 0
                            : row.status === 'accepted'
                            ? 1
                            : 0}
                        </td>
                        <td className="px-3 py-3 text-ivory/60 text-xs">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-ivory/60 text-xs">{expiresLabel}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleCopy(row.code)}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-white/5 border border-white/10 hover:bg-white/10"
                              title="Copy invite link"
                            >
                              {copied === row.code ? (
                                <Check className="h-4 w-4 text-green-accent" />
                              ) : (
                                <Copy className="h-4 w-4 text-ivory/70" />
                              )}
                            </button>
                            {eff === 'pending' && (
                              <button
                                onClick={() => setRevokeTarget(row)}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-red-500/10 border border-red-500/30 hover:bg-red-500/20"
                                title="Revoke"
                              >
                                <Ban className="h-4 w-4 text-red-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="glass-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-ivory">Generate invite code</DialogTitle>
            <DialogDescription className="text-ivory/60">
              One-shot invite for a specific email, your personal coach code, or an access link
              for students who train with another coach.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-ivory/80 text-xs uppercase tracking-wider">Code type</Label>
              <div className="grid gap-2">
                {([
                  {
                    value: 'one_shot' as const,
                    title: 'One-shot invite',
                    desc: 'Send to one specific email. Burns after signup.',
                  },
                  {
                    value: 'coach_code' as const,
                    title: 'My personal coach code',
                    desc: 'Reusable. Auto-links new students to me as their coach.',
                  },
                  {
                    value: 'access_link' as const,
                    title: 'Access link',
                    desc: 'Reusable. Optionally assigns to another coach, or no coach.',
                  },
                ]).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      genKind === opt.value
                        ? 'bg-green-accent/10 border-green-accent/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="codeKind"
                      value={opt.value}
                      checked={genKind === opt.value}
                      onChange={() => setGenKind(opt.value)}
                      className="mt-0.5 h-4 w-4 accent-green-accent"
                    />
                    <div className="min-w-0">
                      <div className="text-ivory text-sm font-semibold">{opt.title}</div>
                      <div className="text-ivory/50 text-[11px]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {genKind === 'access_link' && (
              <div className="space-y-2">
                <Label className="text-ivory/80">Assign new students to coach</Label>
                <select
                  value={genAssignCoach}
                  onChange={(e) => setGenAssignCoach(e.target.value)}
                  className="glass-input w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-ivory"
                >
                  <option value="none">None — student stays unassigned</option>
                  {coachOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ivory/50">
                  Students can later link to a coach themselves from their dashboard.
                </p>
              </div>
            )}

            {genKind === 'one_shot' && (
              <>
                <div className="space-y-2">
                  <Label className="text-ivory/80">Recipient email *</Label>
                  <Input
                    type="email"
                    value={genEmail}
                    onChange={(e) => setGenEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="glass-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-ivory/80">Recipient name (optional)</Label>
                  <Input
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    placeholder="Jane Doe"
                    className="glass-input"
                  />
                </div>
                <p className="text-[11px] text-ivory/50">
                  An invitation email will be sent automatically.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="btn-green">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Revoke this code?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              Code <span className="font-mono text-ivory">{revokeTarget?.code}</span> will no longer
              be usable for signup. Existing accounts already created with it are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}