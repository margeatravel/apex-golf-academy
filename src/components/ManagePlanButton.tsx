import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ManagePlanButtonProps {
  className?: string;
  size?: 'sm' | 'default';
}

export function ManagePlanButton({ className, size = 'sm' }: ManagePlanButtonProps) {
  return (
    <Link to="/plans">
      <Button 
        size={size}
        className={cn(
          // Dark background with high contrast
          "bg-foreground text-background hover:bg-foreground/90",
          // Static shadow
          "shadow-[0_4px_20px_hsla(160,40%,10%,0.3)]",
          // Hover jump effect only
          "transition-all duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-[0_6px_24px_hsla(160,40%,10%,0.35)]",
          "gap-1.5 h-8 px-3 text-xs",
          className
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        Manage your plan
      </Button>
    </Link>
  );
}
