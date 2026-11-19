import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  UserPlus, Loader2, Trash2, Copy, Users, Mail, Shield, Eye, EyeOff, RefreshCw, ChevronDown, ChevronUp, GraduationCap,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Coach {
  id: string;
  email: string;
  full_name: string | null;
  photo_url: string | null;
  created_at: string;
  student_count: number;
  tier_breakdown?: Record<string, number>;
}

interface CoachStudent {
  id: string;
  email: string;
  full_name: string | null;
  photo_url: string | null;
  plan_tier: string | null;
  manual_plan_override: string | null;
  override_expires_at: string | null;
  trial_ends_at: string | null;
}

const TIER_LABEL: Record<string, string> = {
  apex: 'Apex',
  pro: 'Pro',
  scratch: 'Scratch',
  sc: 'SC',
  free: 'Free',
};
const TIER_COLOR: Record<string, string> = {
  apex: 'rgba(240,192,64,0.85)',
  pro: 'rgba(74,124,89,0.85)',
  scratch: 'rgba(96,165,250,0.75)',
  sc: 'rgba(168,85,247,0.75)',
  free: 'rgba(255,255,255,0.15)',
};

function effectiveTier(s: CoachStudent): string {
  const nowMs = Date.now();
  if (
    s.manual_plan_override &&
    ['scratch', 'pro', 'apex'].includes(s.manual_plan_override) &&
    (!s.override_expires_at || new Date(s.override_expires_at).getTime() > nowMs)
  ) return s.manual_plan_override;
  if (s.plan_tier && ['scratch', 'pro', 'apex'].includes(s.plan_tier)) return s.plan_tier;
  if (s.manual_plan_override) return 'sc';
  return 'free';
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5 space-y-4">{children}</div>;
}

function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

export function CoachManagementSection() {
  return <CoachManagementSectionInner />;
}

function CoachStudentsList({ coachId }: { coachId: string }) {
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['admin-coach-students', coachId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-coaches', {
        body: { action: 'students', coach_id: coachId },
      });
      if (error) throw error;
      return (data?.students ?? []) as CoachStudent[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-3 border-t border-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-ivory/30" />
      </div>
    );
  }
  if (students.length === 0) {
    return (
      <p className="text-center py-3 text-xs text-ivory/40 border-t border-white/5">Sin alumnos asignados.</p>
    );
  }
  return (
    <div className="border-t border-white/5 divide-y divide-white/5">
      {students.map((s) => {
        const t = effectiveTier(s);
        return (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2">
            <div className="h-6 w-6 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              {s.photo_url ? (
                <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-ivory/70 text-[9px] font-semibold">{(s.full_name || s.email).slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ivory truncate">{s.full_name || s.email}</p>
              <p className="text-[10px] text-ivory/40 truncate">{s.email}</p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: TIER_COLOR[t], color: t === 'free' ? '#E8D5B0' : '#0d1f18', fontWeight: 600 }}>
              {TIER_LABEL[t]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CoachManagementSectionInner() {
  const { role, setPreviewCoach, setPreviewTier } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Coach | null>(null);
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  const { data: coaches = [], isLoading } = useQuery({
    queryKey: ['admin-coaches'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-coaches', { body: { action: 'list' } });
      if (error) throw error;
      return (data?.coaches ?? []) as Coach[];
    },
    enabled: isAdmin,
  });

  const { data: previewPlans = [] } = useQuery({
    queryKey: ['billing-plans-preview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, tier_key, plan_type, sort_order')
        .in('plan_type', ['subscription', 'internal'])
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as { name: string; tier_key: string; plan_type: string; sort_order: number }[];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado`); }
    catch { toast.message(label, { description: text }); }
  };

  const showCredentials = async (e: string, p: string) => {
    const credText = `Email: ${e}\nContraseña: ${p}`;
    try { await navigator.clipboard.writeText(credText); } catch {}
    toast.success('Coach creado — credenciales copiadas', {
      description: credText,
      duration: 20000,
    });
  };

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!email.trim()) return toast.error('Email requerido');
    const pwd = password.trim() || genPassword();
    if (pwd.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-coaches', {
        body: { action: 'create', email: email.trim(), full_name: fullName.trim() || undefined, password: pwd },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      await showCredentials(email.trim(), pwd);
      setEmail(''); setFullName(''); setPassword(''); setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-coaches'] });
    } catch (e: any) {
      toast.error(e.message || 'Error creando coach');
    } finally { setBusy(false); }
  };


  const handleRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-coaches', {
        body: { action: 'remove', user_id: removeTarget.id, unassign_students: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      toast.success(`${removeTarget.full_name || removeTarget.email} eliminado`);
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-coaches'] });
    } catch (e: any) { toast.error(e.message || 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(240,192,64,0.2)' }}>
            <Shield className="h-4 w-4" style={{ color: '#F0C040' }} />
          </div>
          <div>
            <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>Coaches del portal</h3>
            <p style={{ color: '#E8D5B0', opacity: 0.55, fontSize: 12 }}>
              Agrega nuevos coaches. Cada uno entra con su email y contraseña y arranca con su propio espacio en blanco.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}
          className="h-8 text-xs bg-[#F0C040] hover:bg-[#d9ad36] text-[#0d1f18] border-0">
          <UserPlus className="h-3.5 w-3.5 mr-1" /> {showForm ? 'Cerrar' : 'Agregar coach'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-ivory/70">Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@margeagolfacademy.com" className="h-9 bg-white/5 border-white/10 text-ivory text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ivory/70">Nombre completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre del coach" className="h-9 bg-white/5 border-white/10 text-ivory text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ivory/70">Contraseña <span className="text-ivory/40">(deja en blanco para generar una)</span></Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres" className="h-9 bg-white/5 border-white/10 text-ivory text-sm pr-9" />
                <button type="button" onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-ivory">
                  {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => { setPassword(genPassword()); setShowPass(true); }}
                className="h-9 text-xs border-white/10 text-ivory/70 hover:text-ivory">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Generar
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy}
              className="h-9 text-xs bg-[#4a7c59] hover:bg-[#3d6a4c] text-white border-0">
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
              Crear coach
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-ivory/30" /></div>
        ) : coaches.length === 0 ? (
          <p className="text-center py-6 text-sm text-ivory/40">Aún no hay coaches agregados.</p>
        ) : coaches.map((c) => (
          <div key={c.id} className="rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
            <div className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: 'rgba(74,124,89,0.85)' }}>
              {c.photo_url ? (
                <img src={c.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-ivory text-xs font-semibold">{(c.full_name || c.email).slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-ivory">{c.full_name || c.email}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-ivory/40 truncate flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {c.email}
                </span>
                <button onClick={() => copy(c.email, 'Email')} className="text-ivory/30 hover:text-ivory">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              {c.tier_breakdown && Object.keys(c.tier_breakdown).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['apex', 'pro', 'scratch', 'sc', 'free'].map((t) => {
                    const n = c.tier_breakdown?.[t] ?? 0;
                    if (!n) return null;
                    return (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: TIER_COLOR[t], color: t === 'free' ? '#E8D5B0' : '#0d1f18', fontWeight: 600 }}>
                        {n} {TIER_LABEL[t]}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => setExpandedCoach(expandedCoach === c.id ? null : c.id)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-ivory/80 text-[10px]"
              title="Ver alumnos"
            >
              <Users className="h-3 w-3" /> {c.student_count}
              {expandedCoach === c.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigate(`/admin/coach-preview/${c.id}`);
              }}
              className="h-7 text-[11px] border-white/10 text-ivory/70 hover:text-ivory px-2"
              title="Ver el portal de este coach"
            >
              <Eye className="h-3 w-3 mr-1" /> Preview
            </Button>
            <Select
              onValueChange={(v) => {
                setPreviewTier(v as 'member' | 'family' | 'scratch' | 'pro' | 'apex', {
                  coachPricingId: c.id,
                });
                navigate('/dashboard');
              }}
            >
              <SelectTrigger
                className="h-7 text-[11px] border-white/10 text-ivory/70 hover:text-ivory px-2 w-[150px] bg-transparent"
                title={`Student Preview con pricing de ${c.full_name || c.email}`}
              >
                <GraduationCap className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Student Preview" />
              </SelectTrigger>
              <SelectContent
                className="z-[60] border shadow-lg"
                style={{
                  background: 'rgba(0,0,0,0.94)',
                  backdropFilter: 'blur(20px)',
                  borderColor: 'rgba(255,255,255,0.15)',
                  color: '#F5F0E8',
                }}
              >
                {previewPlans.map((p) => (
                  <SelectItem key={p.tier_key} value={p.tier_key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setRemoveTarget(c)}
              className="h-7 text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10 px-2">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {expandedCoach === c.id && <CoachStudentsList coachId={c.id} />}
          </div>
        ))}
      </div>

      {/* Remove coach dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent className="bg-[#1a2e23] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Eliminar coach</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              Esto eliminará la cuenta de <strong className="text-ivory">{removeTarget?.full_name || removeTarget?.email}</strong> y desvinculará a sus {removeTarget?.student_count ?? 0} alumno(s). Las lecciones y paquetes históricos del coach se mantienen en la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-ivory/60">Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={handleRemove} className="bg-red-600 hover:bg-red-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Eliminar coach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}