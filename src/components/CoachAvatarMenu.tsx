import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  GraduationCap,
  Sparkles,
  ShieldCheck,
  Copy,
  ExternalLink,
  LogOut,
  ChevronDown,
  Ticket,
  Eye,
} from 'lucide-react';
import { StudentPreviewSearch } from '@/components/StudentPreviewSearch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { demoCoachProfile } from '@/data/demoData';
import { LanguageToggle } from '@/components/LanguageToggle';
import { replayTour } from '@/components/GuidedTour';
import { supabase } from '@/integrations/supabase/client';

const STUDENT_PORTAL_URL = 'https://apexgolf.com.mx';

const initialsOf = (name?: string | null, email?: string | null) => {
  const src = (name || email || '').trim();
  if (!src) return 'C';
  const parts = src.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'C';
};

/**
 * Always-visible avatar dropdown for the Coach Portal header.
 * Mirrors the student avatar pattern so Profile / Sign Out are never
 * pushed off-screen no matter how narrow the viewport is.
 */
export function CoachAvatarMenu() {
  const { user, profile: realProfile, role, signOut, setPreviewTier, effectiveIsAdmin } = useAuth();
  const { isDemoMode, canUseDemoMode, toggleDemoMode } = useDemoMode();
  const profile = isDemoMode
    ? { ...(realProfile || {}), full_name: demoCoachProfile.full_name, email: demoCoachProfile.email, photo_url: demoCoachProfile.photo_url }
    : realProfile;
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';

  const { data: previewPlans = [] } = useQuery({
    queryKey: ['billing-plans-preview-menu'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('name, tier_key, plan_type, sort_order')
        .in('plan_type', ['subscription', 'internal'])
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as { name: string; tier_key: string; plan_type: string; sort_order: number }[];
    },
    enabled: isAdmin,
  });

  // Non-owner coaches (and previewing modes) don't get a top-right avatar
  // dropdown at all — they navigate exclusively via their side menu.
  if (!effectiveIsAdmin) return null;

  const previewAs = (tier: string) => {
    setPreviewTier(tier as any);
    navigate('/dashboard');
  };

  const handleReplayTour = async () => {
    if (!user) return;
    toast.success(t('dashboard.restartingTour'));
    await replayTour(user.id, 'coach');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('nav.accountMenu')}
          className="flex items-center gap-1 h-9 pl-1 pr-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <span
            className="h-7 w-7 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              background: 'rgba(74,124,89,0.85)',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-ivory text-[11px] font-semibold">
                {initialsOf(profile?.full_name, profile?.email)}
              </span>
            )}
          </span>
          <ChevronDown className="h-3 w-3 text-ivory/60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-60 border shadow-lg z-50"
        style={{
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255,255,255,0.15)',
        }}
      >
        <DropdownMenuLabel
          className="flex items-center justify-between"
          style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}
        >
          <span className="truncate">{profile?.full_name || t('nav.coach')}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />

        <DropdownMenuItem
          onClick={() => navigate('/admin/profile')}
          className="gap-2 cursor-pointer"
          style={{ color: '#F5F0E8' }}
        >
          <User className="h-4 w-4" /> {t('nav.profile')}
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuLabel
              className="flex items-center gap-2"
              style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}
            >
              <GraduationCap className="h-3.5 w-3.5" /> {t('nav.studentPreview')}
            </DropdownMenuLabel>
            <div
              className="px-2 pb-2"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Select
                onValueChange={(v) => {
                  previewAs(v);
                }}
              >
                <SelectTrigger
                  className="h-8 text-xs border-white/15 bg-white/5"
                  style={{ color: '#F5F0E8' }}
                >
                  <SelectValue placeholder={t('i18nExtras.selectTierToPreview')} />
                </SelectTrigger>
                <SelectContent
                  className="z-[60] border shadow-lg"
                  style={{
                    background: 'rgba(0,0,0,0.94)',
                    backdropFilter: 'blur(20px)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    color: '#F5F0E8',
                  }}
                >
                  {previewPlans.map((p) => (
                    <SelectItem key={p.tier_key} value={p.tier_key}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
          </Select>
            </div>
            <DropdownMenuLabel
              className="flex items-center gap-2"
              style={{ color: '#E8D5B0', opacity: 0.7, fontSize: 11 }}
            >
              <Eye className="h-3.5 w-3.5" /> Ver como alumno
            </DropdownMenuLabel>
            <StudentPreviewSearch />
          </>
        )}

        {isAdmin && (
          <>
            <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
            <DropdownMenuItem
              onClick={() => navigate('/admin/invites')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8' }}
            >
              <Ticket className="h-4 w-4 text-gold-accent" /> {t('i18nExtras.inviteCodes')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate('/admin/staff')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8' }}
            >
              <ShieldCheck className="h-4 w-4" /> {t('nav.staffAccess')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate('/admin/coaches')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8' }}
            >
              <ShieldCheck className="h-4 w-4 text-gold-accent" /> {t('nav.coachAccess')}
            </DropdownMenuItem>
            <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(STUDENT_PORTAL_URL);
                toast.success(t('dashboard.portalLinkCopied'));
              }}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8' }}
            >
              <Copy className="h-4 w-4" /> {t('nav.copyPortalLinkShort')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(STUDENT_PORTAL_URL, '_blank')}
              className="gap-2 cursor-pointer"
              style={{ color: '#F5F0E8' }}
            >
              <ExternalLink className="h-4 w-4" /> {t('nav.openPortal')}
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />

        {canUseDemoMode && (
          <DropdownMenuItem
            onClick={(e) => { e.preventDefault(); toggleDemoMode(); }}
            className="gap-2 cursor-pointer"
            style={{ color: isDemoMode ? '#fb923c' : '#F5F0E8' }}
          >
            🎭 {isDemoMode ? 'Salir Modo Demo' : 'Activar Modo Demo'}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={handleReplayTour}
          className="gap-2 cursor-pointer"
          style={{ color: '#F5F0E8' }}
        >
          <Sparkles className="h-4 w-4 text-gold-accent" /> {t('nav.replayTour')}
        </DropdownMenuItem>

        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Language toggle */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs" style={{ color: '#F5F0E8', opacity: 0.7 }}>
            {t('language.label')}
          </span>
          <LanguageToggle variant="inline" />
        </div>

        <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.1)' }} />

        <DropdownMenuItem
          onClick={signOut}
          className="gap-2 cursor-pointer text-red-400 focus:text-red-400 hover:text-red-300 hover:bg-red-400/10"
        >
          <LogOut className="h-4 w-4" /> {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}