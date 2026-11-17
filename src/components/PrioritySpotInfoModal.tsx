import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Intermediate explainer shown when a free Member taps "Secure Your Time →"
 * on the Priority Spot card. Sells the feature before pushing them to /plans.
 */
export function PrioritySpotInfoModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const bullets = [
    { icon: '📅', text: t('priorityInfo.bullet1') },
    { icon: '⭐', text: t('priorityInfo.bullet2') },
    { icon: '🔒', text: t('priorityInfo.bullet3') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-0"
        style={{
          background: 'linear-gradient(180deg, rgba(20,24,28,0.98), rgba(15,18,22,0.98))',
          borderColor: 'rgba(240,192,64,0.30)',
          boxShadow: '0 0 0 1px rgba(240,192,64,0.20) inset, 0 24px 60px -20px rgba(240,192,64,0.30)',
        }}
      >
        {/* Subtle gold glow */}
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(240,192,64,0.12), transparent 60%)',
          }}
        />

        <div className="relative p-6 sm:p-8">
          <DialogHeader className="space-y-3 text-left">
            <div className="h-12 w-12 rounded-2xl bg-gold-accent/15 border border-gold-accent/35 flex items-center justify-center">
              <CalendarCheck className="h-6 w-6 text-gold-accent" />
            </div>
            <DialogTitle className="font-heading text-2xl text-ivory font-semibold leading-tight">
              {t('priorityInfo.title')}
            </DialogTitle>
            <DialogDescription className="text-ivory/70 text-sm sm:text-base leading-relaxed">
              {t('priorityInfo.description')}
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-6 space-y-3">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-lg leading-none mt-0.5" aria-hidden>{b.icon}</span>
                <span className="text-ivory/85 text-sm leading-snug">{b.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 space-y-3">
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate('/plans');
              }}
              className="w-full h-12 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
            >
              {t('priorityInfo.cta')}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full text-center text-ivory/55 hover:text-ivory/80 text-sm transition-colors py-1"
            >
              {t('priorityInfo.maybeLater')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}