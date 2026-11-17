import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, UserPlus, Trash2, Star, ShieldCheck,
  Users, Calendar, DollarSign, UserCog, CreditCard, BarChart3, Settings,
  KeyRound, Lock, Copy, ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { STAFF_ACCESS_AREAS } from '../../supabase/functions/_shared/staff-scopes';
const STAFF_ICONS = { calendar: Calendar, pro_zone: Star, plans_billing: CreditCard, lesson_pricing: DollarSign, google_calendar: Calendar, stripe: CreditCard };

interface StaffRow {
  user_id: string;
  full_name: string | null;
  email: string;
  scopes: string[];
}

const SCOPES = STAFF_ACCESS_AREAS.map(area => ({ ...area, icon: STAFF_ICONS[area.id] }));

export default function AdminStaff() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['pro_zone']);
  const [pin, setPin] = useState('');
  const [inviting, setInviting] = useState(false);
  const [pinModal, setPinModal] = useState<{ user_id: string; email: string } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const showPinResult = async (email: string, pin: string) => {
    try {
      await navigator.clipboard.writeText(pin);
      toast.success(`PIN for ${email} copied to clipboard`, {
        description: `New access code: ${pin}`,
        duration: 12000,
      });
    } catch {
      toast.message(`PIN for ${email}`, {
        description: `New access code: ${pin}`,
        duration: 15000,
      });
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-staff', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return (data?.staff ?? []) as StaffRow[];
    },
  });

  const toggleScope = (id: string) => {
    setSelectedScopes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Email is required');
    if (selectedScopes.length === 0) return toast.error('Select at least one access area');
    if (pin.trim() && !/^\d{6,8}$/.test(pin.trim())) {
      return toast.error('PIN must be 6 to 8 digits (or leave blank to auto-generate)');
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-staff', {
        body: {
          action: 'invite',
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          scopes: selectedScopes,
          pin: pin.trim() || undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      const issuedPin: string | null = data?.pin ?? null;
      if (issuedPin) {
        await showPinResult(email.trim(), issuedPin);
      } else {
        toast.success(`Access granted to ${email}`);
      }
      setEmail('');
      setFullName('');
      setSelectedScopes(['pro_zone']);
      setPin('');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to invite');
    } finally {
      setInviting(false);
    }
  };

  const revokeScope = async (user_id: string, scope: string) => {
    const { error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'revoke', user_id, scope },
    });
    if (error) return toast.error(error.message);
    toast.success('Access revoked');
    qc.invalidateQueries({ queryKey: ['admin-staff'] });
  };

  const grantScope = async (user_id: string, scope: string) => {
    const { data, error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'grant', user_id, scope },
    });
    if (error || data?.error) return toast.error(data?.error || error?.message);
    toast.success('Access granted');
    qc.invalidateQueries({ queryKey: ['admin-staff'] });
  };

  // Non-destructive: removes only the staff row + scopes. Account, profile,
  // lessons, videos and every other record are preserved.
  const revokeStaffAccess = async (user_id: string, email: string) => {
    if (!confirm(
      `Quitar acceso staff a ${email}?\n\nSolo se elimina su acceso de staff y sus permisos. Conserva su cuenta, su login y todos sus datos (clases, videos, pagos): entrara como alumna normal.`
    )) return;
    const { data, error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'revoke_staff', user_id },
    });
    if (error || data?.error) return toast.error(data?.error || error?.message || 'Failed');
    toast.success('Acceso staff retirado. La cuenta se conserva como alumno.');
    qc.invalidateQueries({ queryKey: ['admin-staff'] });
  };

  const removeStaff = async (user_id: string) => {
    if (!confirm('BORRAR CUENTA COMPLETA. Esto elimina la cuenta, el login y TODOS sus datos (clases, videos, pagos), no solo el acceso staff. Esta accion es irreversible. Para conservar la cuenta usa "Quitar acceso staff".')) return;
    const { error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'remove', user_id },
    });
    if (error) return toast.error(error.message);
    toast.success('Staff member deleted');
    qc.invalidateQueries({ queryKey: ['admin-staff'] });
  };

  const openPinModal = (user_id: string, email: string) => {
    setPinModal({ user_id, email });
    setNewPin('');
  };

  const submitPin = async () => {
    if (!pinModal) return;
    if (newPin.trim() && !/^\d{6,8}$/.test(newPin.trim())) {
      return toast.error('PIN must be 6 to 8 digits (or leave blank to auto-generate)');
    }
    setSavingPin(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-staff', {
        body: { action: 'set_pin', user_id: pinModal.user_id, pin: newPin.trim() || undefined },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      const issued: string = data?.pin ?? newPin.trim();
      await showPinResult(pinModal.email, issued);
      setPinModal(null);
      setNewPin('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update PIN');
    } finally {
      setSavingPin(false);
    }
  };

  const clearPin = async (user_id: string, email: string) => {
    if (!confirm(`Disable login for ${email}? They will be locked out until you set a new PIN.`)) return;
    const { data, error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'clear_pin', user_id },
    });
    if (error || data?.error) return toast.error(data?.error || error?.message || 'Failed');
    toast.success(`Login disabled for ${email}`);
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.staffAccessTitle" subtitleKey="admin.staffAccessSub" backTo="/admin/settings" />
      <main className="px-4 py-6 space-y-6 max-w-3xl mx-auto">
        {/* Invite form */}
        <section className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
              <UserPlus className="h-4 w-4" style={{ color: '#4a7c59' }} />
            </div>
            <div>
              <h3 className="text-ivory text-base font-semibold">Invite a teammate</h3>
              <p className="text-xs text-ivory/50">You'll get a signup link to share — they sign up themselves and access is granted automatically.</p>
            </div>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="staff-email" className="text-ivory/70 text-xs">Email *</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@email.com"
                  className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-name" className="text-ivory/70 text-xs">Full name (optional)</Label>
                <Input
                  id="staff-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-ivory/70 text-xs">Access areas</Label>
              <div className="grid gap-2">
                {SCOPES.map((s) => {
                  const Icon = s.icon;
                  const checked = selectedScopes.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked ? 'bg-gold-accent/10 border-gold-accent/40' : 'bg-white/5 border-white/10 hover:bg-white/8'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleScope(s.id)}
                        className="mt-0.5"
                      />
                      <Icon className="h-4 w-4 text-gold-accent mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-ivory">{s.label}</div>
                        <div className="text-xs text-ivory/55">{s.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-pin" className="text-ivory/70 text-xs">
                Access PIN <span className="text-ivory/40">(6–8 digits — leave blank to auto-generate)</span>
              </Label>
              <Input
                id="staff-pin"
                inputMode="numeric"
                pattern="\d{6,8}"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="e.g. 482917"
                className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30 font-mono tracking-widest"
              />
              <p className="text-[11px] text-ivory/40">
                The PIN doubles as the staff member's password. They sign in with their email + this PIN.
              </p>
            </div>

            <Button type="submit" disabled={inviting} className="w-full gap-2 bg-gold-accent text-black hover:bg-gold-accent/90">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create / update staff account
            </Button>
          </form>
        </section>

        {/* Current staff */}
        <section className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.18)' }}>
              <ShieldCheck className="h-4 w-4 text-gold-accent" />
            </div>
            <div>
              <h3 className="text-ivory text-base font-semibold">Current staff</h3>
              <p className="text-xs text-ivory/50">People with limited admin access.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-ivory/40" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-ivory/50 py-4 text-center">No staff yet. Invite someone above.</p>
          ) : (
            <div className="space-y-3">
              {data.map((s) => (
                <div key={s.user_id} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ivory truncate">{s.full_name || s.email}</div>
                      <div className="text-xs text-ivory/50 truncate">{s.email}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPinModal(s.user_id, s.email)}
                        className="h-8 gap-1.5 px-2 text-ivory/70 hover:text-ivory hover:bg-white/10 text-xs"
                        title="Set or change access PIN"
                      >
                        <KeyRound className="h-4 w-4" />
                        <span className="hidden sm:inline">Set PIN</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearPin(s.user_id, s.email)}
                        className="h-8 px-2 text-ivory/50 hover:text-red-300 hover:bg-red-400/10"
                        title="Disable login (lock account)"
                      >
                        <Lock className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeStaffAccess(s.user_id, s.email)}
                        className="h-8 gap-1.5 px-2 text-ivory/70 hover:text-gold-accent hover:bg-gold-accent/10 text-xs"
                        title="Quitar acceso staff (conserva la cuenta)"
                      >
                        <ShieldOff className="h-4 w-4" />
                        <span className="hidden sm:inline">Quitar acceso staff</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStaff(s.user_id)}
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        title="Borrar cuenta completa y todos sus datos"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SCOPES.map((scope) => {
                      const has = s.scopes.includes(scope.id);
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          key={scope.id}
                          onClick={() => (has ? revokeScope(s.user_id, scope.id) : grantScope(s.user_id, scope.id))}
                          className={`h-auto text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            has
                              ? 'bg-gold-accent/15 border-gold-accent/40 text-gold-accent hover:bg-gold-accent/25'
                              : 'bg-white/5 border-white/10 text-ivory/50 hover:bg-white/10'
                          }`}
                        >
                          {has ? '✓ ' : '+ '}{scope.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <SocialFooter />

      {pinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !savingPin && setPinModal(null)}
        >
          <div
            className="glass-card max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-gold-accent/15">
                <KeyRound className="h-4 w-4 text-gold-accent" />
              </div>
              <div>
                <h3 className="text-ivory text-base font-semibold">Set access PIN</h3>
                <p className="text-xs text-ivory/50 truncate">{pinModal.email}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-staff-pin" className="text-ivory/70 text-xs">
                New PIN <span className="text-ivory/40">(leave blank to auto-generate)</span>
              </Label>
              <Input
                id="new-staff-pin"
                inputMode="numeric"
                pattern="\d{6,8}"
                maxLength={8}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="6 to 8 digits"
                className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30 font-mono tracking-widest"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setPinModal(null)}
                disabled={savingPin}
                className="text-ivory/70 hover:text-ivory hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={submitPin}
                disabled={savingPin}
                className="gap-2 bg-gold-accent text-black hover:bg-gold-accent/90"
              >
                {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                Save & copy
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}