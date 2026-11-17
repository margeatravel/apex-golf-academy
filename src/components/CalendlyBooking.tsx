import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from 'lucide-react';

interface CalendlyBookingProps {
  prefillEmail?: string;
  triggerButton?: React.ReactNode;
}

export function CalendlyBooking({ prefillEmail, triggerButton }: CalendlyBookingProps) {
  const calendlyUrl = 'https://calendly.com/castilla-santi-golfacademy/new-meeting';

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const openCalendly = () => {
    const url = prefillEmail
      ? `${calendlyUrl}?email=${encodeURIComponent(prefillEmail)}`
      : calendlyUrl;

    // @ts-ignore
    if (window.Calendly) {
      // @ts-ignore
      window.Calendly.initPopupWidget({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button className="btn-green">
            <Calendar className="mr-2 h-4 w-4" />
            Book a Lesson
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="h-[100dvh] w-[100vw] max-w-none lg:h-[90vh] lg:w-auto lg:max-w-5xl flex flex-col p-0 gap-0 overflow-hidden glass-card">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-white/10">
          <DialogTitle className="text-ivory font-heading">Schedule Your Golf Lesson</DialogTitle>
          <DialogDescription className="text-ivory/60">
            Choose a convenient time for your next training session
          </DialogDescription>
          <p className="text-xs text-ivory/40 mt-1">Cancun Time (EST)</p>
        </DialogHeader>
        <div className="flex-1 min-h-0 w-full">
          <iframe
            src={prefillEmail ? `${calendlyUrl}?embed_domain=${window.location.hostname}&embed_type=Inline&email=${encodeURIComponent(prefillEmail)}` : `${calendlyUrl}?embed_domain=${window.location.hostname}&embed_type=Inline`}
            className="w-full h-full border-0"
            style={{ minHeight: 0 }}
            title="Book a Golf Lesson"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
