import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home, User, CalendarPlus, Plus, X, ChevronRight,
  Calendar, Video, Star, MessageCircle, Flag, Trophy, Sparkles, TrendingUp, Settings,
  Smartphone, LogOut, CreditCard,
} from 'lucide-react';
import { InstallAppModal } from '@/components/InstallAppModal';
import { replayTour } from '@/components/GuidedTour';
import { useAuth, hasProZoneAccess } from '@/contexts/AuthContext';
import { InternalBookingModal } from '@/components/InternalBookingModal';
import { LogRoundModal } from '@/components/LogRoundModal';
import { RequireCoachModal } from '@/components/RequireCoachModal';
import { useQueryClient } from '@tanstack/react-query';
import { getTierTheme } from '@/lib/tierTheme';
import { ApexMark } from '@/components/ApexBrand';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentNavEntries } from '@/hooks/useStudentNavEntries';


/**
 * Desktop (lg+) only: toggles the body class that reserves room for the
 * fixed left sidebar and widens page containers. Mobile is untouched.
 */
function useDesktopSidebarBodyClass(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add('student-desktop-nav');
    return () => document.body.classList.remove('student-desktop-nav');
  }, [enabled]);
}

/**
 * Oura-inspired floating bottom navigation for student routes.
 * - Single dark pill capsule, NOT a full-width bar
 * - 3 icons (Home / Book / Profile) + central "+" FAB
 * - FAB expands upward into a stack of 5 colored circle shortcuts
 */
export function StudentBottomNav() {
  const { user, profile, effectivePlan, graceUntil, trialEndsAt, hasLinkedCoach, signOut } = useAuth();
  const { t } = useLanguage();
  const { navBg: tierNavBg, border: tierBorder } = getTierTheme(effectivePlan);
  const location = useLocation();
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [logRoundOpen, setLogRoundOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coachGateOpen, setCoachGateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const queryClient = useQueryClient();

  // Single entry point for the Book CTA — checks for a linked coach first.
  const handleBookClick = () => {
    if (!hasLinkedCoach) {
      setCoachGateOpen(true);
      return;
    }
    setBookingOpen(true);
  };

  const authRoutes = ['/auth', '/auth/callback', '/auth/forgot', '/auth/reset'];
  const isAuthPage = authRoutes.some((r) => location.pathname.startsWith(r));
  const isCoachRoute = location.pathname.startsWith('/admin');
  // The one-time onboarding quiz is a standalone full-screen flow.
  const isOnboarding = location.pathname.startsWith('/onboarding');
  const hiddenRoutes = ['/plans', '/videos/upload', '/ai-coach'];
  const isHidden = hiddenRoutes.includes(location.pathname);

  const shellVisible = !!user && !isAuthPage && !isCoachRoute && !isOnboarding;
  // Desktop sidebar shows on every student page; the floating mobile pill
  // keeps its original hidden-routes behaviour.
  useDesktopSidebarBodyClass(shellVisible);

  const canLogRound = hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);

  const handleLogRound = () => {
    setMenuOpen(false);
    if (canLogRound) {
      setLogRoundOpen(true);
    } else {
      navigate('/plans');
    }
  };

  // ── Side menu (desktop sidebar + mobile drawer share ONE list) ──
  // Canonical flat items come from useStudentNavEntries.
  const { entries: desktopEntries } = useStudentNavEntries();

  if (!shellVisible) return null;

  const isActive = (path: string) => location.pathname === path;

  type MenuItem = {
    label: string;
    Icon: typeof Calendar;
    color: string;
    bg: string;
    border: string;
    danger?: boolean;
    onClick: () => void;
  };

  const contactCoachItem: MenuItem = {
    label: t('misc.navContactCoach'), Icon: MessageCircle,
    color: '#5DD4C8', bg: 'rgba(60,170,160,0.20)', border: 'rgba(93,212,200,0.45)',
    onClick: () => {
      setMenuOpen(false);
      window.open(
        'https://wa.me/19153143415?text=Hola%20coach!%20Tengo%20una%20duda%20sobre%20las%20clases',
        '_blank',
        'noopener,noreferrer',
      );
    },
  };

  // Mobile "+" sheet: destinations that are not in the bottom bar.
  const menuItems: MenuItem[] = [
    {
      label: t('misc.navHome'), Icon: Home,
      color: '#F5F0E8', bg: 'rgba(245,240,232,0.14)', border: 'rgba(245,240,232,0.35)',
      onClick: () => { setMenuOpen(false); navigate('/dashboard'); },
    },
    {
      label: t('misc.navMyLessons'), Icon: Calendar,
      color: '#7CC598', bg: 'rgba(74,124,89,0.22)', border: 'rgba(124,197,152,0.45)',
      onClick: () => { setMenuOpen(false); navigate('/lessons'); },
    },
    {
      label: t('misc.navAddRound'), Icon: Flag,
      color: '#EF9F27', bg: 'rgba(239,159,39,0.18)', border: 'rgba(239,159,39,0.45)',
      onClick: handleLogRound,
    },
    {
      label: t('misc.navHighlights'), Icon: Trophy,
      color: '#EF9F27', bg: 'rgba(239,159,39,0.18)', border: 'rgba(239,159,39,0.45)',
      onClick: () => { setMenuOpen(false); navigate('/pro-zone/stats?view=reports'); },
    },
    {
      label: t('misc.navApexAI'), Icon: Sparkles,
      color: '#F2C040', bg: 'rgba(242,192,64,0.18)', border: 'rgba(242,192,64,0.45)',
      onClick: () => { setMenuOpen(false); navigate('/ai-coach'); },
    },
    {
      label: t('misc.navProfile'), Icon: User,
      color: '#F5F0E8', bg: 'rgba(245,240,232,0.12)', border: 'rgba(245,240,232,0.3)',
      onClick: () => { setMenuOpen(false); navigate('/profile'); },
    },
    contactCoachItem,
    {
      label: t('misc.navSettings'), Icon: Settings,
      color: '#CBD5E1', bg: 'rgba(203,213,225,0.16)', border: 'rgba(203,213,225,0.4)',
      onClick: () => { setMenuOpen(false); navigate('/settings'); },
    },
  ];

  // Account-level extras in the same sheet.
  const menuExtras: MenuItem[] = [
    {
      label: t('plans.managePlan'), Icon: CreditCard,
      color: '#F0C040', bg: 'rgba(240,192,64,0.14)', border: 'rgba(240,192,64,0.35)',
      onClick: () => { setMenuOpen(false); navigate('/plans?tab=plans'); },
    },
    {
      label: t('nav.replayTour'), Icon: Sparkles,
      color: '#F0C040', bg: 'rgba(240,192,64,0.14)', border: 'rgba(240,192,64,0.35)',
      onClick: () => { setMenuOpen(false); if (user) replayTour(user.id, 'student'); },
    },
    {
      label: t('dashboard.installApp'), Icon: Smartphone,
      color: '#CBD5E1', bg: 'rgba(203,213,225,0.14)', border: 'rgba(203,213,225,0.35)',
      onClick: () => { setMenuOpen(false); setInstallOpen(true); },
    },
    {
      label: t('nav.signOut'), Icon: LogOut, danger: true,
      color: '#F87171', bg: 'rgba(248,113,113,0.14)', border: 'rgba(248,113,113,0.4)',
      onClick: () => { setMenuOpen(false); signOut(); },
    },
  ];

  // Mobile bottom bar (FAB is rendered separately as a 6th slot).
  const navItems: Array<{
    label: string; Icon: typeof Home; onClick: () => void; active: boolean; gold?: boolean; green?: boolean;
  }> = [
    { label: t('misc.navBook'), Icon: CalendarPlus, onClick: handleBookClick, active: false, green: true },
    { label: t('misc.navVideos'), Icon: Video, onClick: () => navigate('/videos'), active: isActive('/videos') },
    // Pro Zone tab is always visible to tease the upsell; gating happens inside the route.
    { label: t('misc.navProZone'), Icon: Star, onClick: () => navigate('/pro-zone'), active: isActive('/pro-zone') },
    { label: t('misc.navMyReports'), Icon: TrendingUp, onClick: () => navigate('/pro-zone/stats?view=reports'), active: location.pathname === '/pro-zone/stats' },
    { label: t('misc.navMyLessons'), Icon: Calendar, onClick: () => navigate('/lessons'), active: isActive('/lessons') },
  ];

  const GOLD = '#F2C040';
  const GREEN = '#7CC598';

  return (
    <>
      {/* ─────────────── DESKTOP SIDEBAR (lg+ only) ─────────────── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-50 w-60 flex-col gap-1 px-3 py-5"
        aria-label={t('misc.navPrimary')}
        style={{
          background: tierNavBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: `1px solid ${tierBorder}`,
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-3 px-2 pb-5 text-left"
        >
          <ApexMark size="sm" glow />
          <span className="min-w-0">
            <span className="block text-ivory font-heading font-bold text-sm leading-tight">{t('misc.academyName')}</span>
            <span className="block text-ivory/50 text-[10px] uppercase tracking-[0.18em]">{t('misc.academyTag')}</span>
          </span>
        </button>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {desktopEntries.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              aria-current={item.active ? 'page' : undefined}
              className="group flex items-center gap-3 px-3 h-10 rounded-xl transition-all duration-200 hover:bg-white/[0.06]"
              style={{
                background: item.active ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: item.color ?? (item.active ? '#FFFFFF' : 'rgba(245,240,232,0.6)'),
              }}
            >
              <item.Icon className="h-[18px] w-[18px]" strokeWidth={item.active ? 2.4 : 2} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Floating menu window (mobile only) — compact window above the bar */}
      {menuOpen && !isHidden && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          {/* Invisible click-catcher to close (no full-screen dim) */}
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('misc.navMenuTitle')}
            className="absolute left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] w-[92vw] max-w-[340px] rounded-3xl overflow-hidden animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-200"
            style={{
              background: tierNavBg,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${tierBorder}`,
              boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/40">
                {t('misc.navMenuTitle')}
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('misc.navCloseMenu')}
                className="h-8 w-8 rounded-full flex items-center justify-center text-ivory/70"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div
              className="overflow-y-auto px-2.5 pt-0.5"
              style={{
                maxHeight: '56vh',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
              }}
            >
              {[
                { title: t('misc.navGroupMain'), items: menuItems },
                { title: t('misc.navGroupMore'), items: menuExtras.filter((i) => !i.danger) },
              ].map((group, gi) => (
                <div key={gi} className={`animate-in fade-in slide-in-from-bottom-2 ${gi > 0 ? 'mt-4' : ''}`}>
                  <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/40">
                    {group.title}
                  </p>
                  <div
                    className="rounded-2xl overflow-hidden divide-y divide-white/[0.06]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}
                  >
                    {group.items.map((item) => (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-white/10 transition-colors"
                      >
                        <span
                          className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: item.bg, border: `1px solid ${item.border}` }}
                        >
                          <item.Icon className="h-[18px] w-[18px]" style={{ color: item.color }} />
                        </span>
                        <span className="flex-1 text-sm font-medium text-ivory">{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-ivory/30" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {menuExtras.filter((i) => i.danger).map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium active:bg-white/10"
                  style={{ color: item.color, background: item.bg, border: `1px solid ${item.border}` }}
                >
                  <item.Icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating pill nav — Oura style (mobile / tablet only) */}
      <nav
        hidden={isHidden}
        className={`${isHidden ? 'hidden' : ''} lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none`}
        style={{
          // Anchor to the viewport bottom edge directly (no transform-based
          // centering): guarantees the bar never detaches mid-screen on iOS
          // when the visual viewport shifts during scroll.
          // (Santiago, 26 nov 2026: en su iPad la píldora se quedaba
          // flotando en medio de la página al hacer scroll.) Forzar su
          // propia capa de composición para que iOS Safari no la deje
          // atrás durante el scroll con inercia: sin esto, el `fixed`
          // se repinta tarde y la barra aparece a media pantalla.
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
        aria-label={t('misc.navPrimary')}
      >
        <div
          className="pointer-events-auto flex items-center justify-between px-3 py-2 rounded-full mx-auto w-[95vw] max-w-xl"
          style={{
            background: tierNavBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: `1px solid ${tierBorder}`,
            boxShadow: '0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 h-14 flex-1 rounded-full transition-colors"
              style={{
                color: item.gold
                  ? GOLD
                  : item.green
                    ? GREEN
                    : (item.active ? '#FFFFFF' : 'rgba(245,240,232,0.55)'),
              }}
            >
              <item.Icon
                className="h-[22px] w-[22px]"
                strokeWidth={item.gold || item.green ? 2.2 : (item.active ? 2.4 : 2)}
                style={
                  item.gold
                    ? { filter: 'drop-shadow(0 0 6px #F2C040) drop-shadow(0 0 12px rgba(242,192,64,0.55))' }
                    : undefined
                }
              />
              <span
                className="text-[10px] font-medium leading-none mt-0.5"
                style={{
                  color: item.gold
                    ? GOLD
                    : item.green
                      ? GREEN
                      : (item.active ? '#FFFFFF' : 'rgba(245,240,232,0.55)'),
                  textShadow: item.gold
                    ? '0 0 6px rgba(242,192,64,0.85), 0 0 12px rgba(242,192,64,0.5)'
                    : undefined,
                }}
              >
                {item.label}
              </span>
              {item.active && (
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
          ))}

          {/* FAB plus button — same size, sits in the same pill */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? t('misc.navCloseMenu') : t('misc.navOpenQuickActions')}
            aria-expanded={menuOpen}
            className="flex items-center justify-center h-12 w-12 rounded-full transition-transform flex-shrink-0 ml-1"
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
      </nav>

      <InternalBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
      <InstallAppModal open={installOpen} onOpenChange={setInstallOpen} />
      <RequireCoachModal
        open={coachGateOpen}
        onOpenChange={setCoachGateOpen}
        reason="book"
        onLinked={() => setBookingOpen(true)}
      />
      {profile?.id && (
        <LogRoundModal
          open={logRoundOpen}
          onOpenChange={setLogRoundOpen}
          studentId={profile.id}
        />
      )}
    </>
  );
}
