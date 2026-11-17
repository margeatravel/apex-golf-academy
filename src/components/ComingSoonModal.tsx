import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComingSoonModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-[#0d1f18]/95 border-white/10 text-center space-y-4">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(240,192,64,0.15)' }}
          >
            <Clock className="h-7 w-7 text-gold-accent" />
          </div>
          <h2 className="font-heading text-xl font-bold text-ivory">Coming Soon 🚧</h2>
          <p className="text-ivory/60 text-sm max-w-xs">
            We're curating the best tips to help you improve. Check back soon!
          </p>
        </div>
        <Button
          onClick={() => onOpenChange(false)}
          className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold"
        >
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}