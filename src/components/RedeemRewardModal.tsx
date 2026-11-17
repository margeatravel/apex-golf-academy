import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as LucideIcons from 'lucide-react';
import { Star, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RedeemRewardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  onRedeemed?: () => void;
}

interface Reward {
  id: string;
  key: string;
  name: string;
  description: string | null;
  cost: number;
  icon: string;
  fulfillment_type: string;
}

function iconFor(name: string): any {
  return (LucideIcons as any)[name] || LucideIcons.Star;
}

export function RedeemRewardModal({ open, onOpenChange, currentBalance, onRedeemed }: RedeemRewardModalProps) {
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('point_rewards')
      .select('id,key,name,description,cost,icon,fulfillment_type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Could not load rewards', { description: error.message });
        setRewards((data as Reward[]) || []);
        setLoading(false);
      });
  }, [open]);

  const handleRedeem = async (reward: Reward) => {
    const cost = reward.cost;
    if (currentBalance < cost) return;
    setRedeeming(reward.key);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-reward', {
        body: { reward_key: reward.key },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Redemption failed');
      setSuccess(reward.key);
      toast.success('Reward redeemed!', {
        description: reward.fulfillment_type === 'video_analysis'
          ? 'Your free video analysis is ready. Upload a video to use it.'
          : 'Your coach has been notified and will fulfill it shortly.',
      });
      onRedeemed?.();
      setTimeout(() => {
        setSuccess(null);
        onOpenChange(false);
      }, 1800);
    } catch (err: any) {
      toast.error('Could not redeem', { description: err.message });
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a2b1a] border-white/10 text-ivory max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ivory font-heading text-xl flex items-center gap-2">
            <Star className="h-5 w-5 text-gold-accent" fill="#F0C040" />
            Redeem SC Points
          </DialogTitle>
          <DialogDescription className="text-ivory/60">
            Balance: <span className="text-gold-accent font-bold">{currentBalance} pts</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {loading ? (
            <div className="text-center py-6 text-ivory/50 text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rewards…
            </div>
          ) : rewards.length === 0 ? (
            <div className="text-center py-6 text-ivory/50 text-sm">No rewards available right now.</div>
          ) : rewards.map((reward) => {
            const canAfford = currentBalance >= reward.cost;
            const Icon = iconFor(reward.icon);
            const isRedeeming = redeeming === reward.key;
            const isSuccess = success === reward.key;
            return (
              <div
                key={reward.key}
                className="rounded-2xl p-4 border transition-all"
                style={{
                  backgroundColor: canAfford ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.03)',
                  borderColor: canAfford ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.08)',
                  opacity: canAfford ? 1 : 0.5,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gold-accent/15 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6 text-gold-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-ivory">{reward.name}</p>
                    <p className="text-ivory/50 text-xs mt-0.5">{reward.description}</p>
                    <p className="text-gold-accent text-sm font-semibold mt-1">{reward.cost} pts</p>
                  </div>
                </div>
                <Button
                  onClick={() => handleRedeem(reward)}
                  disabled={!canAfford || isRedeeming || !!success}
                  className="btn-green w-full mt-3 text-xs"
                >
                  {isSuccess ? (
                    <><Check className="h-4 w-4 mr-1" /> Redeemed!</>
                  ) : isRedeeming ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Redeeming…</>
                  ) : canAfford ? (
                    'Redeem'
                  ) : (
                    `Need ${reward.cost - currentBalance} more pts`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-ivory/70 text-[11px] font-semibold uppercase tracking-wider mb-2">How to earn points</p>
          <ul className="space-y-1 text-ivory/60 text-xs">
            <li>• Complete a lesson — <span className="text-gold-accent">+10 pts</span></li>
            <li>• Upload a video for review — <span className="text-gold-accent">+5 pts</span></li>
            <li>• 3 lessons in one month — <span className="text-gold-accent">+15 pts</span></li>
            <li>• Refer a friend who joins — <span className="text-gold-accent">+20 pts</span></li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
