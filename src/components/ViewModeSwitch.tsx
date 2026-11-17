import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck, GraduationCap } from 'lucide-react';

/**
 * Visible only for users who genuinely hold BOTH roles (active staff scopes
 * in the DB + a student profile). Lets them jump between the staff menu and
 * their student portal; the choice is persisted per user.
 */
export function ViewModeSwitch({
  variant = 'button',
  className = '',
}: {
  variant?: 'button' | 'pill';
  className?: string;
}) {
  const { canSwitchViews, viewMode, setViewMode } = useAuth();
  const navigate = useNavigate();

  if (!canSwitchViews) return null;

  const goStaff = viewMode !== 'staff';
  const Icon = goStaff ? ShieldCheck : GraduationCap;
  const label = goStaff ? 'Modo staff' : 'Portal de alumno';

  const handleClick = () => {
    const next = goStaff ? 'staff' : 'student';
    setViewMode(next);
    navigate(next === 'staff' ? '/staff' : '/dashboard');
  };

  if (variant === 'pill') {
    return (
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-ivory border border-white/15 bg-white/5 hover:bg-white/10 transition-colors ${className}`}
      >
        <Icon className="h-3.5 w-3.5 text-gold-accent" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 w-full text-left text-sm text-ivory/80 hover:text-ivory ${className}`}
    >
      <Icon className="h-4 w-4 text-gold-accent" />
      <span>{label}</span>
    </button>
  );
}
