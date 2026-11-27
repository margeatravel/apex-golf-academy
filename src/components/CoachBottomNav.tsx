import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, DollarSign, UserCog, Users, Plus, X, UserPlus, Video, Package, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AddPackageModal } from '@/components/AddPackageModal';
import { AddLessonModal } from '@/components/AddLessonModal';
import { AddStudentModal } from '@/components/AddStudentModal';
import { AiInsightsModal } from '@/components/AiInsightsModal';
import { CoachVideoUploadSheet } from '@/components/CoachFAB';

// Menú inferior de Coach (rediseño Home Coach, 27 nov 2026) — solo móvil.
// Visible solo en las 5 rutas principales del coach; en escritorio el coach
// usa el menú lateral / superior. No interfiere con StudentBottomNav: ese
// componente retorna null en rutas /admin, y este retorna null fuera de ellas.
//
// El botón + vive DENTRO de la píldora (centrado, como el menú de alumnos) y
// abre la hoja de acciones rápidas (agregar alumno, subir video, agregar
// paquete, agregar clase, AI insights) — las mismas 5 acciones del CoachFAB.
// En escritorio el + flotante separado sigue existiendo (CoachFAB); en móvil
// el flotante está oculto y solo existe este + integrado.
const COACH_NAV_ROUTES = ['/admin', '/admin/lessons', '/admin/revenue', '/admin/subscribers', '/admin/students'];

export function CoachBottomNav() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const isCoachRoute = COACH_NAV_ROUTES.some((r) =>
    r === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(r),
  );
  if (!user || !isCoachRoute) return null;

  // El + es solo para admin y coach (igual que el CoachFAB flotante).
  const isCoachUser = role === 'admin' || role === 'coach';

  const isActive = (path: string) =>
    path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path);

  const items = [
    { label: t('nav.home'), Icon: Home, path: '/admin' },
    { label: t('admin.navCalendar'), Icon: Calendar, path: '/admin/lessons' },
    { label: t('admin.navRevenue'), Icon: DollarSign, path: '/admin/revenue' },
    { label: t('admin.navSubscribers'), Icon: UserCog, path: '/admin/subscribers' },
    { label: t('admin.navStudents'), Icon: Users, path: '/admin/students' },
  ];

  // Las mismas 5 acciones del CoachFAB flotante.
  const actions = [
    { icon: UserPlus, label: t('fab.addStudent'), color: '#f59e0b', bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.45)', onClick: () => { setMenuOpen(false); setStudentOpen(true); } },
    { icon: Video, label: t('fab.uploadVideo'), color: '#4a7c59', bg: 'rgba(74,124,89,0.22)', border: 'rgba(124,197,152,0.45)', onClick: () => { setMenuOpen(false); setVideoOpen(true); } },
    { icon: Package, label: t('fab.addPackage'), color: '#E8D5B0', bg: 'rgba(232,213,176,0.14)', border: 'rgba(232,213,176,0.4)', onClick: () => { setMenuOpen(false); setPackageOpen(true); } },
    { icon: Calendar, label: t('fab.addLesson'), color: '#60a5fa', bg: 'rgba(96,165,250,0.18)', border: 'rgba(96,165,250,0.45)', onClick: () => { setMenuOpen(false); setLessonOpen(true); } },
    { icon: Sparkles, label: t('admin.aiInsights'), color: '#F0C040', bg: 'rgba(240,192,64,0.18)', border: 'rgba(240,192,64,0.45)', onClick: () => { setMenuOpen(false); setAiOpen(true); } },
  ];

  const renderNavItem = (item: (typeof items)[number]) => {
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
  };

  // El + va en el centro de la píldora (3ª ranura de 6, con ítems a ambos
  // lados). Centrarlo exactamente al 50% obligaría a ranuras de ~51px en
  // teléfono y la etiqueta "Suscriptores" no cabría; esta posición central
  // es el mejor equilibrio sin recortar etiquetas ni tapar ítems.
  const renderPlusSlot = () => (
    <div key="coach-fab" className="flex items-center justify-center h-14 flex-1">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? t('misc.navCloseMenu') : t('misc.navOpenQuickActions')}
        aria-expanded={menuOpen}
        className="flex items-center justify-center h-12 w-12 rounded-full transition-transform flex-shrink-0"
        style={{
          background: '#0a1410',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#FFFFFF',
          transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {menuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={2.4} />}
      </button>
    </div>
  );

  return (
    <>
      {/* Hoja de acciones rápidas (solo móvil) — ventana compacta centrada
          justo encima de la píldora, como el menú + de los alumnos. */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          {/* Invisible click-catcher to close (no full-screen dim) */}
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('misc.navMenuTitle')}
            className="absolute left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] w-[92vw] max-w-[340px] rounded-3xl overflow-hidden animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-200"
            style={{
              background: 'rgba(8,14,11,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F5F0E8]/40">
                {t('misc.navMenuTitle')}
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('misc.navCloseMenu')}
                className="h-8 w-8 rounded-full flex items-center justify-center text-[#F5F0E8]/70"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-2.5 pt-0.5 pb-3">
              <div
                className="rounded-2xl overflow-hidden divide-y divide-white/[0.06]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                {actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-white/10 transition-colors"
                  >
                    <span
                      className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: action.bg, border: `1px solid ${action.border}` }}
                    >
                      <action.icon className="h-[18px] w-[18px]" style={{ color: action.color }} />
                    </span>
                    <span className="flex-1 text-sm font-medium text-[#F5F0E8]">{action.label}</span>
                    <ChevronRight className="h-4 w-4 text-[#F5F0E8]/30" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none"
        style={{
          // Misma técnica que StudentBottomNav: capa de composición propia para
          // que iOS Safari no deje la barra flotando a media pantalla al hacer scroll.
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          // Pegada al borde inferior: solo el safe-area, sin padding extra
          // (Santiago, 27 nov 2026: la píldora se veía muy alta).
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
          {items.slice(0, 2).map(renderNavItem)}
          {items.slice(2).map(renderNavItem)}
          {isCoachUser && renderPlusSlot()}
        </div>
      </nav>

      <CoachVideoUploadSheet open={videoOpen} onOpenChange={setVideoOpen} />
      <AddPackageModal open={packageOpen} onOpenChange={setPackageOpen} />
      <AddLessonModal open={lessonOpen} onOpenChange={setLessonOpen} />
      <AddStudentModal open={studentOpen} onOpenChange={setStudentOpen} />
      <AiInsightsModal open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}
