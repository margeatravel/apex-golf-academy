import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LinkCoachCard } from '@/components/LinkCoachCard';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type Reason = 'book' | 'package' | 'individual_lesson';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drives the headline + helper copy so the gate doesn't feel generic. */
  reason?: Reason;
  /**
   * Called once the student successfully links a coach via the embedded
   * LinkCoachCard. Caller typically uses this to re-trigger the original
   * action (open the booking modal, open the package modal, etc.).
   */
  onLinked?: () => void;
}


/**
 * Coach gate dialog. Renders the LinkCoachCard inside a polished glass modal
 * and auto-closes once the student is successfully linked, calling `onLinked`
 * so the parent can resume the original purchase/booking flow.
 */
export function RequireCoachModal({ open, onOpenChange, reason = 'book', onLinked }: Props) {
  const { hasLinkedCoach } = useAuth();
  const { t } = useLanguage();
  const copy = {
    book: { title: t('coachLink.bookTitle'), description: t('coachLink.bookDesc') },
    package: { title: t('coachLink.packageTitle'), description: t('coachLink.packageDesc') },
    individual_lesson: { title: t('coachLink.individualTitle'), description: t('coachLink.individualDesc') },
  }[reason];

  // Auto-resume once the profile reflects the new coach link.
  useEffect(() => {
    if (open && hasLinkedCoach) {
      onOpenChange(false);
      // Slight delay so the dialog exit animation doesn't fight with the
      // follow-up modal's enter animation on mobile.
      setTimeout(() => onLinked?.(), 220);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasLinkedCoach]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-ivory">{copy.title}</DialogTitle>
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gold-accent/15 text-gold-accent border-gold-accent/40">
              {t('coachLink.coachRequired')}
            </span>
          </div>
          <DialogDescription className="text-ivory/60">{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          <LinkCoachCard
            variant="card"
            onLinked={() => {
              // The card itself shows a success toast and refreshes the profile.
              // Our useEffect above will pick up `hasLinkedCoach` and resume.
            }}
          />
        </div>

        <p className="text-[11px] text-ivory/45 text-center pt-1">
          {t('coachLink.noCodeHint')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default RequireCoachModal;
