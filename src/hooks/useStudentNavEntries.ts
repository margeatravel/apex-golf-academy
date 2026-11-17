import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, Video, Star, TrendingUp, Sparkles, User, CalendarPlus,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Single source of truth for the STUDENT side-menu navigation.
 * Both the desktop sidebar (StudentBottomNav) and the mobile drawer
 * (MobileMenu) render from this exact flat list, in this exact order:
 * Inicio, Mis clases, Videos, Pro Zone, Reporte de avances, Apex AI, Mi perfil.
 *
 * Actions (Book, Add a Round) and account extras (Mi plan, Contactar Coach,
 * Ajustes) live on the surfaces that own them: the bottom bar / "+" window,
 * and the profile page — not in this menu.
 */

export type StudentNavItem = {
  label: string;
  Icon: typeof Home;
  onClick: () => void;
  active: boolean;
  color?: string;
};

const GOLD = '#F2C040';

export function useStudentNavEntries() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const entries: StudentNavItem[] = [
    { label: t('misc.navHome'), Icon: Home, onClick: () => navigate('/dashboard'), active: isActive('/dashboard') },
    { label: t('misc.navMyLessons'), Icon: Calendar, onClick: () => navigate('/lessons'), active: isActive('/lessons') },
    { label: t('misc.navVideos'), Icon: Video, onClick: () => navigate('/videos'), active: isActive('/videos') },
    // Pro Zone is a top-level section for every plan. Viewers without access
    // land on the existing locked/teaser state inside the page itself.
    { label: t('misc.navProZone'), Icon: Star, onClick: () => navigate('/pro-zone'), active: isActive('/pro-zone') },
    // Reports and Highlights used to be two entries; both target the same
    // reports view, so they are merged into one.
    { label: t('misc.navMyReports'), Icon: TrendingUp, onClick: () => navigate('/pro-zone/stats?view=reports'), active: isActive('/pro-zone/stats'), color: GOLD },
    { label: t('misc.navApexAI'), Icon: Sparkles, onClick: () => navigate('/ai-coach'), active: isActive('/ai-coach'), color: GOLD },
    { label: t('misc.navProfile'), Icon: User, onClick: () => navigate('/profile'), active: isActive('/profile') },
    { label: language === 'en' ? 'Connect calendar' : 'Conectar calendario', Icon: CalendarPlus, onClick: () => navigate('/calendar-connect'), active: isActive('/calendar-connect') },
  ];

  return { entries };
}
