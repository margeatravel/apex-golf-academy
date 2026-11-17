import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export interface RewardRow {
  id?: string;
  key: string;
  name: string;
  description: string | null;
  cost: number;
  icon: string;
  fulfillment_type: string;
  is_active: boolean;
  sort_order: number;
}

const ICON_CHOICES = ['Star','Video','Gift','Trophy','Award','Crown','Sparkles','Flag','Target','Zap','Coffee','Shirt'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reward?: RewardRow | null;
  onSaved: () => void;
}

const blank: RewardRow = {
  key: '', name: '', description: '', cost: 100, icon: 'Gift',
  fulfillment_type: 'manual', is_active: true, sort_order: 100,
};

export function RewardEditModal({ open, onOpenChange, reward, onSaved }: Props) {
  const [draft, setDraft] = useState<RewardRow>(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(reward ? { ...reward } : { ...blank });
  }, [open, reward]);

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const handleSave = async () => {
    if (!draft.name.trim()) { toast.error('Name is required'); return; }
    const key = draft.key.trim() || slugify(draft.name);
    if (!key) { toast.error('Key is required'); return; }
    setSaving(true);
    try {
      const payload = {
        key,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        cost: Math.max(1, Number(draft.cost) || 0),
        icon: draft.icon || 'Star',
        fulfillment_type: draft.fulfillment_type || 'manual',
        is_active: draft.is_active,
        sort_order: Number(draft.sort_order) || 0,
        updated_at: new Date().toISOString(),
      };
      if (reward?.id) {
        const { error } = await supabase.from('point_rewards').update(payload).eq('id', reward.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('point_rewards').insert(payload);
        if (error) throw error;
      }
      toast.success('Reward saved');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a2b1a] border-white/10 text-ivory max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{reward?.id ? 'Edit reward' : 'New reward'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-ivory/70 text-xs">Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-ivory/70 text-xs">Key (unique slug)</Label>
            <Input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder={slugify(draft.name) || 'free_lesson'}
              disabled={!!reward?.id} />
          </div>
          <div>
            <Label className="text-ivory/70 text-xs">Description</Label>
            <Textarea rows={2} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-ivory/70 text-xs">Cost (pts)</Label>
              <Input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: parseInt(e.target.value || '0', 10) })} />
            </div>
            <div>
              <Label className="text-ivory/70 text-xs">Sort order</Label>
              <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value || '0', 10) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-ivory/70 text-xs">Icon</Label>
              <Select value={draft.icon} onValueChange={(v) => setDraft({ ...draft, icon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_CHOICES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-ivory/70 text-xs">Fulfillment</Label>
              <Select value={draft.fulfillment_type} onValueChange={(v) => setDraft({ ...draft, fulfillment_type: v })}
                disabled={draft.key === 'video_analysis'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (admin fulfills)</SelectItem>
                  <SelectItem value="video_analysis">Video Analysis credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
            <div>
              <p className="text-sm">Active</p>
              <p className="text-ivory/40 text-[11px]">Visible to students for redemption</p>
            </div>
            <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="btn-green">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
