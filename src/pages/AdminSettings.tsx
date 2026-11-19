import { useState, useEffect } from 'react';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Globe, CreditCard, Upload, Calendar, LinkIcon, Copy, ExternalLink,
  Clock, Star, Zap, Crown, Trophy, Award, Pencil, Check, X, Plus, Trash2, Save, Loader2,
  RefreshCw, AlertTriangle, CheckCircle2, CloudOff, Cloud, DollarSign, Package, Sparkles, ShieldCheck, Mail, Video, Infinity,
  ArrowUp, ArrowDown, Palette, Bell
} from 'lucide-react';
import { fmtMXNStr } from '@/lib/formatCurrency';
import { deliverClientPlansPdf } from '@/lib/clientPlansPdf';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { AcademyKnowledgeBaseSection } from '@/components/admin/AcademyKnowledgeBaseSection';
import { FreeTrialSettingsSection } from '@/components/admin/FreeTrialSettingsSection';
import { CoachSettingsSection } from '@/components/admin/CoachSettingsSection';
import { GoogleCalendarConnect } from '@/components/GoogleCalendarConnect';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoLessonPricing } from '@/data/demoData';
import { RewardEditModal, type RewardRow } from '@/components/RewardEditModal';
import { buildTierTheme } from '@/lib/tierTheme';
import * as LucideIcons from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ICON_MAP: Record<string, any> = { Star, Zap, Crown, Trophy, Award };

/* ── Types ── */
interface TimezoneData { timezone: string; offset: string; note: string; }
interface PortalData { url: string; }
interface LessonTypeData { name: string; duration: string; description: string; }

// Per-tier monthly limit for student-uploaded "profile" videos.
// `null` = Unlimited.
interface VideoUploadLimitsData {
  free: number | null;
  member: number | null;
  scratch: number | null;
  pro: number | null;
  apex: number | null;
}

interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  excluded_features: string[];
  pro_zone_enabled: boolean;
  tier_key?: string | null;
  badge_label?: string | null;
  badge_icon?: string | null;
  color: string;
  color_opacity?: number | null;
  icon: string;
  price_amount: number;
  currency: string;
  billing_interval: string;
  plan_type: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  sync_status: string;
  sync_error: string | null;
  last_synced_at: string | null;
  is_active: boolean;
  access_rule: string | null;
  limits: string | null;
  sort_order: number;
  apex_ai_enabled: boolean;
}

/** A feature line stored with the "No incluye:" prefix renders as excluded. */
const EXCLUDED_PREFIX = /^\s*(No incluye:|Not included:)\s*/i;
export function parsePlanFeature(raw: string): { label: string; included: boolean } {
  const included = !EXCLUDED_PREFIX.test(raw || '');
  return { label: included ? raw : String(raw).replace(EXCLUDED_PREFIX, ''), included };
}

/* ── Shared ── */
function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5 space-y-4">{children}</div>;
}

/* ── ColorPicker (module-scope so it doesn't remount on each keystroke) ── */
const COLOR_SWATCHES = [
  '#9CA3AF', // neutral gray (Member)
  '#64748B', // slate
  '#4A7C59', // green (Scratch)
  '#10B981', // emerald
  '#22C55E', // lime green
  '#14B8A6', // teal
  '#0EA5E9', // cyan
  '#60A5FA', // sky
  '#3887FF', // blue (Apex)
  '#1D4ED8', // deep blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#EC4899', // pink
  '#EF4444', // red
  '#B91C1C', // deep red
  '#F97316', // orange
  '#F0C040', // brand gold
  '#D9AA42', // deep gold (Pro)
  '#92400E', // bronze
];

function ColorPicker({
  value, onChange, opacity, onOpacityChange,
}: {
  value: string;
  onChange: (v: string) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#9CA3AF';
  const theme = buildTierTheme(safe, opacity);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-10 gap-1.5">
        {COLOR_SWATCHES.map(c => {
          const selected = (value || '').toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              className={`h-6 w-6 rounded-md transition-transform ${selected ? 'scale-110 ring-2 ring-ivory ring-offset-1 ring-offset-transparent' : 'ring-1 ring-white/10 hover:scale-105'}`}
              style={{ background: c }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-10 rounded-md bg-white/5 border border-white/10 cursor-pointer p-0"
          title="Custom color"
        />
        <Input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className="bg-white/5 border-white/10 text-ivory h-8 text-sm flex-1 font-mono"
        />
        <div className="h-8 w-8 rounded-lg flex-shrink-0 border border-white/10" style={{ background: value || '#9CA3AF' }} />
      </div>
      {/* Opacity of the color overlay used across the student portal */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] w-14 flex-shrink-0" style={{ color: '#E8D5B0', opacity: 0.5 }}>Opacity</span>
        <input
          type="range"
          min={20}
          max={70}
          step={1}
          value={Math.round((opacity ?? 0.45) * 100)}
          onChange={e => onOpacityChange(Number(e.target.value) / 100)}
          className="flex-1 accent-[#F0C040] cursor-pointer"
        />
        <span className="text-[11px] w-9 text-right font-mono" style={{ color: '#E8D5B0', opacity: 0.7 }}>
          {Math.round((opacity ?? 0.45) * 100)}%
        </span>
      </div>
      {/* Live preview: same formula the student portal uses (getTierTheme) */}
      <div
        className="mt-1 rounded-lg overflow-hidden"
        style={{ border: `1px solid ${theme.border}` }}
      >
        <div className="p-2.5" style={{ background: theme.headerBg }}>
          <div className="flex items-center justify-between">
            <span style={{ color: '#F5F0E8', fontSize: 12, fontWeight: 700 }}>Header preview</span>
            <span
              className="px-2 py-0.5 rounded-full"
              style={{ background: theme.badge, color: '#0d1f18', fontSize: 10, fontWeight: 700 }}
            >
              Plan
            </span>
          </div>
        </div>
        <div className="p-2.5" style={{ background: theme.navBg }}>
          <span style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}>Bottom nav preview</span>
        </div>
      </div>
    </div>
  );
}

/** Flags plans that advertise a feature their access flags don't actually grant. */
export function PlanAccessWarning({ plan }: { plan: Partial<BillingPlan> }) {
  const included = (plan.features || []).join(' ').toLowerCase();
  const issues: string[] = [];
  if (!(plan.pro_zone_enabled ?? false) && included.includes('pro zone')) issues.push('Pro Zone');
  if (!(plan.apex_ai_enabled ?? true) && included.includes('apex ai')) issues.push('Apex AI');
  if (!issues.length) return null;
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
      <span style={{ color: '#fbbf24', fontSize: 11 }}>
        This plan lists {issues.join(' and ')} as included, but {issues.length > 1 ? 'those toggles are' : 'that toggle is'} off — students on this plan won't get access.
      </span>
    </div>
  );
}

/* ── PlanForm (module-scope so inputs keep focus while typing) ── */
function PlanForm({
  plan, onChange,
}: {
  plan: Partial<BillingPlan>;
  onChange: (field: string, value: any) => void;
}) {
  const features = plan.features || [];
  const excluded = plan.excluded_features || [];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Name</label>
        <Input value={plan.name || ''} onChange={e => onChange('name', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
      </div>
      <div>
        <label className="text-[10px] mb-0.5 flex items-center gap-1" style={{ color: '#E8D5B0', opacity: 0.5 }}>
          <Palette className="h-3 w-3" /> Color
        </label>
        <ColorPicker
          value={plan.color || ''}
          onChange={v => onChange('color', v)}
          opacity={plan.color_opacity ?? 0.45}
          onOpacityChange={v => onChange('color_opacity', v)}
        />
      </div>
      <div>
        <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Description</label>
        <Input value={plan.description || ''} onChange={e => onChange('description', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Price (cents)</label>
          <Input type="number" value={plan.price_amount || 0} onChange={e => onChange('price_amount', parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
        </div>
        <div>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Currency</label>
          <Input value={plan.currency || 'mxn'} onChange={e => onChange('currency', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
        </div>
        <div>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Interval</label>
          <select value={plan.billing_interval || 'month'} onChange={e => onChange('billing_interval', e.target.value)}
            className="w-full h-8 text-sm rounded-md bg-white/5 border border-white/10 text-ivory px-2">
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="one_time">One-time</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Plan Type</label>
          <select value={plan.plan_type || 'subscription'} onChange={e => onChange('plan_type', e.target.value)}
            className="w-full h-8 text-sm rounded-md bg-white/5 border border-white/10 text-ivory px-2">
            <option value="subscription">Subscription</option>
            <option value="one_time">One-time</option>
            <option value="internal">Internal (no billing)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Icon</label>
          <select value={plan.icon || 'Star'} onChange={e => onChange('icon', e.target.value)}
            className="w-full h-8 text-sm rounded-md bg-white/5 border border-white/10 text-ivory px-2">
            {Object.keys(ICON_MAP).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      {([
        { field: 'features', label: 'Included features', list: features, addLabel: 'Add included feature', color: 'text-green-400/70 hover:text-green-400' },
        { field: 'excluded_features', label: 'Not included', list: excluded, addLabel: 'Add "not included" line', color: 'text-ivory/50 hover:text-ivory' },
      ] as const).map(section => (
        <div key={section.field}>
          <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>{section.label}</label>
          {section.list.map((f: string, i: number) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <Input
                value={f}
                onChange={e => { const n = [...section.list]; n[i] = e.target.value; onChange(section.field, n); }}
                className="bg-white/5 border-white/10 text-ivory h-7 text-xs flex-1"
              />
              <Button size="sm" variant="ghost" onClick={() => onChange(section.field, moveInArray(section.list, i, -1))} disabled={i === 0} className="h-7 w-7 p-0 text-ivory/50 hover:text-ivory disabled:opacity-30" title="Move up"><ArrowUp className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(section.field, moveInArray(section.list, i, 1))} disabled={i === section.list.length - 1} className="h-7 w-7 p-0 text-ivory/50 hover:text-ivory disabled:opacity-30" title="Move down"><ArrowDown className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(section.field, section.list.filter((_, idx) => idx !== i))} className="h-7 w-7 p-0 text-red-400/60 hover:text-red-400"><X className="h-3 w-3" /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onChange(section.field, [...section.list, ''])} className={`h-6 text-xs px-2 gap-1 ${section.color}`}><Plus className="h-3 w-3" />{section.addLabel}</Button>
        </div>
      ))}
      <div>
        <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Access rule</label>
        <Input value={plan.access_rule || ''} onChange={e => onChange('access_rule', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
      </div>
      <div>
        <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Limits</label>
        <Input value={plan.limits || ''} onChange={e => onChange('limits', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={plan.is_active ?? true} onCheckedChange={v => onChange('is_active', v)} />
        <span style={{ color: '#E8D5B0', fontSize: 12 }}>Active</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={plan.apex_ai_enabled ?? true} onCheckedChange={v => onChange('apex_ai_enabled', v)} />
        <span style={{ color: '#E8D5B0', fontSize: 12 }}>Apex AI access</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={plan.pro_zone_enabled ?? false} onCheckedChange={v => onChange('pro_zone_enabled', v)} />
        <span style={{ color: '#E8D5B0', fontSize: 12 }}>Pro Zone access</span>
      </div>
      <PlanAccessWarning plan={plan} />

    </div>
  );
}

/** Move an item within an array by direction (-1 up, +1 down). Pure. */
function moveInArray<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = idx + dir;
  if (target < 0 || target >= next.length) return next;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

function SectionHeader({ icon: Icon, title, subtitle, editing, onEdit, onSave, onCancel, saving }: {
  icon: any; title: string; subtitle: string; editing?: boolean; onEdit?: () => void; onSave?: () => void; onCancel?: () => void; saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,124,89,0.2)' }}>
          <Icon className="h-4 w-4" style={{ color: '#4a7c59' }} />
        </div>
        <div>
          <h3 style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10">
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onSave} disabled={saving} className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-400/10">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </>
        ) : onEdit ? (
          <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 w-8 p-0 text-ivory/40 hover:text-ivory hover:bg-white/10">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function useSettings() {
  return useQuery({
    queryKey: ['academy-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('academy_settings').select('*');
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => { map[row.key] = row.value; });
      return map;
    },
  });
}

function useBillingPlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BillingPlan[];
    },
  });
}

async function saveSetting(key: string, value: any, userId: string) {
  // Upsert so first-time saves create the row instead of silently no-op'ing.
  const { error } = await supabase
    .from('academy_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId } as any,
      { onConflict: 'key' },
    );
  if (error) throw error;
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

/* ── Timezone ── */
function TimezoneSection({ data, userId }: { data: TimezoneData; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(data);
  const qc = useQueryClient();
  useEffect(() => { setDraft(data); }, [data]);

  const now = new Intl.DateTimeFormat('en-US', {
    timeZone: data.timezone || 'America/Cancun', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date());

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('timezone', draft, userId);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Timezone settings saved');
      setEditing(false);
    } catch { toast.error('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <SettingsCard>
      <SectionHeader icon={Globe} title="Timezone & Scheduling" subtitle="Canonical time for all scheduling" editing={editing} onEdit={() => setEditing(true)} onSave={handleSave} onCancel={() => { setEditing(false); setDraft(data); }} saving={saving} />
      <Separator className="bg-white/10" />
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#E8D5B0', opacity: 0.6 }}>Timezone IANA</label>
            <Input value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })} className="bg-white/5 border-white/10 text-ivory" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#E8D5B0', opacity: 0.6 }}>Offset label</label>
            <Input value={draft.offset} onChange={e => setDraft({ ...draft, offset: e.target.value })} className="bg-white/5 border-white/10 text-ivory" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#E8D5B0', opacity: 0.6 }}>Note</label>
            <Textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className="bg-white/5 border-white/10 text-ivory text-xs" rows={2} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div>
              <p style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 500 }}>Platform Timezone</p>
              <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 12 }}>All lessons & events use this timezone</p>
            </div>
            <Badge style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59', border: 'none', fontSize: 12 }}>
              <Clock className="h-3 w-3 mr-1" />
              {data.timezone} ({data.offset})
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>Current time</p>
            <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 500 }}>{now}</p>
          </div>
          {data.note && <p style={{ color: '#E8D5B0', opacity: 0.4, fontSize: 11 }}>{data.note}</p>}
        </div>
      )}
    </SettingsCard>
  );
}

/* ── Portal Link ── */
function PortalLinkSection({ data, userId }: { data: PortalData; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(data);
  const qc = useQueryClient();
  useEffect(() => { setDraft(data); }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('portal_link', draft, userId);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Portal link saved');
      setEditing(false);
    } catch { toast.error('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <SettingsCard>
      <SectionHeader icon={LinkIcon} title="Student Portal Access" subtitle="Link to share with students" editing={editing} onEdit={() => setEditing(true)} onSave={handleSave} onCancel={() => { setEditing(false); setDraft(data); }} saving={saving} />
      <Separator className="bg-white/10" />
      {editing ? (
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#E8D5B0', opacity: 0.6 }}>Student Login URL</label>
          <Input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} className="bg-white/5 border-white/10 text-ivory" />
        </div>
      ) : (
        <div className="py-2 px-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex-1 min-w-0 mr-3">
            <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 500 }}>Student Login URL</p>
            <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }} className="truncate">{data.url}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" className="gap-1 btn-glass text-xs" onClick={() => { navigator.clipboard.writeText(data.url); toast.success('Link copied!'); }}>
              <Copy className="h-3 w-3" /> Copy
            </Button>
            <Button size="sm" variant="outline" className="gap-1 btn-glass text-xs" onClick={() => window.open(data.url, '_blank')}>
              <ExternalLink className="h-3 w-3" /> Open
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

/* ── Billing Plans (Stripe-synced) ── */
export function BillingPlansSection() {
  const { data: plans = [], isLoading } = useBillingPlans();
  const { user } = useAuth();
  const isOwner = (user?.email || '').toLowerCase() === 'castilla.santi@gmail.com';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<BillingPlan>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newPlan, setNewPlan] = useState<Partial<BillingPlan>>({
    name: '', description: '', features: [], color: '#9ca3af', color_opacity: 0.45, icon: 'Star',
    price_amount: 0, currency: 'mxn', billing_interval: 'month', plan_type: 'subscription',
    is_active: true, access_rule: '', limits: '', sort_order: 99, apex_ai_enabled: true, excluded_features: [], pro_zone_enabled: false,
  });
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (plan: Partial<BillingPlan> & { id: string }) => {
      const { id, ...updates } = plan;
      // Fetch the current row so we can detect price-related changes and
      // automatically flip sync_status back to 'draft' when the price,
      // currency, or billing interval drifts from what's in Stripe. The
      // actual Stripe push only happens when the user clicks Sync.
      const { data: current } = await supabase
        .from('billing_plans')
        .select('price_amount, currency, billing_interval, sync_status')
        .eq('id', id)
        .maybeSingle();
      const priceChanged =
        current &&
        (current.price_amount !== (updates as any).price_amount ||
          current.currency !== (updates as any).currency ||
          current.billing_interval !== (updates as any).billing_interval);
      if (priceChanged && current?.sync_status === 'synced') {
        (updates as any).sync_status = 'draft';
      }
      const { error } = await supabase
        .from('billing_plans')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
      qc.invalidateQueries({ queryKey: ['subscription-billing-plans'] });
      setEditingId(null);
      toast.success('Plan saved');
    },
    onError: () => toast.error('Error saving plan'),
  });

  const createMutation = useMutation({
    mutationFn: async (plan: Partial<BillingPlan>) => {
      const { error } = await supabase
        .from('billing_plans')
        .insert(plan as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
      qc.invalidateQueries({ queryKey: ['subscription-billing-plans'] });
      setShowNewForm(false);
      setNewPlan({ name: '', description: '', features: [], color: '#9ca3af', color_opacity: 0.45, icon: 'Star', price_amount: 0, currency: 'mxn', billing_interval: 'month', plan_type: 'subscription', is_active: true, access_rule: '', limits: '', sort_order: 99, apex_ai_enabled: true, excluded_features: [], pro_zone_enabled: false });
      toast.success('Plan created');
    },
    onError: () => toast.error('Error creating plan'),
  });

  const syncMutation = useMutation({
    mutationFn: async (plan: BillingPlan) => {
      const { data, error } = await supabase.functions.invoke('sync-stripe-plan', {
        body: { action: 'sync', plan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
      qc.invalidateQueries({ queryKey: ['subscription-billing-plans'] });
      toast.success('Synced with Stripe successfully');
    },
    onError: (e: Error) => toast.error(`Stripe sync failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('billing_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
      qc.invalidateQueries({ queryKey: ['subscription-billing-plans'] });
      toast.success('Plan deleted');
    },
  });

  const startEdit = (plan: BillingPlan) => {
    setEditingId(plan.id);
    setDraft({ ...plan });
  };

  const SyncStatusBadge = ({ plan }: { plan: BillingPlan }) => {
    if (plan.plan_type === 'internal') {
      return <Badge style={{ background: 'rgba(255,255,255,0.06)', color: '#E8D5B0', border: 'none', fontSize: 10 }}>Internal</Badge>;
    }
    const colors: Record<string, { bg: string; text: string }> = {
      synced: { bg: 'rgba(74,124,89,0.2)', text: '#4a7c59' },
      draft: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
      error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
    };
    const c = colors[plan.sync_status] || colors.draft;
    const icons: Record<string, any> = { synced: CheckCircle2, draft: CloudOff, error: AlertTriangle };
    const StatusIcon = icons[plan.sync_status] || CloudOff;
    return (
      <Badge style={{ background: c.bg, color: c.text, border: 'none', fontSize: 10 }} className="gap-1">
        <StatusIcon className="h-3 w-3" />
        {plan.sync_status === 'synced' ? 'Synced' : plan.sync_status === 'error' ? 'Error' : 'Draft'}
      </Badge>
    );
  };

  const handleDraftChange = (field: string, value: any) => setDraft(prev => ({ ...prev, [field]: value }));
  const handleNewChange = (field: string, value: any) => setNewPlan(prev => ({ ...prev, [field]: value }));

  if (isLoading) return <SettingsCard><Loader2 className="h-5 w-5 animate-spin text-ivory/40 mx-auto" /></SettingsCard>;

  // Only show subscription/internal plans here — one-time products managed in Lesson Pricing
  const subscriptionPlans = plans.filter(p => p.plan_type === 'subscription' || p.plan_type === 'internal');

  return (
    <SettingsCard>
      <SectionHeader icon={CreditCard} title="Plans & Billing" subtitle="Manage plans, pricing, and Stripe integration" />
      <Separator className="bg-white/10" />

      {/* Subscription Plans */}
      <div>
        <p style={{ color: '#E8D5B0', fontSize: 13, fontWeight: 600 }} className="mb-2">Subscription Plans</p>
        <div className="grid gap-3">
          {subscriptionPlans.map(plan => {
            const IconComp = ICON_MAP[plan.icon] || Star;
            const isEditing = editingId === plan.id;
            return (
              <div key={plan.id} className="py-3 px-4 rounded-xl relative" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${plan.is_active ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.2)'}` }}>
                {isEditing ? (
                  <div className="space-y-3">
                    <PlanForm
                      plan={draft}
                      onChange={handleDraftChange}
                    />
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => saveMutation.mutate({ ...draft, id: plan.id } as any)} disabled={saveMutation.isPending}
                        className="gap-1" style={{ background: 'rgba(74,124,89,0.3)', color: '#4a7c59' }}>
                        {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-red-400/70"><X className="h-3 w-3 mr-1" />Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconComp className="h-4 w-4" style={{ color: plan.color }} />
                        <span style={{ color: plan.color, fontWeight: 600, fontSize: 15 }}>{plan.name}</span>
                        {!plan.is_active && <Badge style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'none', fontSize: 10 }}>Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <SyncStatusBadge plan={plan} />
                        {isOwner && (
                          <Button size="sm" variant="ghost" onClick={() => startEdit(plan)} className="h-7 w-7 p-0 text-ivory/40 hover:text-ivory">
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {plan.description && <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }} className="mb-2">{plan.description}</p>}
                    {plan.price_amount > 0 && (
                      <div className="mb-2">
                        <span style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700 }}>{formatPrice(plan.price_amount, plan.currency)}</span>
                        <span style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}> / {plan.billing_interval === 'one_time' ? 'one-time' : plan.billing_interval}</span>
                      </div>
                    )}
                    <ul className="space-y-1 mb-2">
                      {(plan.features || []).map((f: string, i: number) => {
                        const { label, included } = parsePlanFeature(f);
                        return (
                          <li
                            key={i}
                            style={{
                              color: '#E8D5B0',
                              opacity: included ? 0.7 : 0.35,
                              fontSize: 12,
                              textDecoration: included ? 'none' : 'line-through',
                            }}
                            className="flex items-center gap-2"
                          >
                            <span style={{ color: included ? '#4a7c59' : '#E8D5B0', opacity: included ? 1 : 0.5 }}>
                              {included ? '✓' : '–'}
                            </span>{' '}
                            {label}
                          </li>
                        );
                      })}
                      {((plan as any).excluded_features || []).map((f: string, i: number) => (
                        <li
                          key={`x-${i}`}
                          style={{ color: '#E8D5B0', opacity: 0.35, fontSize: 12, textDecoration: 'line-through' }}
                          className="flex items-center gap-2"
                        >
                          <span style={{ color: '#E8D5B0', opacity: 0.5 }}>–</span> {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mb-2"><PlanAccessWarning plan={plan as any} /></div>


                    {/* Stripe info */}
                    {plan.plan_type !== 'internal' && (
                      <div className="pt-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {plan.stripe_product_id && (
                          <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }} className="font-mono">Product: {plan.stripe_product_id}</p>
                        )}
                        {plan.stripe_price_id && (
                          <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }} className="font-mono">Price: {plan.stripe_price_id}</p>
                        )}
                        {plan.last_synced_at && (
                          <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }}>Last synced: {new Date(plan.last_synced_at).toLocaleString()}</p>
                        )}
                        {plan.sync_error && (
                          <p style={{ color: '#ef4444', fontSize: 11 }} className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {plan.sync_error}
                          </p>
                        )}
                        {isOwner && (
                          <Button size="sm" variant="ghost" onClick={() => syncMutation.mutate(plan)}
                            disabled={syncMutation.isPending}
                            className="h-7 text-xs gap-1 mt-1" style={{ color: '#60a5fa' }}>
                            {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Sync to Stripe
                          </Button>
                        )}
                      </div>
                    )}

                    {plan.access_rule && (
                      <p style={{ color: '#60a5fa', opacity: 0.8, fontSize: 11 }} className="mt-1"><span style={{ fontWeight: 600 }}>Access:</span> {plan.access_rule}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>



      {/* New plan form */}
      {!isOwner ? null : showNewForm ? (
        <div className="py-3 px-4 rounded-xl" style={{ background: 'rgba(74,124,89,0.08)', border: '1px dashed rgba(74,124,89,0.3)' }}>
          <p style={{ color: '#4a7c59', fontSize: 13, fontWeight: 600 }} className="mb-3">New Subscription Plan</p>
          <PlanForm
            plan={newPlan}
            onChange={handleNewChange}
          />
          <div className="flex gap-2 pt-3">
            <Button size="sm" onClick={() => createMutation.mutate(newPlan)} disabled={createMutation.isPending || !newPlan.name}
              className="gap-1" style={{ background: 'rgba(74,124,89,0.3)', color: '#4a7c59' }}>
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Create Plan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)} className="text-red-400/70">Cancel</Button>
          </div>
          <p style={{ color: '#E8D5B0', opacity: 0.4, fontSize: 10 }} className="mt-2">
            After creating, click "Sync to Stripe" to create the matching Stripe product and price.
          </p>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setShowNewForm(true)} className="w-full h-10 border border-dashed border-white/10 text-ivory/40 hover:text-ivory hover:bg-white/5 gap-2">
          <Plus className="h-4 w-4" /> Add New Plan
        </Button>
      )}
    </SettingsCard>
  );
}

/* ── Availability shortcut ── */
function AvailabilityLinkSection() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/admin/availability')} className="glass-card w-full p-5 flex items-center justify-between text-left hover:border-gold/40 transition">
      <div>
        <p className="font-heading text-lg text-ivory">Availability</p>
        <p className="text-sm text-ivory/60">Horarios disponibles y días bloqueados</p>
      </div>
      <span className="text-gold text-xl">→</span>
    </button>
  );
}

/* ── Profile Video Upload Limits ── */
const DEFAULT_VIDEO_LIMITS: VideoUploadLimitsData = { free: 0, member: 0, scratch: 4, pro: 10, apex: null };

function VideoUploadLimitsSection({ data, userId }: { data: VideoUploadLimitsData; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<VideoUploadLimitsData>(data);
  const qc = useQueryClient();
  useEffect(() => { setDraft(data); }, [data]);

  const tiers: Array<{ key: keyof VideoUploadLimitsData; label: string; color: string; sub: string }> = [
    { key: 'free',    label: 'Free',    color: '#94a3b8', sub: 'No paid plan' },
    { key: 'member',  label: 'Free',    color: '#94a3b8', sub: 'Free plan' },
    { key: 'scratch', label: 'Scratch', color: '#9CA3AF', sub: 'Entry membership' },
    { key: 'pro',     label: 'Pro',     color: '#4a7c59', sub: 'Most popular' },
    { key: 'apex',    label: 'Apex',    color: '#D9AA42', sub: 'Signature program' },
  ];

  const setLimit = (key: keyof VideoUploadLimitsData, value: number | null) => {
    setDraft({ ...draft, [key]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('video_upload_limits', draft, userId);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Upload limits saved');
      setEditing(false);
    } catch { toast.error('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <SettingsCard>
      <SectionHeader
        icon={Video}
        title="Profile Video Upload Limits"
        subtitle="Monthly cap for personal profile videos by membership tier"
        editing={editing}
        onEdit={() => setEditing(true)}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setDraft(data); }}
        saving={saving}
      />
      <Separator className="bg-white/10" />
      {!editing && (
        <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 12 }}>
          Counts videos uploaded by the student to their personal profile (not lesson videos) per calendar month.
        </p>
      )}
      <div className="grid gap-3">
        {tiers.map(({ key, label, color, sub }) => {
          const value = (editing ? draft[key] : data[key]);
          const isUnlimited = value === null || value === undefined;
          return (
            <div key={key} className="py-3 px-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}30` }}>
                    <Video className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <div style={{ color, fontWeight: 600, fontSize: 14 }}>{label}</div>
                    <div style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>{sub}</div>
                  </div>
                </div>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px]" style={{ color: '#E8D5B0', opacity: 0.7 }}>
                      <Switch
                        checked={isUnlimited}
                        onCheckedChange={(checked) => setLimit(key, checked ? null : 4)}
                      />
                      Unlimited
                    </label>
                    {!isUnlimited && (
                      <Input
                        type="number"
                        min={0}
                        value={value as number}
                        onChange={(e) => setLimit(key, Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                        className="bg-white/5 border-white/10 text-ivory h-8 text-sm w-20"
                      />
                    )}
                    <span className="text-[11px]" style={{ color: '#E8D5B0', opacity: 0.5 }}>/ month</span>
                  </div>
                ) : (
                  <Badge style={{ background: 'rgba(255,255,255,0.06)', color: '#E8D5B0', border: 'none', fontSize: 12 }}>
                    {isUnlimited ? (
                      <span className="flex items-center gap-1"><Infinity className="h-3 w-3" /> Unlimited</span>
                    ) : (
                      <>{value} / month</>
                    )}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
}

/* ── Lesson Types ── */
function LessonTypesSection({ data, userId }: { data: LessonTypeData[]; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LessonTypeData[]>(data);
  const qc = useQueryClient();
  useEffect(() => { setDraft(data); }, [data]);

  const updateType = (idx: number, field: keyof LessonTypeData, value: string) => {
    const next = [...draft];
    next[idx] = { ...next[idx], [field]: value };
    setDraft(next);
  };
  const addType = () => setDraft([...draft, { name: '', duration: '', description: '' }]);
  const removeType = (idx: number) => setDraft(draft.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('lesson_types', draft, userId);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Lesson types saved');
      setEditing(false);
    } catch { toast.error('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <SettingsCard>
      <SectionHeader icon={Calendar} title="Lesson Types" subtitle="Service types offered to students" editing={editing} onEdit={() => setEditing(true)} onSave={handleSave} onCancel={() => { setEditing(false); setDraft(data); }} saving={saving} />
      <Separator className="bg-white/10" />
      <div className="space-y-2">
        {(editing ? draft : data).map((t, idx) => (
          <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {editing ? (
              <div className="flex items-center gap-2 w-full">
                <Input value={t.name} onChange={e => updateType(idx, 'name', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs flex-1" placeholder="Name" />
                <Input value={t.duration} onChange={e => updateType(idx, 'duration', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs w-24" placeholder="Duration" />
                <Button size="sm" variant="ghost" onClick={() => removeType(idx)} className="h-7 w-7 p-0 text-red-400/60 hover:text-red-400"><Trash2 className="h-3 w-3" /></Button>
              </div>
            ) : (
              <>
                <div>
                  <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 500 }}>{t.name}</p>
                  <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>{t.description}</p>
                </div>
                <Badge style={{ background: 'rgba(255,255,255,0.06)', color: '#E8D5B0', border: 'none', fontSize: 11 }}>{t.duration}</Badge>
              </>
            )}
          </div>
        ))}
        {editing && (
          <Button variant="ghost" onClick={addType} className="w-full h-9 border border-dashed border-white/10 text-ivory/40 hover:text-ivory hover:bg-white/5 gap-2 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Lesson Type
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}

/* ── Lesson Pricing ── */
interface PricingPackage { lessons: number; price: number; price_id: string; pro_price: number; }
interface AdditionalProduct { name: string; price: number; price_id: string; description: string; all_tiers: boolean; }
export interface LessonPricingData {
  individual_price: number;
  pro_individual_price: number;
  individual_price_id: string;
  packages: PricingPackage[];
  additional_products?: AdditionalProduct[];
}

export const DEFAULT_PRICING: LessonPricingData = {
  individual_price: 1650,
  pro_individual_price: 1300,
  individual_price_id: '',
  packages: [
    { lessons: 10, price: 14850, price_id: '', pro_price: 12000 },
    { lessons: 20, price: 26500, price_id: '', pro_price: 22000 },
    { lessons: 30, price: 34650, price_id: '', pro_price: 30000 },
  ],
  additional_products: [
    { name: 'Video Analysis', price: 550, price_id: '', description: 'Video analysis with coach feedback', all_tiers: true },
  ],
};

export function LessonPricingSection({ data, userId }: { data: LessonPricingData; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LessonPricingData>(data);
  const qc = useQueryClient();
  useEffect(() => { setDraft(data); }, [data]);
  const demo = isDemoModeActive();

  const updatePackage = (idx: number, field: keyof PricingPackage, value: any) => {
    const next = { ...draft, packages: [...draft.packages] };
    next.packages[idx] = { ...next.packages[idx], [field]: value };
    setDraft(next);
  };
  const addPackage = () => {
    setDraft({ ...draft, packages: [...draft.packages, { lessons: 0, price: 0, price_id: '', pro_price: 0 }] });
  };
  const removePackage = (idx: number) => {
    setDraft({ ...draft, packages: draft.packages.filter((_, i) => i !== idx) });
  };

  const updateProduct = (idx: number, field: keyof AdditionalProduct, value: any) => {
    const prods = [...(draft.additional_products || [])];
    prods[idx] = { ...prods[idx], [field]: value };
    setDraft({ ...draft, additional_products: prods });
  };
  const addProduct = () => {
    setDraft({ ...draft, additional_products: [...(draft.additional_products || []), { name: '', price: 0, price_id: '', description: '', all_tiers: true }] });
  };
  const removeProduct = (idx: number) => {
    setDraft({ ...draft, additional_products: (draft.additional_products || []).filter((_, i) => i !== idx) });
  };

  const handleSave = async () => {
    if (demo) {
      toast.error('Lectura sola en Modo Demo');
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // Per-coach pricing: save into this coach's own row.
      const { error } = await supabase
        .from('coach_lesson_pricing' as any)
        .upsert(
          { coach_id: userId, pricing: draft as any, updated_at: new Date().toISOString(), updated_by: userId } as any,
          { onConflict: 'coach_id' },
        );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['coach-lesson-pricing'] });
      qc.invalidateQueries({ queryKey: ['coach-own-pricing', userId] });
      toast.success('Lesson pricing saved');
      setEditing(false);
    } catch (e: any) { toast.error(e?.message || 'Error saving'); }
    finally { setSaving(false); }
  };

  const additionalProducts = data.additional_products || [];

  return (
    <SettingsCard>
      <SectionHeader
        icon={DollarSign}
        title="Lesson & Package Pricing"
        subtitle="Source of truth for all one-time lesson and package pricing"
        editing={editing}
        onEdit={demo ? undefined : () => setEditing(true)}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setDraft(data); }}
        saving={saving}
      />
      <Separator className="bg-white/10" />

      {editing ? (
        <div className="space-y-5">
          {/* Individual Lesson */}
          <div>
            <p style={{ color: '#E8D5B0', fontSize: 13, fontWeight: 600 }} className="mb-2">Individual Lesson</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Standard Price (MXN)</label>
                <Input type="number" value={draft.individual_price} onChange={e => setDraft({ ...draft, individual_price: parseInt(e.target.value) || 0 })} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
              </div>
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: '#D9AA42', opacity: 0.8 }}>Pro Plan Price (MXN)</label>
                <Input type="number" value={draft.pro_individual_price} onChange={e => setDraft({ ...draft, pro_individual_price: parseInt(e.target.value) || 0 })} className="bg-white/5 border-white/10 text-ivory h-8 text-sm" />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Stripe Price ID</label>
              <Input value={draft.individual_price_id} onChange={e => setDraft({ ...draft, individual_price_id: e.target.value })} className="bg-white/5 border-white/10 text-ivory h-7 text-xs font-mono" placeholder="price_..." />
            </div>
          </div>

          {/* Packages */}
          <div>
            <p style={{ color: '#E8D5B0', fontSize: 13, fontWeight: 600 }} className="mb-2">Lesson Packages</p>
            <div className="space-y-3">
              {draft.packages.map((pkg, idx) => (
                <div key={idx} className="py-3 px-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 600 }}>Package {idx + 1}</p>
                    <Button size="sm" variant="ghost" onClick={() => removePackage(idx)} className="h-7 w-7 p-0 text-red-400/60 hover:text-red-400"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Lessons</label>
                      <Input type="number" value={pkg.lessons} onChange={e => updatePackage(idx, 'lessons', parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Standard Price (MXN)</label>
                      <Input type="number" value={pkg.price} onChange={e => updatePackage(idx, 'price', parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#D9AA42', opacity: 0.8 }}>Pro Plan Price (MXN)</label>
                      <Input type="number" value={pkg.pro_price} onChange={e => updatePackage(idx, 'pro_price', parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Stripe Price ID</label>
                      <Input value={pkg.price_id} onChange={e => updatePackage(idx, 'price_id', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs font-mono" placeholder="price_..." />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="ghost" onClick={addPackage} className="w-full h-9 border border-dashed border-white/10 text-ivory/40 hover:text-ivory hover:bg-white/5 gap-2 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Package
              </Button>
            </div>
          </div>

          {/* Additional Products (edit) */}
          <div>
            <p style={{ color: '#E8D5B0', fontSize: 13, fontWeight: 600 }} className="mb-2">Additional Products</p>
            <div className="space-y-3">
              {(draft.additional_products || []).map((prod, idx) => (
                <div key={idx} className="py-3 px-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <p style={{ color: '#F5F0E8', fontSize: 13, fontWeight: 600 }}>{prod.name || `Product ${idx + 1}`}</p>
                    <Button size="sm" variant="ghost" onClick={() => removeProduct(idx)} className="h-7 w-7 p-0 text-red-400/60 hover:text-red-400"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Product Name</label>
                      <Input value={prod.name} onChange={e => updateProduct(idx, 'name', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" placeholder="e.g. Video Analysis" />
                    </div>
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Price (MXN)</label>
                      <Input type="number" value={prod.price} onChange={e => updateProduct(idx, 'price', parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Description</label>
                      <Input value={prod.description} onChange={e => updateProduct(idx, 'description', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs" placeholder="Short description" />
                    </div>
                    <div>
                      <label className="text-[10px] mb-0.5 block" style={{ color: '#E8D5B0', opacity: 0.5 }}>Stripe Price ID</label>
                      <Input value={prod.price_id} onChange={e => updateProduct(idx, 'price_id', e.target.value)} className="bg-white/5 border-white/10 text-ivory h-7 text-xs font-mono" placeholder="price_..." />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={prod.all_tiers} onCheckedChange={v => updateProduct(idx, 'all_tiers', v)} />
                    <span style={{ color: '#E8D5B0', fontSize: 11 }}>Available to all tiers</span>
                  </div>
                </div>
              ))}
              <Button variant="ghost" onClick={addProduct} className="w-full h-9 border border-dashed border-white/10 text-ivory/40 hover:text-ivory hover:bg-white/5 gap-2 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Product
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Individual Lesson Display */}
          <div className="py-3 px-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-1">
              <p style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>Individual Lesson</p>
              <p style={{ color: '#E8D5B0', fontSize: 16, fontWeight: 700 }}>{fmtMXNStr(data.individual_price)} MXN</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Crown className="h-3 w-3" style={{ color: '#D9AA42' }} />
                <span className="text-[11px] font-medium" style={{ color: '#D9AA42' }}>With Pro Plan</span>
              </div>
              <p className="text-[11px] font-medium" style={{ color: '#D9AA42' }}>{fmtMXNStr(data.pro_individual_price)} MXN</p>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {data.individual_price_id ? (
                <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }} className="font-mono truncate flex-1 mr-2">{data.individual_price_id}</p>
              ) : (
                <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }}>Not linked to Stripe</p>
              )}
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2 flex-shrink-0" style={{ color: '#60a5fa' }}
                onClick={() => toast.info('Link to Stripe will be available when you are ready to connect this product.')}>
                <LinkIcon className="h-3 w-3" /> Link to Stripe
              </Button>
            </div>
          </div>

          {/* Packages Display */}
          {data.packages.map((pkg, idx) => (
            <div key={idx} className="py-3 px-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{pkg.lessons} Lessons</p>
                  <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>{pkg.lessons > 0 ? `${fmtMXNStr(Math.round(pkg.price / pkg.lessons))} per lesson` : ''}</p>
                </div>
                <p style={{ color: '#E8D5B0', fontSize: 16, fontWeight: 700 }}>{fmtMXNStr(pkg.price)} MXN</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Crown className="h-3 w-3" style={{ color: '#D9AA42' }} />
                  <span className="text-[11px] font-medium" style={{ color: '#D9AA42' }}>With Pro Plan</span>
                </div>
                <p className="text-[11px] font-medium" style={{ color: '#D9AA42' }}>
                  {fmtMXNStr(pkg.pro_price)} MXN {pkg.lessons > 0 ? `(${fmtMXNStr(Math.round(pkg.pro_price / pkg.lessons))} ea.)` : ''}
                </p>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {pkg.price_id ? (
                  <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }} className="font-mono truncate flex-1 mr-2">{pkg.price_id}</p>
                ) : (
                  <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }}>Not linked to Stripe</p>
                )}
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2 flex-shrink-0" style={{ color: '#60a5fa' }}
                  onClick={() => toast.info('Link to Stripe will be available when you are ready to connect this product.')}>
                  <LinkIcon className="h-3 w-3" /> Link to Stripe
                </Button>
              </div>
            </div>
          ))}

          {/* Additional Products Display */}
          {additionalProducts.length > 0 && (
            <>
              <Separator className="bg-white/10" />
              <p style={{ color: '#E8D5B0', fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Additional Products</p>
              {additionalProducts.map((prod, idx) => (
                <div key={idx} className="py-3 px-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600 }}>{prod.name}</p>
                      {prod.description && <p style={{ color: '#E8D5B0', opacity: 0.5, fontSize: 11 }}>{prod.description}</p>}
                    </div>
                    <p style={{ color: '#E8D5B0', fontSize: 16, fontWeight: 700 }}>{fmtMXNStr(prod.price)} MXN</p>
                  </div>
                  {prod.all_tiers && (
                    <p className="text-[10px] font-medium" style={{ color: '#4a7c59' }}>Available to all tiers</p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {prod.price_id ? (
                      <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }} className="font-mono truncate flex-1 mr-2">{prod.price_id}</p>
                    ) : (
                      <p style={{ color: '#E8D5B0', opacity: 0.3, fontSize: 10 }}>Not linked to Stripe</p>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2 flex-shrink-0" style={{ color: '#60a5fa' }}
                      onClick={() => toast.info('Link to Stripe will be available when you are ready to connect this product.')}>
                      <LinkIcon className="h-3 w-3" /> Link to Stripe
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Add New Product button in normal view */}
          <Button variant="ghost" onClick={() => { setEditing(true); addProduct(); }}
            className="w-full h-10 border border-dashed border-white/10 text-ivory/40 hover:text-ivory hover:bg-white/5 gap-2">
            <Plus className="h-4 w-4" /> Add New Product
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
/* ── Gamification ── */
export interface GamificationData {
  pts_lesson: number;
  pts_video_upload: number;
  pts_monthly_streak: number;
  pts_referral: number;
  cost_video_analysis: number;
}
export const DEFAULT_GAMIFICATION: GamificationData = {
  pts_lesson: 10,
  pts_video_upload: 5,
  pts_monthly_streak: 15,
  pts_referral: 20,
  cost_video_analysis: 200,
};

export function GamificationSection({ data, userId }: { data: GamificationData; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GamificationData>(data);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { setDraft(data); }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert: try update, then insert if missing
      const payload = { value: draft as any, updated_at: new Date().toISOString(), updated_by: userId };
      const { data: existing } = await supabase.from('academy_settings').select('key').eq('key', 'gamification').maybeSingle();
      if (existing) {
        const { error } = await supabase.from('academy_settings').update(payload as any).eq('key', 'gamification');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('academy_settings').insert({ key: 'gamification', ...payload } as any);
        if (error) throw error;
      }
      toast.success('Gamification settings saved');
      queryClient.invalidateQueries({ queryKey: ['academy-settings'] });
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const FIELDS: { key: keyof GamificationData; label: string; hint: string }[] = [
    { key: 'pts_lesson', label: 'Points per lesson completed', hint: 'Awarded automatically when a lesson is marked completed' },
    { key: 'pts_video_upload', label: 'Points per video upload', hint: 'Student uploads a swing video for review' },
    { key: 'pts_monthly_streak', label: 'Monthly streak bonus', hint: 'Awarded once when student hits 4+ lessons in the same calendar month' },
    { key: 'pts_referral', label: 'Referral bonus', hint: 'When a referred friend completes their first lesson' },
    { key: 'cost_video_analysis', label: 'Cost: free Video Analysis', hint: 'Points needed to redeem a free video analysis' },
  ];

  return (
    <SettingsCard>
      <SectionHeader
        icon={Star}
        title="Gamification (SC Points)"
        subtitle="Earning rules & redemption costs"
        editing={editing}
        onEdit={() => setEditing(true)}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setDraft(data); }}
        saving={saving}
      />
      <Separator className="bg-white/10" />
      <p className="text-ivory/50 text-xs">
        Note: changing these values affects future awards only. Existing balances and history are preserved.
        Currently the engine uses hard-coded defaults; values here are for reference and future automation.
      </p>
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-ivory text-sm font-medium">{f.label}</p>
              <p className="text-ivory/40 text-[11px]">{f.hint}</p>
            </div>
            {editing ? (
              <Input
                type="number"
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: parseInt(e.target.value || '0', 10) })}
                className="w-20 text-right"
              />
            ) : (
              <span className="text-gold-accent font-heading font-bold">{data[f.key]}</span>
            )}
          </div>
        ))}
      </div>
      <Separator className="bg-white/10 my-2" />
      <RewardsManager />
    </SettingsCard>
  );
}

/* ── Redeemable Rewards manager ── */
function RewardsManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RewardRow | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RewardRow | null>(null);

  const { data: rewards = [], isLoading } = useQuery({
    queryKey: ['point-rewards-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_rewards')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as RewardRow[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['point-rewards-admin'] });

  const handleDelete = async (r: RewardRow) => {
    if (!r.id) return;
    const { error } = await supabase.from('point_rewards').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Reward deleted');
    refresh();
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-ivory text-sm font-semibold">Redeemable rewards</p>
          <p className="text-ivory/40 text-[11px]">What students can buy with SC Points</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} className="btn-green gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="text-ivory/50 text-xs flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
      ) : rewards.length === 0 ? (
        <p className="text-ivory/40 text-xs italic">No rewards yet. Click Add to create one.</p>
      ) : (
        <div className="space-y-2">
          {rewards.map((r) => {
            const Icon = (LucideIcons as any)[r.icon] || Star;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="h-9 w-9 rounded-lg bg-gold-accent/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-gold-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-ivory text-sm font-medium truncate">{r.name}</p>
                    {!r.is_active && <Badge variant="outline" className="text-[10px] h-4">inactive</Badge>}
                    {r.fulfillment_type === 'video_analysis' && <Badge variant="outline" className="text-[10px] h-4 border-gold-accent/40 text-gold-accent">auto</Badge>}
                  </div>
                  <p className="text-ivory/40 text-[11px] truncate">{r.description || '—'}</p>
                </div>
                <span className="text-gold-accent text-sm font-bold whitespace-nowrap">{r.cost} pts</span>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => { setEditing(r); setOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                  onClick={() => setConfirmDelete(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <RewardEditModal open={open} onOpenChange={setOpen} reward={editing} onSaved={refresh} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-[#1a2b1a] border-white/10 text-ivory">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reward?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              "{confirmDelete?.name}" will no longer be redeemable. Past redemptions are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Bulk Import ── */
function BulkImportSection() {
  const navigate = useNavigate();
  return (
    <SettingsCard>
      <SectionHeader icon={Upload} title="Bulk Import" subtitle="Import students and lessons from CSV/Excel" />
      <Separator className="bg-white/10" />
      <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
        Upload CSV or Excel files to bulk-import student records, lesson history, and payment data.
      </p>
      <Button onClick={() => navigate('/admin/bulk-import')} className="w-full gap-2" style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59', border: '1px solid rgba(74,124,89,0.3)' }}>
        <Upload className="h-4 w-4" /> Open Bulk Import Tool
      </Button>
    </SettingsCard>
  );
}

/* ── Pro Zone Media ── */
function ProZoneMediaSection() {
  const navigate = useNavigate();
  return (
    <SettingsCard>
      <SectionHeader icon={Sparkles} title="Pro Zone Media" subtitle="Upload videos & images for each section" />
      <Separator className="bg-white/10" />
      <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
        Manage the media library shown to Scratch and Pro members across the 15 Pro Zone sections.
      </p>
      <Button
        onClick={() => navigate('/admin/pro-zone')}
        className="w-full gap-2"
        style={{ background: 'rgba(240,192,64,0.18)', color: '#E8D5B0', border: '1px solid rgba(240,192,64,0.3)' }}
      >
        <Sparkles className="h-4 w-4" /> Open Pro Zone Media Hub
      </Button>
    </SettingsCard>
  );
}

/* ── Google Calendar Connection ── */
function GoogleCalendarSection() {
  return (
    <SettingsCard>
      <SectionHeader icon={Calendar} title="Google Calendar" subtitle="Connect your own Google Calendar" />
      <Separator className="bg-white/10" />
      <GoogleCalendarConnect />
    </SettingsCard>
  );
}

/* ── Staff Access ── */
function StaffAccessSection() {
  const navigate = useNavigate();
  return (
    <SettingsCard>
      <SectionHeader icon={ShieldCheck} title="Staff Access" subtitle="Invite teammates with limited admin access" />
      <Separator className="bg-white/10" />
      <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
        Give helpers their own login to manage specific sections like the Pro Zone media library.
      </p>
      <Button
        onClick={() => navigate('/admin/staff')}
        className="w-full gap-2"
        style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59', border: '1px solid rgba(74,124,89,0.3)' }}
      >
        <ShieldCheck className="h-4 w-4" /> Manage Staff
      </Button>
    </SettingsCard>
  );
}

/* ── Coach Access ── */
function CoachAccessSection() {
  const navigate = useNavigate();
  return (
    <SettingsCard>
      <SectionHeader icon={ShieldCheck} title="Coach Access" subtitle="Manage the coaches who run the portal" />
      <Separator className="bg-white/10" />
      <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
        View, add, or remove coach accounts. Each coach signs in with their own email and password and gets their own workspace.
      </p>
      <Button
        onClick={() => navigate('/admin/coaches')}
        className="w-full gap-2"
        style={{ background: 'rgba(240,192,64,0.18)', color: '#F0C040', border: '1px solid rgba(240,192,64,0.3)' }}
      >
        <ShieldCheck className="h-4 w-4" /> Manage Coaches
      </Button>
    </SettingsCard>
  );
}

/* ── Email Domain ── */
function EmailDomainSection() {
  const navigate = useNavigate();
  return (
    <SettingsCard>
      <SectionHeader icon={Mail} title="Email Sending Domain" subtitle="Resend domain status and DNS checklist" />
      <Separator className="bg-white/10" />
      <p style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 13 }}>
        Check whether mail.margeagolfacademy.com is verified in Resend and review the MX, SPF and DKIM records.
      </p>
      <Button
        onClick={() => navigate('/admin/email-domain')}
        className="w-full gap-2"
        style={{ background: 'rgba(74,124,89,0.2)', color: '#4a7c59', border: '1px solid rgba(74,124,89,0.3)' }}
      >
        <Mail className="h-4 w-4" /> View Email Domain
      </Button>
    </SettingsCard>
  );
}

/* ── Google Calendar Sync ── */
export interface GoogleCalSettings {
  enabled?: boolean;
  calendar_id?: string;
  connected_at?: string | null;
}

export function GoogleCalendarSyncSection({ data, userId }: { data: GoogleCalSettings; userId: string }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(!!data.enabled);
  const [calendarId, setCalendarId] = useState(data.calendar_id || 'primary');
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>([]);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!data.enabled);
    setCalendarId(data.calendar_id || 'primary');
  }, [data.enabled, data.calendar_id]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('sync-google-calendar', {
        body: { action: 'test' },
      });
      if (error) throw error;
      if (!res?.ok) {
        toast.error('Could not reach Google Calendar. Reconnect the connector and try again.');
        return;
      }
      setCalendars(res.calendars || []);
      toast.success(`Connected — found ${res.calendars?.length ?? 0} calendar${(res.calendars?.length ?? 0) === 1 ? '' : 's'}.`);
    } catch (e: any) {
      toast.error(e?.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled,
        calendar_id: calendarId,
        connected_at: enabled ? (data.connected_at || new Date().toISOString()) : data.connected_at ?? null,
      };
      const { data: existing } = await supabase
        .from('academy_settings')
        .select('key')
        .eq('key', 'google_calendar_sync')
        .maybeSingle();
      const op = existing
        ? supabase
            .from('academy_settings')
            .update({ value: payload as any, updated_by: userId, updated_at: new Date().toISOString() })
            .eq('key', 'google_calendar_sync')
        : supabase
            .from('academy_settings')
            .insert({ key: 'google_calendar_sync', value: payload as any, updated_by: userId } as any);
      const { error } = await op;
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success(enabled ? 'Google Calendar sync enabled' : 'Settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('sync-google-calendar', {
        body: { action: 'backfill' },
      });
      if (error) throw error;
      toast.success(`Backfill complete — created ${res?.created ?? 0} of ${res?.total ?? 0} events.`);
    } catch (e: any) {
      toast.error(e?.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <SettingsCard>
      <SectionHeader
        icon={Calendar}
        title="Google Calendar Sync"
        subtitle="Auto-sync new bookings, cancellations, and skipped weeks to your Google Calendar"
      />
      <Separator className="bg-white/10" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ivory text-sm font-medium">Enable sync</p>
          <p className="text-ivory/55 text-xs mt-0.5">
            When on, every newly booked, cancelled, or skipped lesson updates your Google Calendar automatically.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-ivory/60 uppercase tracking-wider">Target calendar</label>
        <Input
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          placeholder="primary"
          className="bg-white/5 border-white/10 text-ivory"
        />
        {calendars.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {calendars.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCalendarId(c.id)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  calendarId === c.id
                    ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                    : 'bg-white/5 border-white/10 text-ivory/70 hover:bg-white/10'
                }`}
              >
                {c.summary}{c.primary ? ' (primary)' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button onClick={handleTest} disabled={testing} variant="outline" className="border-white/15 text-ivory hover:bg-white/10">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Test connection</span>
        </Button>
        <Button onClick={handleSave} disabled={saving} className="bg-green-accent/80 hover:bg-green-accent text-ivory">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save</span>
        </Button>
        <Button
          onClick={handleBackfill}
          disabled={backfilling || !enabled}
          variant="outline"
          className="border-gold-accent/40 text-gold-accent hover:bg-gold-accent/10"
        >
          {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          <span className="ml-2">Backfill upcoming</span>
        </Button>
      </div>

      {data.connected_at && (
        <p className="text-ivory/45 text-[11px]">
          Last connected: {new Date(data.connected_at).toLocaleString()}
        </p>
      )}
    </SettingsCard>
  );
}

/* ── Defaults ── */
const DEFAULT_TIMEZONE: TimezoneData = { timezone: 'America/Cancun', offset: 'UTC-5', note: 'Cancún does not observe DST.' };
const DEFAULT_PORTAL: PortalData = { url: 'https://margeagolfacademy.com' };
const DEFAULT_LESSON_TYPES: LessonTypeData[] = [];

/* ── Student Emails ── */
interface StudentEmailsData {
  enabled: boolean;
  language: 'es' | 'en';
  templates: Record<string, boolean>;
  bccEmail: string;
  bcc: Record<string, boolean>;
}
const DEFAULT_BCC_EMAIL = 'castilla.santi@gmail.com';
const STUDENT_EMAIL_TEMPLATES: { key: string; label: string }[] = [
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'lesson_booked', label: 'Clase agendada' },
  { key: 'lesson_reminder', label: 'Recordatorio diario de clase' },
  { key: 'lesson_cancelled', label: 'Clase cancelada' },
  { key: 'lesson_skipped', label: 'Clase saltada (recurrente)' },
  { key: 'package_added', label: 'Paquete nuevo agregado' },
  { key: 'package_completed', label: 'Paquete terminado' },
  { key: 'subscription_confirmed', label: 'Membresía activada' },
  { key: 'priority_spot_claimed', label: 'Horario fijo reclamado' },
  { key: 'feedback_added', label: 'Feedback del coach' },
  { key: 'analysis_submitted', label: 'Análisis de video enviado' },
  { key: 'video_uploaded', label: 'Video subido' },
  { key: 'parent_access', label: 'Acceso a padre/tutor' },
  { key: 'family_invite', label: 'Invitación familiar' },
  { key: 'blocked_date', label: 'Aviso de día bloqueado' },
];
const DEFAULT_STUDENT_EMAILS: StudentEmailsData = {
  enabled: true,
  language: 'es',
  templates: Object.fromEntries(STUDENT_EMAIL_TEMPLATES.map(t => [t.key, true])),
  bccEmail: DEFAULT_BCC_EMAIL,
  bcc: Object.fromEntries(STUDENT_EMAIL_TEMPLATES.map(t => [t.key, true])),
};

function StudentEmailsSection({ data, userId }: { data: StudentEmailsData; userId: string }) {
  const [enabled, setEnabled] = useState(data.enabled);
  const [language, setLanguage] = useState<'es' | 'en'>(data.language);
  const [templates, setTemplates] = useState<Record<string, boolean>>(data.templates);
  const [bccEmail, setBccEmail] = useState(data.bccEmail || DEFAULT_BCC_EMAIL);
  const [bcc, setBcc] = useState<Record<string, boolean>>(data.bcc || {});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    setEnabled(data.enabled);
    setLanguage(data.language);
    setTemplates(data.templates);
    setBccEmail(data.bccEmail || DEFAULT_BCC_EMAIL);
    setBcc(data.bcc || {});
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('student_emails', { enabled, language, templates, bccEmail: bccEmail.trim(), bcc }, userId);
      qc.invalidateQueries({ queryKey: ['academy-settings'] });
      toast.success('Configuración de emails guardada');
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard>
      <SectionHeader
        icon={Mail}
        title="Emails a alumnos"
        subtitle="Pausar/activar emails automáticos y elegir el idioma"
      />
      <Separator className="bg-white/10" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ivory text-sm font-medium">Activar emails a alumnos</p>
          <p className="text-ivory/55 text-xs mt-0.5">
            Apaga este switch para pausar TODOS los emails automáticos a alumnos.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-ivory/60 uppercase tracking-wider">Idioma</label>
        <div className="flex gap-2">
          {(['es', 'en'] as const).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                language === l
                  ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                  : 'bg-white/5 border-white/10 text-ivory/70 hover:bg-white/10'
              }`}
            >
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <label className="text-xs text-ivory/60 uppercase tracking-wider">Copia oculta (BCC)</label>
        <Input
          type="email"
          value={bccEmail}
          onChange={(e) => setBccEmail(e.target.value)}
          placeholder={DEFAULT_BCC_EMAIL}
          className="bg-white/5 border-white/10 text-ivory"
        />
        <p className="text-ivory/55 text-xs">
          Esta dirección recibe copia oculta de los emails marcados abajo. Déjala vacía para no enviar copias.
        </p>
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-ivory/60 uppercase tracking-wider">Por tipo de email</label>
          <span className="text-[10px] text-ivory/45 uppercase tracking-wider">Enviar · BCC</span>
        </div>
        <div className="space-y-1.5">
          {STUDENT_EMAIL_TEMPLATES.map(tpl => (
            <div
              key={tpl.key}
              className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg ${
                enabled ? 'bg-white/5' : 'bg-white/[0.02] opacity-50'
              }`}
            >
              <span className="text-ivory text-sm flex-1">{tpl.label}</span>
              <Switch
                checked={templates[tpl.key] !== false}
                onCheckedChange={(v) => setTemplates({ ...templates, [tpl.key]: v })}
                disabled={!enabled}
              />
              <Switch
                checked={bcc[tpl.key] !== false}
                onCheckedChange={(v) => setBcc({ ...bcc, [tpl.key]: v })}
                disabled={!enabled || templates[tpl.key] === false || !bccEmail.trim()}
              />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="bg-green-accent/80 hover:bg-green-accent text-ivory w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        <span className="ml-2">Guardar</span>
      </Button>
    </SettingsCard>
  );
}

/* ── Notificaciones automáticas (aditivo) ── */
type NotificationSettingRow = {
  id: string;
  enabled: boolean;
  label: string;
  description: string | null;
};

function AutoNotificationsSection() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings' as any)
        .select('id, enabled, label, description')
        .order('label', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as NotificationSettingRow[];
    },
  });
  const [pending, setPending] = useState<string | null>(null);

  const handleToggle = async (row: NotificationSettingRow, value: boolean) => {
    setPending(row.id);
    try {
      const { error } = await supabase
        .from('notification_settings' as any)
        .update({ enabled: value } as any)
        .eq('id', row.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success(value ? `${row.label}: activada` : `${row.label}: desactivada`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsCard>
      <SectionHeader
        icon={Bell}
        title="Notificaciones automáticas"
        subtitle="Activa o desactiva los avisos automáticos a los alumnos"
      />
      <Separator className="bg-white/10" />
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-ivory/40" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="text-ivory/50 text-sm">No hay tipos de notificación configurados.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(row => (
            <div key={row.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-white/5">
              <div className="min-w-0">
                <p className="text-ivory text-sm font-medium">{row.label}</p>
                {row.description && (
                  <p className="text-ivory/55 text-xs mt-0.5">{row.description}</p>
                )}
              </div>
              <Switch
                checked={row.enabled}
                disabled={pending === row.id}
                onCheckedChange={(v) => handleToggle(row, v)}
              />
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

/* ── Main ── */

export default function AdminSettings() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const { data: settings, isLoading } = useSettings();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
      }
    }
  }, [location.hash]);

  const userId = user?.id || '';
  // Per-coach lesson pricing — each coach edits their own row.
  const { data: ownPricingRow } = useQuery({
    queryKey: ['coach-own-pricing', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('coach_lesson_pricing' as any)
        .select('pricing')
        .eq('coach_id', userId)
        .maybeSingle();
      return (data as any)?.pricing ?? null;
    },
    enabled: !!userId && !isDemoModeActive(),
  });
  const tz = (settings?.timezone as TimezoneData) || DEFAULT_TIMEZONE;
  const portal = (settings?.portal_link as PortalData) || DEFAULT_PORTAL;
  const lessonTypes = (settings?.lesson_types as LessonTypeData[]) || DEFAULT_LESSON_TYPES;
  const lessonPricing = isDemoModeActive()
    ? (demoLessonPricing as unknown as LessonPricingData)
    : ((ownPricingRow as LessonPricingData)
        || (settings?.lesson_pricing as LessonPricingData)
        || DEFAULT_PRICING);
  const gamification = (settings?.gamification as GamificationData) || DEFAULT_GAMIFICATION;
  const videoLimits = (settings?.video_upload_limits as VideoUploadLimitsData) || DEFAULT_VIDEO_LIMITS;
  const studentEmails: StudentEmailsData = {
    ...DEFAULT_STUDENT_EMAILS,
    ...((settings?.student_emails as Partial<StudentEmailsData>) || {}),
    templates: {
      ...DEFAULT_STUDENT_EMAILS.templates,
      ...(((settings?.student_emails as any)?.templates) || {}),
    },
    bcc: {
      ...DEFAULT_STUDENT_EMAILS.bcc,
      ...(((settings?.student_emails as any)?.bcc) || {}),
    },
  };

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey="admin.settingsTitle" subtitleKey="admin.settingsSub" backTo="/admin" />
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
        </div>
      ) : (
        <main className="px-4 py-6 space-y-5 max-w-3xl mx-auto">
          <TimezoneSection data={tz} userId={userId} />
          <PortalLinkSection data={portal} userId={userId} />
          <AvailabilityLinkSection />
          <FreeTrialSettingsSection />
          <LessonTypesSection data={lessonTypes} userId={userId} />
          {isAdmin && <ProZoneMediaSection />}
          <CoachSettingsSection />
          <GoogleCalendarSection />
          {isAdmin && <CoachAccessSection />}
          {isAdmin && <StaffAccessSection />}
          <StudentEmailsSection data={studentEmails} userId={userId} />
          <AcademyKnowledgeBaseSection />
          <EmailDomainSection />
          <BulkImportSection />
          {isAdmin && <AutoNotificationsSection />}

        </main>
      )}
      <SocialFooter />
    </div>
  );
}

/* ── Standalone page containers (rendered by their own routes) ── */
function SettingsPageShell({ titleKey, subtitleKey, children }: { titleKey: string; subtitleKey: string; children: React.ReactNode }) {
  return (
    <div className="app-bg min-h-screen">
      <InternalHeader titleKey={titleKey} subtitleKey={subtitleKey} backTo="/admin" />
      <main className="px-4 py-6 space-y-5 max-w-3xl mx-auto">{children}</main>
      <SocialFooter />
    </div>
  );
}

export function AdminPlansBillingPage() {
  const { role } = useAuth();
  const [clientPdf, setClientPdf] = useState<Blob | null>(null);
  const [preparingClientPdf, setPreparingClientPdf] = useState(false);
  return (
    <SettingsPageShell titleKey="admin.settingsTitle" subtitleKey="admin.settingsSub">
      {role === 'admin' && (
        <div className="flex flex-wrap justify-end gap-2 mb-3">
          <Button
            variant="default"
            size="sm"
            disabled={preparingClientPdf}
            onClick={async () => {
              try {
                if (clientPdf) {
                  await deliverClientPlansPdf(clientPdf);
                  setClientPdf(null);
                  return;
                }
                setPreparingClientPdf(true);
                const { createClientPlansPdf } = await import('@/lib/clientPlansPdf');
                setClientPdf(await createClientPlansPdf());
              } catch {
                toast.error('No se pudo generar el PDF para clientes');
              } finally {
                setPreparingClientPdf(false);
              }
            }}
          >
            {preparingClientPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LucideIcons.Download className="w-4 h-4 mr-2" />}
            {preparingClientPdf ? 'Preparando…' : clientPdf ? 'Descargar PDF para clientes' : 'PDF para clientes'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const { downloadPlansPdf } = await import('@/lib/plansPdf');
                await downloadPlansPdf();
              } catch {
                toast.error('No se pudo generar el PDF');
              }
            }}
          >
            <LucideIcons.Download className="w-4 h-4 mr-2" /> PDF de planes
          </Button>
        </div>
      )}
      <BillingPlansSection />
    </SettingsPageShell>
  );
}

export function AdminLessonPricingPage() {
  const { user, role } = useAuth();
  const { data: staffPricingCoach } = useQuery({
    queryKey: ['staff-pricing-coach', user?.id],
    enabled: role === 'staff',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_access_coach', { _user_id: user?.id ?? '', _scope: 'lesson_pricing' });
      if (error) throw error;
      return data;
    },
  });
  const userId = role === 'staff' ? (staffPricingCoach ?? '') : (user?.id ?? '');
  const { data: settings, isLoading } = useSettings();
  const { data: ownPricingRow } = useQuery({
    queryKey: ['coach-own-pricing', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('coach_lesson_pricing' as any)
        .select('pricing')
        .eq('coach_id', userId)
        .maybeSingle();
      return (data as any)?.pricing ?? null;
    },
    enabled: !!userId && !isDemoModeActive(),
  });
  const lessonPricing = isDemoModeActive()
    ? (demoLessonPricing as unknown as LessonPricingData)
    : ((ownPricingRow as LessonPricingData)
        || (settings?.lesson_pricing as LessonPricingData)
        || DEFAULT_PRICING);
  return (
    <SettingsPageShell titleKey="admin.settingsTitle" subtitleKey="admin.settingsSub">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
        </div>
      ) : (
        <>
          <LessonTypesSection data={(settings?.lesson_types as LessonTypeData[]) || DEFAULT_LESSON_TYPES} userId={user?.id ?? ''} />
          {userId && <LessonPricingSection data={lessonPricing} userId={userId} />}
        </>
      )}
    </SettingsPageShell>
  );
}

export function AdminGamificationPage() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const { data: settings, isLoading } = useSettings();
  const gamification = (settings?.gamification as GamificationData) || DEFAULT_GAMIFICATION;
  return (
    <SettingsPageShell titleKey="admin.settingsTitle" subtitleKey="admin.settingsSub">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-ivory/40" />
        </div>
      ) : (
        <GamificationSection data={gamification} userId={userId} />
      )}
    </SettingsPageShell>
  );
}
