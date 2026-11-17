import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscriptionId?: string;
  studentId?: string;
  studentName?: string | null;
  isPaused: boolean;
  onChanged?: () => void;
}

export function PauseSubscriptionDialog({
  open, onOpenChange, subscriptionId, studentId, studentName, isPaused, onChanged,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-pause-subscription', {
        body: {
          subscription_id: subscriptionId,
          student_id: studentId,
          action: isPaused ? 'resume' : 'pause',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: isPaused ? 'Subscription resumed' : 'Subscription paused',
        description: isPaused
          ? `${studentName || 'Subscriber'} billing has resumed.`
          : `${studentName || 'Subscriber'} billing is paused. Access continues.`,
      });
      onOpenChange(false);
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPaused ? 'Resume subscription?' : 'Pause subscription?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPaused
              ? `Resume billing for ${studentName || 'this subscriber'}. Stripe will charge again on the next renewal date.`
              : `Pause billing for ${studentName || 'this subscriber'}. Stripe stops generating invoices, but the subscription stays active and access is preserved. You can resume any time.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Nevermind</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPaused ? 'Resume' : 'Pause'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}