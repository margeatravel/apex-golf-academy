import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AwardPointsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onSaved?: () => void;
}

export function AwardPointsModal({ open, onOpenChange, studentId, studentName, onSaved }: AwardPointsModalProps) {
  const [delta, setDelta] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    const parsed = parseInt(delta, 10);
    if (isNaN(parsed) || parsed === 0) {
      toast({ title: 'Invalid amount', description: 'Enter a non-zero whole number (positive or negative).', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'Add a short reason for the adjustment.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_adjust_points' as any, {
        p_user_id: studentId,
        p_delta: parsed,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Points updated', description: `${parsed > 0 ? '+' : ''}${parsed} pts to ${studentName}.` });
      onSaved?.();
      onOpenChange(false);
      setDelta('');
      setReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-warning" fill="currentColor" />
            Adjust SC Points
          </DialogTitle>
          <DialogDescription>For {studentName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="delta">Points (use negative to subtract)</Label>
            <Input
              id="delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 25 or -10"
            />
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Birthday bonus"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
