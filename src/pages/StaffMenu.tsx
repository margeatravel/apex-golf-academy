import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Star, Users, Calendar, DollarSign, UserCog, CreditCard, BarChart3, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ViewModeSwitch } from '@/components/ViewModeSwitch';
import { useLanguage } from '@/contexts/LanguageContext';
import { STAFF_ACCESS_AREAS } from '../../supabase/functions/_shared/staff-scopes';

const STAFF_ICONS = { calendar: Calendar, pro_zone: Star, plans_billing: CreditCard, lesson_pricing: DollarSign, google_calendar: Calendar, stripe: CreditCard };
const SCOPES = STAFF_ACCESS_AREAS.map(area => ({ ...area, icon: STAFF_ICONS[area.id] }));

export default function StaffMenu() {
  const { user, loading, role, isStaff, permissions, signOut } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Admin/coach already have their own dashboard; only staff land here.
  if (role === 'admin' || role === 'coach') return <Navigate to="/admin" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;

  const visible = SCOPES.filter((s) => permissions.includes(s.id));
  // Authoritative check from the freshly-loaded DB permissions: a user with no
  // active scopes must never land on the staff menu.
  if (visible.length === 0) return <Navigate to="/dashboard" replace />;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sign out');
    }
  };

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(13,31,24,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center px-5 py-4 gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-gold-accent/15 flex-shrink-0">
            <ShieldCheck className="h-4 w-4 text-gold-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-ivory text-lg font-semibold leading-tight truncate">{t('coachUi.staffMenu')}</h1>
            <p className="text-ivory/55 text-xs truncate">{user.email}</p>
          </div>
          <ViewModeSwitch variant="pill" className="mr-1" />
          <Button
            onClick={handleSignOut}
            variant="ghost"
            size="sm"
            className="text-ivory/80 hover:text-ivory hover:bg-white/10 gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('coachUi.signOut')}</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-3">
        <div className="glass-card p-4">
          <p className="text-xs text-ivory/65 leading-relaxed">
            Bienvenida. Estos son los apartados a los que tienes acceso. Solo se muestran los que el administrador te ha autorizado.
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="glass-card p-6 text-center text-ivory/60 text-sm">
            No tienes acceso a ningún apartado todavía. Pide al administrador que te asigne permisos.
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.id}
                  to={s.route}
                  className="glass-card p-4 flex items-center gap-3 hover:bg-white/[0.07] transition-colors border border-white/10"
                >
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gold-accent/15 flex-shrink-0">
                    <Icon className="h-5 w-5 text-gold-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-ivory text-sm font-semibold">{s.label}</div>
                    <div className="text-ivory/55 text-xs">{s.description}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}