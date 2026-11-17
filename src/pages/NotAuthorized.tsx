import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getStaffLandingRoute } from '@/lib/staffLanding';

export default function NotAuthorized() {
  const { role, permissions, isStaff, signOut } = useAuth();
  const navigate = useNavigate();

  const fallback =
    role === 'admin'
      ? '/admin'
      : isStaff
        ? getStaffLandingRoute(permissions) ?? '/auth'
        : '/dashboard';

  return (
    <div className="app-bg min-h-screen flex items-center justify-center px-4">
      <div className="glass-card max-w-md w-full p-8 text-center space-y-5">
        <div
          className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(240,192,64,0.15)' }}
        >
          <ShieldAlert className="h-7 w-7 text-gold-accent" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold text-ivory">Not authorized</h1>
          <p className="text-ivory/60 text-sm">
            Your account doesn't have access to this section. If you think this is a
            mistake, ask the academy admin to grant you the right permissions.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => navigate(fallback, { replace: true })}
            className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to my workspace
          </Button>
          <button
            onClick={signOut}
            className="text-xs text-ivory/40 hover:text-ivory/70 underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}