import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscriptionId?: string;
  studentId?: string;
  studentName?: string | null;
  onCanceled?: () => void;
}

export function CancelSubscriptionDialog({
  open, onOpenChange, subscriptionId, studentId, studentName, onCanceled,
}: Props) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState<'period_end' | 'immediate' | null>(null);

  const run = async (immediate: boolean) => {
    setLoading(immediate ? 'immediate' : 'period_end');
    try {
      const { data, error } = await supabase.functions.invoke('admin-cancel-subscription', {
        body: {
          subscription_id: subscriptionId,
          student_id: studentId,
          cancel_immediately: immediate,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: immediate ? 'Subscription canceled' : 'Cancellation scheduled',
        description: immediate
          ? `${studentName || 'Subscriber'} access ended now.`
          : `${studentName || 'Subscriber'} keeps access until period end.`,
      });
      onOpenChange(false);
      onCanceled?.();
    } catch (e: any) {
      toast({ title: 'Failed to cancel', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ui.cancelSub.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {studentName ? `Cancel ${studentName}'s subscription. ` : ''}
            {t('ui.cancelSub.desc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel disabled={loading !== null}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => run(true)}
            disabled={loading !== null}
          >
            {loading === 'immediate' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('ui.cancelSub.immediately')}
          </Button>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); run(false); }}
            disabled={loading !== null}
          >
            {loading === 'period_end' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('ui.cancelSub.periodEnd')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}