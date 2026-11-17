import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ViewModeSwitch } from '@/components/ViewModeSwitch';

/**
 * Floating utility bar for staff sessions only (role === 'staff').
 * Provides quick access back to the staff menu and a sign-out action
 * on every page they can reach. Hidden for admins, coaches, students,
 * and on auth screens / the staff menu itself.
 */
export function StaffUtilityBar() {
  const { user, role, isStaff, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;
  // Only true staff accounts (not admin/coach impersonating, not students).
  if (role !== 'staff' || !isStaff) return null;

  const hidden = [
    '/staff',
    '/auth',
    '/auth/callback',
    '/auth/forgot',
    '/auth/reset',
    '/not-authorized',
  ];
  if (hidden.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sign out');
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-2 py-1.5 rounded-full border border-white/15 shadow-lg"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        background: 'rgba(13,31,24,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <button
        onClick={() => navigate('/staff')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-ivory hover:bg-white/10 transition-colors"
        aria-label="Back to staff menu"
      >
        <LayoutGrid className="h-3.5 w-3.5 text-gold-accent" />
        <span>Menú de staff</span>
      </button>
      <ViewModeSwitch variant="pill" />
      <div className="h-4 w-px bg-white/15" />
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-ivory hover:bg-white/10 transition-colors"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5 text-red-300" />
        <span>Cerrar sesión</span>
      </button>
    </div>
  );
}