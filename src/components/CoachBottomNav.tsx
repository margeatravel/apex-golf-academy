import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, DollarSign, UserCog, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

// Menú inferior de Coach (rediseño Home Coach, 27 nov 2026) — solo móvil.
// Visible solo en las 5 rutas principales del coach; en escritorio el coach
// usa el menú lateral / superior. No interfiere con StudentBottomNav: ese
// componente retorna null en rutas /admin, y este retorna null fuera de ellas.
const COACH_NAV_ROUTES = ['/admin', '/admin/lessons', '/admin/revenue', '/admin/subscribers', '/admin/students'];

export function CoachBottomNav() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const isCoachRoute = COACH_NAV_ROUTES.some((r) =>
    r === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(r),
  );
  if (!user || !isCoachRoute) return null;

  const isActive = (path: string) =>
    path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path);

  const items = [
    { label: t('nav.home'), Icon: Home, path: '/admin' },
    { label: t('admin.navCalendar'), Icon: Calendar, path: '/admin/lessons' },
    { label: t('admin.navRevenue'), Icon: DollarSign, path: '/admin/revenue' },
    { label: t('admin.navSubscribers'), Icon: UserCog, path: '/admin/subscribers' },
    { label: t('admin.navStudents'), Icon: Users, path: '/admin/students' },
  ];

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none"
      style={{
        // Misma técnica que StudentBottomNav: capa de composición propia para
        // que iOS Safari no deje la barra flotando a media pantalla al hacer scroll.
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
      aria-label={t('admin.coachBottomNav')}
    >
      <div
        className="pointer-events-auto flex items-center justify-between px-2 py-2 rounded-full mx-auto w-[95vw] max-w-xl"
        style={{
          background: 'rgba(8,14,11,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 h-14 flex-1 rounded-full transition-colors"
              style={{ color: active ? '#FFFFFF' : 'rgba(245,240,232,0.55)' }}
            >
              <item.Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
              <span
                className="text-[10px] font-medium leading-none mt-0.5"
                style={{ color: active ? '#FFFFFF' : 'rgba(245,240,232,0.55)' }}
              >
                {item.label}
              </span>
              {active && (
                <span
                  className="absolute"
                  style={{
                    bottom: 3,
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    background: '#7CC598',
                    boxShadow: '0 0 8px rgba(124,197,152,0.8)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
