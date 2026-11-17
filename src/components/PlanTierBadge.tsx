import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { usePlanColors, resolvePlanColor } from '@/hooks/usePlanColors';

interface PlanTierBadgeProps {
  clickable?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function PlanTierBadge({ clickable = true, showLabel = true, className }: PlanTierBadgeProps) {
  const { effectivePlan } = useAuth();
  const planColors = usePlanColors();

  const planTier = effectivePlan;

  // Labels are fixed; the accent color is the single-source-of-truth value from billing_plans.
  const labels: Record<string, string> = {
    free: 'Member', member: 'Member', scratch: 'Scratch', pro: 'Pro', apex: 'Apex',
  };
  const accent = resolvePlanColor(planColors, planTier);
  // Pick readable foreground: dark text on light/warm accents, ivory otherwise.
  const isLight = /^#([efd])/i.test(accent) || /^#f0c040|^#d9aa42|^#c9a84c|^#9ca3af/i.test(accent);
  const config = {
    label: labels[planTier] || 'Member',
    style: {
      background: accent,
      color: isLight ? '#0d1f18' : '#F5F0E8',
      border: `1px solid ${accent}`,
    } as React.CSSProperties,
  };

  const badge = (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium capitalize',
        clickable && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
      style={config.style}
    >
      {showLabel && <span className="mr-1 text-xs opacity-70">Plan:</span>}
      {config.label}
    </Badge>
  );

  if (clickable) {
    return <Link to="/plans">{badge}</Link>;
  }

  return badge;
}
