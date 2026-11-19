import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, Calendar, DollarSign, BarChart3, Video, Settings, LogOut,
  GraduationCap, UserCog, Copy, ExternalLink, LinkIcon, ChevronDown, CreditCard, Sparkles, Star, ShieldCheck, CalendarCheck, Clock, User
} from 'lucide-react';
import { replayTour } from '@/components/GuidedTour';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageToggle } from '@/components/LanguageToggle';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { demoCoachProfile } from '@/data/demoData';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';

const STUDENT_PORTAL_URL = 'https://margeagolfacademy.com';

// Each nav item is gated by a scope. Admins see everything; staff see only
// the items whose scope they were granted on the Staff Access page.
// `labelKey` resolves through the i18n dictionary at render time.
const navItems = [
  { labelKey: 'admin.navStudents',    path: '/admin/students',           icon: Users,       scope: 'students' as const },
  { labelKey: 'admin.navLessons',     path: '/admin/lessons',            icon: Calendar,    scope: 'lessons' as const },
  { labelKey: 'admin.navPriority',    path: '/admin/fixed-schedule',     icon: CalendarCheck, scope: 'lessons' as const },
  { labelKey: 'admin.navAvailability', path: '/admin/availability',      icon: Clock,       scope: 'lessons' as const },
  { labelKey: 'admin.navRevenue',     path: '/admin/revenue',            icon: DollarSign,  scope: 'revenue' as const },
  { labelKey: 'admin.navSubscribers', path: '/admin/subscribers',        icon: UserCog,     scope: 'subscribers' as const },
  { labelKey: 'admin.navStripe',      path: '/admin/stripe-payments',    icon: CreditCard,  scope: 'stripe_payments' as const },
  { labelKey: 'admin.navAnalysis',    path: '/admin/analysis-requests',  icon: BarChart3,   scope: 'analysis_requests' as const },
  { labelKey: 'admin.navProZone',     path: '/admin/pro-zone',           icon: Star,        scope: 'pro_zone' as const },
  { labelKey: 'admin.navSettings',    path: '/admin/settings',           icon: Settings,    scope: 'settings' as const },
];

export function CoachDesktopNav() {
  const { signOut, profile: realProfile, user, role, hasPermission, setPreviewTier, effectiveIsAdmin } = useAuth();
  const { isDemoMode, canUseDemoMode, toggleDemoMode } = useDemoMode();
  const profile = isDemoMode
    ? { ...(realProfile || {}), full_name: demoCoachProfile.full_name, email: demoCoachProfile.email, photo_url: demoCoachProfile.photo_url }
    : realProfile;
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const previewAs = (
    tier: 'free' | 'member' | 'scratch' | 'pro' | 'apex',
  ) => {
    setPreviewTier(tier);
    navigate('/dashboard');
  };

  const isAdmin = effectiveIsAdmin;
  const isAdminOrCoach = isAdmin || role === 'coach' || role === 'admin';
  // Non-owner coaches (role='coach') only get a curated subset of nav items.
  // The owner's menu is unchanged.
  const COACH_ONLY_SCOPES = new Set(['lessons', 'pro_zone', 'settings']);
  const visibleItems = navItems.filter((item) => {
    // Pro Zone media is admin-only (owner), not partner coaches.
    if (item.scope === 'pro_zone') return isAdmin;
    if (!isAdmin) {
      // Priority Spot + Availability both live under 'lessons' scope in navItems.
      // Hide students, revenue, subscribers, stripe payments, analysis requests.
      return COACH_ONLY_SCOPES.has(item.scope);
    }
    return isAdminOrCoach ? true : hasPermission(item.scope);
  });

  const handleReplayTour = async () => {
    if (!user) return;
    toast.success(t('dashboard.restartingTour'));
    await replayTour(user.id, 'coach');
  };

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="hidden lg:flex items-center gap-1">
      {/* Main nav links */}
      <nav className="flex items-center gap-0.5 mr-2">
        {isAdminOrCoach && <Button asChild variant="ghost" size="sm" className={isActive('/admin/inbox') ? 'bg-secondary text-foreground' : 'text-muted-foreground'}><Link to="/admin/inbox"><Inbox className="h-3.5 w-3.5" />{language === 'es' ? 'Bandeja de entrada' : 'Inbox'}</Link></Button>}
        {visibleItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive(item.path)
                ? 'bg-white/15 text-[#F5F0E8]'
                : 'text-[#F5F0E8]/60 hover:text-[#F5F0E8] hover:bg-white/8'
            }`}
          >
            <item.icon className="h-3.5 w-3.5" />
            {t(item.labelKey)}
          </Link>
        ))}
        {!isAdmin && (role === 'coach' || role === 'admin') && (
          <Link
            to="/admin/integrations/google-calendar"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/admin/integrations/google-calendar')
                ? 'bg-white/15 text-[#F5F0E8]'
                : 'text-[#F5F0E8]/60 hover:text-[#F5F0E8] hover:bg-white/8'
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Google Calendar &amp; Stripe
          </Link>
        )}
        {isAdmin && (
          <Link
            to="/admin/integrations"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/admin/integrations')
                ? 'bg-white/15 text-[#F5F0E8]'
                : 'text-[#F5F0E8]/60 hover:text-[#F5F0E8] hover:bg-white/8'
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Google Calendar &amp; Stripe
          </Link>
        )}
        {!isAdmin && (role === 'coach' || role === 'admin') && (
          <Link
            to="/admin/profile"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/admin/profile')
                ? 'bg-white/15 text-[#F5F0E8]'
                : 'text-[#F5F0E8]/60 hover:text-[#F5F0E8] hover:bg-white/8'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            {t('nav.profile')}
          </Link>
        )}
      </nav>

      <div className="h-5 w-px bg-white/15 mx-1" />

      {/* Global search */}
      <GlobalSearch />

      {/* Demo mode toggle — admin only */}
      {canUseDemoMode && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleDemoMode}
          className="h-8 px-2 text-xs"
          style={
            isDemoMode
              ? { background: 'rgba(249,115,22,0.2)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.5)' }
              : { color: 'rgba(245,240,232,0.7)' }
          }
          title={isDemoMode ? 'Salir Modo Demo' : 'Activar Modo Demo'}
        >
          🎭 Demo
        </Button>
      )}

      {/* Notifications */}
      <NotificationBell />

      {/* Language toggle */}
      <LanguageToggle variant="header" />

      {/* Portal link — admin only */}
      {isAdmin && (
        <Button
          variant="ghost" size="sm"
          className="text-xs text-[#F5F0E8]/60 hover:text-[#F5F0E8] hover:bg-white/8 gap-1 h-8"
          onClick={() => { navigator.clipboard.writeText(STUDENT_PORTAL_URL); toast.success(t('dashboard.portalLinkCopied')); }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Profile dropdown with logout */}
      {isAdmin && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-[#F5F0E8]/70 hover:text-[#F5F0E8] hover:bg-white/8">
            <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: '#4a7c59', color: '#F5F0E8' }}>
              {profile?.full_name?.charAt(0) || 'C'}
            </div>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-52 border shadow-lg z-50"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)' }}
          align="end"
        >
          <DropdownMenuLabel style={{ color: '#E8D5B0', opacity: 0.6, fontSize: 11 }}>
            {profile?.full_name || t('admin.coachFallback')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
          
          <DropdownMenuLabel className="flex items-center gap-2" style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}>
            <GraduationCap className="h-3.5 w-3.5" /> {t('nav.studentPreview')}
          </DropdownMenuLabel>
          <div
            className="px-2 pb-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Select
              onValueChange={(v) => {
                previewAs(v as 'member' | 'scratch' | 'pro' | 'apex');
              }}
            >
              <SelectTrigger className="h-8 text-xs border-white/15 bg-white/5" style={{ color: '#F5F0E8' }}>
                <SelectValue placeholder={t('i18nExtras.selectTierToPreview')} />
              </SelectTrigger>
              <SelectContent
                className="z-[60] border shadow-lg"
                style={{ background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)', color: '#F5F0E8' }}
              >
                <SelectItem value="member">Free</SelectItem>
                <SelectItem value="scratch">Scratch</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="apex">Apex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
          
          <DropdownMenuItem
            onClick={() => { navigator.clipboard.writeText(STUDENT_PORTAL_URL); toast.success(t('dashboard.portalLinkCopied')); }}
            className="gap-2 cursor-pointer" style={{ color: '#F5F0E8' }}
          >
            <Copy className="h-4 w-4" /> {t('nav.copyPortalLinkShort')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.open(STUDENT_PORTAL_URL, '_blank')}
            className="gap-2 cursor-pointer" style={{ color: '#F5F0E8' }}
          >
            <ExternalLink className="h-4 w-4" /> {t('nav.openPortal')}
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleReplayTour} className="gap-2 cursor-pointer" style={{ color: '#F5F0E8' }}>
            <Sparkles className="h-4 w-4 text-gold-accent" /> {t('nav.replayTour')}
          </DropdownMenuItem>

          {isAdmin && hasPermission('settings') === false ? null : null}
          {isAdmin && (
            <DropdownMenuItem
              onClick={() => navigate('/admin/staff')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8', opacity: 0.85, fontSize: 12 }}
            >
              <ShieldCheck className="h-4 w-4" /> {t('nav.staffAccess')}
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem
              onClick={() => navigate('/admin/coaches')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8', opacity: 0.85, fontSize: 12 }}
            >
              <ShieldCheck className="h-4 w-4 text-gold-accent" /> {t('nav.coachAccess')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />

          <DropdownMenuItem
            onClick={signOut}
            className="gap-2 cursor-pointer text-red-400 focus:text-red-400"
          >
            <LogOut className="h-4 w-4" /> {t('nav.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  );
}
