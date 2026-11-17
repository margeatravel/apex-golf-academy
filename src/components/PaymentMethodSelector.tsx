import { useState } from 'react';
import { CreditCard, Landmark, Banknote, Copy, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fmtMXN, fmtMXNStr } from '@/lib/formatCurrency';

type PaymentMethod = 'card' | 'transfer' | 'cash';

interface PaymentMethodSelectorProps {
  /** Total in centavos or raw number (same unit fmtMXN expects) */
  totalAmount: number;
  concept: string;
  /** Called when Stripe card is chosen — parent handles redirect */
  onStripeCheckout: () => void;
  /** Called after a cash/transfer record is created successfully */
  onOfflinePaymentCreated: () => void;
  stripeLoading?: boolean;
  /** Extra metadata for the payment row */
  extraPaymentData?: Record<string, any>;
  /** If set, an offline payment will also credit this many lessons to the student */
  lessonsCredited?: number;
  /** Optional package name shown to admin/student when crediting lessons */
  packageName?: string;
}

export function PaymentMethodSelector({
  totalAmount,
  concept,
  onStripeCheckout,
  onOfflinePaymentCreated,
  stripeLoading = false,
  extraPaymentData = {},
  lessonsCredited,
  packageName,
}: PaymentMethodSelectorProps) {
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { profile } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const coachId = (profile as any)?.assigned_coach_id;

  const { data: coachClabe, isLoading: clabeLoading } = useQuery({
    queryKey: ['coach-clabe', coachId],
    queryFn: async () => {
      if (!coachId) return null;
      const { data, error } = await supabase.rpc('get_assigned_coach_clabe' as any);
      if (error) throw error;
      return (data?.[0] ?? null) as { clabe: string | null; full_name: string | null } | null;
    },
    enabled: !!coachId,
  });

  const hasClabe = !!coachClabe?.clabe;

  const handleCopy = async () => {
    if (!coachClabe?.clabe) return;
    await navigator.clipboard.writeText(coachClabe.clabe);
    setCopied(true);
    toast.success(t('paymentMethods.clabeCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmOffline = async (method: 'Transfer' | 'Cash') => {
    if (!profile?.id || !coachId) return;
    setSaving(true);
    try {
      if (lessonsCredited && lessonsCredited > 0) {
        // Use edge function: records payment + credits class_packages atomically
        const { data, error } = await supabase.functions.invoke(
          'record-offline-lesson-purchase',
          {
            body: {
              method,
              concept,
              totalAmount,
              lessonsCredited,
              packageName: packageName ?? concept,
            },
          },
        );
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        // Invalidate package/booking queries so credits show up immediately
        queryClient.invalidateQueries({ queryKey: ['class-packages'] });
        queryClient.invalidateQueries({ queryKey: ['student-active-package'] });
        queryClient.invalidateQueries({ queryKey: ['booking-active-package'] });
        queryClient.invalidateQueries({ queryKey: ['active-package'] });
        toast.success(
          lessonsCredited > 1
            ? `${lessonsCredited} clases acreditadas — ya puedes agendar. Tu pago queda pendiente de confirmación.`
            : 'Tu clase ya está disponible para agendar. Tu pago queda pendiente de confirmación.',
        );
      } else {
        const { error } = await supabase.from('payments' as any).insert({
          student_id: profile.id,
          coach_id: coachId,
          payment_date: new Date().toISOString().slice(0, 10),
          amount: totalAmount,
          payment_method: method,
          concept,
          notes: method === 'Transfer'
            ? t('paymentMethods.pendingTransfer')
            : t('paymentMethods.pendingCash'),
          ...extraPaymentData,
        });
        if (error) throw error;
        toast.success(
          method === 'Transfer'
            ? t('paymentMethods.transferSuccess')
            : t('paymentMethods.cashSuccess')
        );
      }
      onOfflinePaymentCreated();
    } catch (err: any) {
      toast.error(err.message || t('paymentMethods.errorRecording'));
    } finally {
      setSaving(false);
    }
  };

  const methodOptions: { key: PaymentMethod; icon: React.ReactNode; label: string; sub: string }[] = [
    { key: 'card', icon: <CreditCard className="h-5 w-5" />, label: t('paymentMethods.card'), sub: t('paymentMethods.cardSub') },
    { key: 'transfer', icon: <Landmark className="h-5 w-5" />, label: t('paymentMethods.transfer'), sub: t('paymentMethods.transferSub') },
    { key: 'cash', icon: <Banknote className="h-5 w-5" />, label: t('paymentMethods.cash'), sub: t('paymentMethods.cashSub') },
  ];

  // If a method is selected, show the confirmation view
  if (selected === 'transfer') {
    return (
      <div className="space-y-4">
        <p className="text-[#F5F0E8]/70 text-sm text-center">{t('paymentMethods.transferTo')}</p>
        <div
          className="rounded-xl p-4 text-center space-y-2"
          style={{ background: 'rgba(74,124,89,0.15)', border: '1px solid rgba(74,124,89,0.3)' }}
        >
          <p className="text-[#F5F0E8] font-mono text-lg tracking-widest select-all">
            {clabeLoading ? <Loader2 className="h-5 w-5 mx-auto animate-spin" /> : coachClabe?.clabe || '—'}
          </p>
          {coachClabe?.full_name && (
            <p className="text-[#E8D5B0]/50 text-xs">{t('paymentMethods.onBehalfOf')} {coachClabe.full_name}</p>
          )}
          <button
            onClick={handleCopy}
            disabled={!hasClabe}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition"
            style={{ background: 'rgba(74,124,89,0.3)', color: '#7BC894' }}
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('paymentMethods.copied') : t('paymentMethods.copyCLABE')}
          </button>
        </div>
        <p className="text-[#F5F0E8]/40 text-xs text-center">{t('paymentMethods.amount')} {fmtMXN(totalAmount)}</p>
        <p className="text-[#F5F0E8]/40 text-[10px] text-center">{t('paymentMethods.transferConfirmNote')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setSelected(null)}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F0E8' }}
          >
            {t('paymentMethods.back')}
          </button>
          <button
            onClick={() => handleConfirmOffline('Transfer')}
            disabled={saving || !hasClabe}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            style={{ background: '#4a7c59', color: '#F5F0E8' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('paymentMethods.alreadyTransferred')}
          </button>
        </div>
      </div>
    );
  }

  if (selected === 'cash') {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl p-5 text-center space-y-2"
          style={{ background: 'rgba(74,124,89,0.15)', border: '1px solid rgba(74,124,89,0.3)' }}
        >
          <Banknote className="h-8 w-8 mx-auto" style={{ color: '#7BC894' }} />
          <p className="text-[#F5F0E8] font-semibold">{t('paymentMethods.cashPayment')}</p>
          <p className="text-[#F5F0E8]/50 text-sm">{t('paymentMethods.cashNote').replace('{amount}', fmtMXNStr(totalAmount))}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSelected(null)}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F0E8' }}
          >
            {t('paymentMethods.back')}
          </button>
          <button
            onClick={() => handleConfirmOffline('Cash')}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            style={{ background: '#4a7c59', color: '#F5F0E8' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('paymentMethods.confirm')}
          </button>
        </div>
      </div>
    );
  }

  // Method selection list
  return (
    <div className="space-y-3">
      <p className="text-[#F5F0E8]/60 text-sm text-center">{t('paymentMethods.howToPay')}</p>
      {methodOptions.map((m) => (
        <button
          key={m.key}
          onClick={() => {
            if (m.key === 'card') {
              onStripeCheckout();
            } else {
              setSelected(m.key);
            }
          }}
          disabled={m.key === 'card' && stripeLoading}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all hover:brightness-110 active:scale-[0.98]"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(74,124,89,0.25)', color: '#7BC894' }}>
            {m.key === 'card' && stripeLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : m.icon}
          </div>
          <div className="text-left min-w-0 flex-1">
            <p className="text-[#F5F0E8] text-sm font-medium">{m.label}</p>
            <p className="text-[#F5F0E8]/40 text-xs">{m.sub}</p>
          </div>
        </button>
      ))}
    </div>
  );
}