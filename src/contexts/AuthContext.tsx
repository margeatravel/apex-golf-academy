import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { hasActiveStaffScopes, readStoredViewMode, storeViewMode, type AppViewMode } from '@/lib/staffLanding';
import { setTierThemeColors } from '@/lib/tierTheme';
import { useNavigate } from 'react-router-dom';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  photo_url: string | null;
  handicap: number | null;
  goals: string | null;
  created_at: string | null;
  plan_tier: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' | null;
  plan_selected_at: string | null;
  // Note: email_video_notifications column exists but is not used for transactional emails
  // Manual override fields for coach-set tiers
  manual_plan_override: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' | null;
  override_expires_at: string | null;
  override_set_by: string | null;
  override_set_at: string | null;
  // Onboarding tour completion timestamp (null = tour will auto-start)
  tour_completed_at: string | null;
  // Pro Zone welcome tour completion timestamp (null = will auto-start once after activation)
  pro_zone_tour_completed_at: string | null;
  // 30-day full-access trial for Free/Member users. NULL once expired or never granted.
  trial_ends_at: string | null;
  // Coach the student is linked to (set via accept-invite). NULL = no coach yet —
  // lesson booking and lesson-pricing flows are gated until this is populated.
  assigned_coach_id: string | null;
  onboarding_seen_at: string | null;
  // True once the student reached the end of the onboarding flow. The route
  // guard reads this first, so a finished student never sees the quiz again.
  onboarding_completed: boolean | null;
}

/**
 * SINGLE SOURCE OF TRUTH for a student's plan (client side).
 * Mirrors the server function `public.get_effective_plan(_user_id)` exactly:
 *   active manual override > plan_tier > 'free'.
 *
 * The 30-day free trial is deliberately NOT a plan. It grants *feature access*
 * (see `isInTrial` / `hasVideosAccess`) but never changes the plan label, so the
 * admin screens and the student portal always show the same tier.
 */
export function getEffectivePlan(profile: Profile | null): 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' {
  if (!profile) return 'free';

  // Check manual override first
  if (profile.manual_plan_override) {
    const expiresAt = profile.override_expires_at ? new Date(profile.override_expires_at) : null;
    // If no expiry or not yet expired, use the override
    if (!expiresAt || expiresAt > new Date()) {
      return profile.manual_plan_override;
    }
  }

  // Fall back to plan_tier or 'free'
  return profile.plan_tier || 'free';
}

/**
 * Only a DEFINITIVE auth failure means the stored session is dead (bad /
 * expired / revoked token). A transient failure — a network blip, a timeout,
 * the auth service being briefly unreachable — must NOT sign the user out:
 * the stored session is still valid and supabase-js will retry the refresh
 * on its own. Treating every getUser() error as "stale session" turned any
 * hiccup while opening the app into a permanent logout (password required
 * again), which is exactly what users reported.
 */
export function isDefinitiveAuthError(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: unknown }).status;
  if (status === 401 || status === 403) return true;
  const message = [
    (error as { message?: unknown }).message,
    (error as { error_description?: unknown }).error_description,
    (error as { code?: unknown }).code,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  return (
    message.includes('invalid jwt') ||
    message.includes('invalid token') ||
    message.includes('jwt expired') ||
    message.includes('token expired') ||
    message.includes('session expired') ||
    message.includes('refresh token') ||
    message.includes('revoked') ||
    message.includes('user not found') ||
    message.includes('not authenticated') ||
    message.includes('auth session missing')
  );
}


// Check if user has access to premium features
export function hasAccess(profile: Profile | null, subscription: { subscribed: boolean } | null): boolean {
  if (!profile) return false;

  // Check for active subscription
  if (subscription?.subscribed) return true;
  
  // Check for manual override
  if (profile.manual_plan_override) {
    const expiresAt = profile.override_expires_at ? new Date(profile.override_expires_at) : null;
    if (!expiresAt || expiresAt > new Date()) {
      return profile.manual_plan_override !== 'free' && profile.manual_plan_override !== 'member';
    }
  }
  
  // Check for paid plan tier (includes the Family plan)
  return profile.plan_tier === 'scratch' || profile.plan_tier === 'pro' || profile.plan_tier === 'apex' || profile.plan_tier === 'family';
}

// Pro Zone access. The per-plan flag lives in billing_plans.pro_zone_enabled
// (single source of truth, same column the server-side has_pro_zone_access reads).
// This module-level cache is refreshed by AuthProvider on mount.
let PRO_ZONE_TIERS: string[] = ['scratch', 'pro', 'apex'];
export function setProZoneTiers(tiers: string[]) {
  if (tiers.length) PRO_ZONE_TIERS = tiers;
}
export function hasProZoneAccess(
  effectivePlan: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family',
  graceUntil?: string | null,
  trialEndsAt?: string | null,
): boolean {
  // Paid plans, the post-cancellation grace window, and an ACTIVE free trial
  // all count as access (during the trial students get the whole portal).
  if (PRO_ZONE_TIERS.includes(effectivePlan === 'free' ? 'member' : effectivePlan)) return true;

  if (graceUntil) {
    const d = new Date(graceUntil);
    if (!Number.isNaN(d.getTime()) && d > new Date()) return true;
  }
  if (isInTrial(trialEndsAt)) return true;
  return false;
}

// Videos access: Same gating as Pro Zone — paid plans (Scratch/Pro)
// or users in the grace window. Free/Member tier sees a teaser only.
export function hasVideosAccess(
  effectivePlan: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family',
  graceUntil?: string | null,
  trialEndsAt?: string | null,
): boolean {
  if (effectivePlan === 'scratch' || effectivePlan === 'pro' || effectivePlan === 'apex' || effectivePlan === 'family') return true;
  if (graceUntil) {
    const d = new Date(graceUntil);
    if (!Number.isNaN(d.getTime()) && d > new Date()) return true;
  }
  // Personal videos (Swing Library) are available during free trial
  if (isInTrial(trialEndsAt)) return true;
  return false;
}

// 30-day trial helper. Returns true if trialEndsAt is a valid future timestamp.
export function isInTrial(trialEndsAt?: string | null): boolean {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return false;
  return d > new Date();
}

// Returns true when the user HAD a trial but it has now expired.
// A user with no trial_ends_at at all is NOT considered expired (they never had one).
export function isTrialExpired(trialEndsAt?: string | null): boolean {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return false;
  return d <= new Date();
}

// Margea AI access. The per-plan flag lives in billing_plans.apex_ai_enabled
// (single source of truth, same column the server-side has_apex_ai_access reads).
// This module-level cache is refreshed by AuthProvider on mount.
let APEX_AI_TIERS: string[] = ['scratch', 'pro', 'apex'];
export function setApexAiTiers(tiers: string[]) {
  if (tiers.length) APEX_AI_TIERS = tiers;
}
export function hasApexAiAccess(
  effectivePlan?: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family',
  graceUntil?: string | null,
  _graceTier?: 'scratch' | 'pro' | 'apex' | null,
  trialEndsAt?: string | null,
): boolean {
  const planKey = effectivePlan === 'free' ? 'member' : effectivePlan;
  if (planKey && APEX_AI_TIERS.includes(planKey)) return true;
  if (graceUntil) {
    const d = new Date(graceUntil);
    if (!Number.isNaN(d.getTime()) && d > new Date()) return true;
  }
  // Full portal access during an active free trial.
  if (isInTrial(trialEndsAt)) return true;
  return false;
}

interface UserRole {
  role: 'admin' | 'coach' | 'staff' | 'student';
}

interface SubscriptionStatus {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  planTier: 'scratch' | 'pro' | 'apex' | 'member' | 'family' | null;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: 'admin' | 'coach' | 'staff' | 'student' | null;
  loading: boolean;
  subscription: SubscriptionStatus | null;
  checkingSubscription: boolean;
  effectivePlan: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family';
  graceUntil: string | null;
  graceTier: 'scratch' | 'pro' | 'apex' | null;
  permissions: string[];
  hasPermission: (scope: string) => boolean;
  isStaff: boolean;
  /**
   * True when staff capabilities are ACTIVE for the current view.
   * A dual-role user who switched to student mode is `isStaff` (DB fact) but
   * NOT `isStaffView`, so no staff scope may influence the student portal.
   */
  isStaffView: boolean;
  /** True when the staff user ALSO has a student profile/activity in the DB. */
  isAlsoStudent: boolean;
  /** True only when the user has active staff scopes AND is also a student. */
  canSwitchViews: boolean;
  /** Persisted per-user view preference ('student' | 'staff'). */
  viewMode: AppViewMode;
  setViewMode: (mode: AppViewMode) => void;
  isRefreshingProfile: boolean;
  // Admin-only tier preview overrides ----------------------------------
  /** Active preview tier (admins only). null = not previewing. */
  previewTier: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' | null;
  /** ISO timestamp when the free 30-day trial ends. null if no trial / expired. */
  trialEndsAt: string | null;
  /** True when the student has linked a coach (profile.assigned_coach_id is set). */
  hasLinkedCoach: boolean;
  setPreviewTier: (
    tier: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' | null,
    options?: { coachPricingId?: string | null },
  ) => void;
  clearPreview: () => void;
  // Admin-only coach preview overrides ---------------------------------
  /** Active coach id being previewed (admins only). null = not previewing a coach. */
  previewCoachId: string | null;
  /** Human-friendly label (name/email) of the previewed coach, for banners. */
  previewCoachLabel: string | null;
  /**
   * When set (admins only, during a Student Preview launched from a specific
   * coach row), the previewed student's "assigned coach" for pricing lookups
   * should be this coach id — so per-coach pricing pages reflect that coach's
   * config instead of the owner's. null = fall back to profile.assigned_coach_id.
   */
  previewCoachPricingId: string | null;
  /** True when the admin is NOT currently previewing a coach. Use for role-gated UI. */
  effectiveIsAdmin: boolean;
  /** The user id whose "coach data" should be shown. previewCoachId when set, else user.id. */
  effectiveCoachId: string | null;
  setPreviewCoach: (coach: { id: string; label: string } | null) => void;
  clearCoachPreview: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setOnboardingSeenAt: (seenAt: string) => void;
  checkSubscription: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<'admin' | 'coach' | 'staff' | 'student' | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);
  const [graceTier, setGraceTier] = useState<'scratch' | 'pro' | 'apex' | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [staffCoachIds, setStaffCoachIds] = useState<Record<string, string>>({});
  const [isAlsoStudent, setIsAlsoStudent] = useState(false);
  const [viewModeState, setViewModeState] = useState<AppViewMode>('student');
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [previewTier, setPreviewTierState] = useState<
    'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' | null
  >(() => {
    if (typeof window === 'undefined') return null;
    const v = window.sessionStorage.getItem('apex_preview_tier');
    return v === 'free' || v === 'member' || v === 'scratch' || v === 'pro' || v === 'apex' || v === 'family'
      ? v
      : null;
  });
  const [previewCoachId, setPreviewCoachIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('apex_preview_coach_id') || null;
  });
  const [previewCoachLabel, setPreviewCoachLabelState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('apex_preview_coach_label') || null;
  });
  const [previewCoachPricingId, setPreviewCoachPricingIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('apex_preview_coach_pricing_id') || null;
  });
  const navigate = useNavigate();

  const clearAuthState = () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setSubscription(null);
    setPermissions([]);
    setStaffCoachIds({});
    setIsAlsoStudent(false);
    setGraceUntil(null);
    setGraceTier(null);
    // Always clear preview when auth is cleared
    setPreviewTierState(null);
    setPreviewCoachIdState(null);
    setPreviewCoachLabelState(null);
    setPreviewCoachPricingIdState(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('apex_preview_tier');
      window.sessionStorage.removeItem('apex_preview_coach_id');
      window.sessionStorage.removeItem('apex_preview_coach_label');
      window.sessionStorage.removeItem('apex_preview_coach_pricing_id');
    }
  };

  // Compute effective plan from profile (manual override > plan_tier > free).
  // Admins can additionally simulate any tier via the preview switcher.
  const baseEffectivePlan = getEffectivePlan(profile);
  const isAdminPreview = role === 'admin' && previewTier !== null;
  const effectivePlan: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family' =
    isAdminPreview ? previewTier : baseEffectivePlan;

  // Refresh the Pro Zone / Margea AI tier caches from billing_plans (admin toggle applies live).
  const [, setPlanTiersVersion] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('billing_plans')
        .select('tier_key, pro_zone_enabled, apex_ai_enabled, color, color_opacity')
        .not('tier_key', 'is', null);
      if (cancelled || !data) return;
      setProZoneTiers(data.filter((p: any) => p.pro_zone_enabled).map((p: any) => p.tier_key));
      setApexAiTiers(data.filter((p: any) => p.apex_ai_enabled).map((p: any) => p.tier_key));
      const colorMap: Record<string, { color: string; opacity: number }> = {};
      for (const p of data as any[]) {
        const key = String(p.tier_key || '').toLowerCase();
        if (!key || key === 'member' || key === 'free') continue;
        if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) {
          colorMap[key] = { color: p.color, opacity: Number(p.color_opacity) || 0.45 };
        }
      }
      setTierThemeColors(colorMap);
      setPlanTiersVersion(v => v + 1);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);


  // Sync tier tint to <body> for global CSS selectors
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.tier = effectivePlan;
    }
  }, [effectivePlan]);

  // Expose trial end timestamp from the profile.
  // When an admin previews a Free/Member tier (without SC access), simulate an active 30-day trial
  // so the trial UI is visible. Paid tiers (scratch/pro/apex) and SC students never show a trial.
  const trialEndsAt: string | null = (() => {
    if (isAdminPreview) {
      const isFreeLike = effectivePlan === 'free' || effectivePlan === 'member';
      if (isFreeLike) {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      return null;
    }
    return profile?.trial_ends_at ?? null;
  })();

  const setPreviewTier: AuthContextType['setPreviewTier'] = (tier, options) => {
    setPreviewTierState(tier);
    const nextCoachPricingId = tier ? (options?.coachPricingId ?? null) : null;
    setPreviewCoachPricingIdState(nextCoachPricingId);
    if (typeof window !== 'undefined') {
      if (tier) {
        window.sessionStorage.setItem('apex_preview_tier', tier);
        if (nextCoachPricingId) {
          window.sessionStorage.setItem('apex_preview_coach_pricing_id', nextCoachPricingId);
        } else {
          window.sessionStorage.removeItem('apex_preview_coach_pricing_id');
        }
      } else {
        window.sessionStorage.removeItem('apex_preview_tier');
        window.sessionStorage.removeItem('apex_preview_coach_pricing_id');
      }
    }
  };

  const clearPreview = () => setPreviewTier(null);

  const setPreviewCoach: AuthContextType['setPreviewCoach'] = (coach) => {
    if (coach) {
      setPreviewCoachIdState(coach.id);
      setPreviewCoachLabelState(coach.label);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('apex_preview_coach_id', coach.id);
        window.sessionStorage.setItem('apex_preview_coach_label', coach.label);
      }
    } else {
      setPreviewCoachIdState(null);
      setPreviewCoachLabelState(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('apex_preview_coach_id');
        window.sessionStorage.removeItem('apex_preview_coach_label');
      }
    }
  };
  const clearCoachPreview = () => setPreviewCoach(null);

  // When previewing a coach, the admin should see the coach's scoped view:
  // effectiveIsAdmin=false + effectiveCoachId=<that coach's id>. Consumers
  // that gate UI on the raw admin role must keep using `role`.
  const effectiveIsAdmin: boolean = role === 'admin' && !previewCoachId;
  const staffCalendarCoach = role === 'staff' ? staffCoachIds.calendar || staffCoachIds.lesson_pricing : undefined;
  const effectiveCoachId: string | null = previewCoachId || staffCalendarCoach || user?.id || null;

  // Admin previewing as a student should also simulate having a coach linked,
  // otherwise the dashboard buy/book flows always look gated in preview.
  const hasLinkedCoach: boolean = isAdminPreview ? true : !!profile?.assigned_coach_id;

  const fetchProfile = async (userId: string) => {
    setIsRefreshingProfile(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (profileData) setProfile(profileData as unknown as Profile);
      // IMPORTANT: only update role/permissions when the fetch *succeeds*.
      // If a transient network/RLS hiccup returns an error (which can happen
      // on token refresh, tab focus, or flaky connectivity), keep the
      // previously known values — otherwise an admin in Coach View briefly
      // becomes a "student" and the Coach View / Student Preview buttons
      // vanish until the next refresh.
      if (!roleError) {
        if (roleData && roleData.length > 0) {
          // Prioritize admin > coach > staff > student if user has multiple roles
          const hasAdmin = roleData.some((r: UserRole) => r.role === 'admin');
          const hasCoach = roleData.some((r: UserRole) => r.role === 'coach');
          const hasStaff = roleData.some((r: UserRole) => r.role === 'staff');
          setRole(hasAdmin ? 'admin' : hasCoach ? 'coach' : hasStaff ? 'staff' : roleData[0].role);
        } else {
          // Empty array with no error = the DB is authoritative and says this
          // user has no role rows (e.g. staff access was just revoked).
          // Never keep a stale cached 'staff'/'coach' role here.
          setRole('student');
        }
      }

      // Fetch staff permissions (granular admin scopes like 'pro_zone')
      try {
        const { data: permsData, error: permsError } = await supabase
          .from('staff_permissions')
          .select('scope, granted_by')
          .eq('user_id', userId);
        if (!permsError) {
          setPermissions((permsData ?? []).map((p: { scope: string }) => p.scope));
          setStaffCoachIds(Object.fromEntries((permsData ?? []).filter(p => p.granted_by).map(p => [p.scope, p.granted_by as string])));
        }
      } catch {
        // Keep previous permissions on transient failure
      }

      // Dual-role detection, always read fresh from the DB (never cached
      // claims): a staff member who also has student activity keeps access
      // to their student portal.
      try {
        const isStudentRole = (roleData ?? []).some((r: UserRole) => r.role === 'student');
        if (isStudentRole || (profileData as any)?.assigned_coach_id) {
          setIsAlsoStudent(true);
        } else {
          const [lessonsRes, videosRes] = await Promise.all([
            supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('student_id', userId),
            supabase.from('videos').select('id', { count: 'exact', head: true }).eq('student_id', userId),
          ]);
          setIsAlsoStudent(((lessonsRes.count ?? 0) + (videosRes.count ?? 0)) > 0);
        }
      } catch {
        // keep previous value on transient failure
      }

      setViewModeState(readStoredViewMode(userId) ?? 'student');

      // Fetch most recent paid-tier grace window from subscription_history
      try {
        const { data: histRow } = await supabase
          .from('subscription_history')
          .select('plan_tier, paid_through')
          .eq('user_id', userId)
          .in('plan_tier', ['scratch', 'pro', 'apex'])
          .gt('paid_through', new Date().toISOString())
          .order('paid_through', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (histRow?.paid_through) {
          setGraceUntil(histRow.paid_through);
          setGraceTier((histRow.plan_tier as 'scratch' | 'pro' | 'apex') ?? null);
        } else {
          setGraceUntil(null);
          setGraceTier(null);
        }
      } catch {
        setGraceUntil(null);
        setGraceTier(null);
      }
    } catch (error) {
      // Do NOT downgrade role/permissions on transient failure — that would
      // hide the Coach View button for an admin who is already authenticated.
      console.error('Error fetching profile (keeping previous role/perms):', error);
    } finally {
      setIsRefreshingProfile(false);
    }
  };

  const checkSubscription = async () => {
    if (!session) {
      setSubscription(null);
      return;
    }

    setCheckingSubscription(true);
    try {
      // Session first: without a valid token there is nothing to check and the
      // edge function would fail with "Auth session missing!".
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        setSubscription(null);
        return;
      }

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        if (!userError || isDefinitiveAuthError(userError)) {
          // Token exists but is no longer valid on the server (expired/revoked).
          setSubscription(null);
          await supabase.auth.signOut().catch(() => {});
          clearAuthState();
          navigate('/auth', { replace: true });
          return;
        }
        // Transient failure validating the session (network blip, auth service
        // briefly unreachable): the stored session is still valid, so keep
        // the user signed in and just skip the subscription check this time.
        console.warn('Could not validate session for subscription check (keeping session):', userError);
        setSubscription(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      
      if (error) {
        console.error('Error checking subscription:', error);
        setSubscription(null);
        return;
      }

      setSubscription({
        subscribed: data.subscribed || false,
        productId: data.product_id || null,
        subscriptionEnd: data.subscription_end || null,
        planTier: data.plan_tier || null,
      });
      // The server check may have reconciled the purchased tier (including promotions).
      // Re-read the profile so every guard uses the same tier in this session.
      await fetchProfile(currentUser.id);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setSubscription(null);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  // Keep route guards in sync immediately after onboarding is persisted.
  // A full profile refresh also runs in the background, but navigation does
  // not need to wait for its unrelated role, permission, and history queries.
  const setOnboardingSeenAt = (seenAt: string) => {
    setProfile((current) => current ? { ...current, onboarding_seen_at: seenAt, onboarding_completed: true } : current);
  };

  // Re-read the profile when the tab regains focus so admin-side changes
  // (e.g. an extended free trial) show up without signing out and back in.
  useEffect(() => {
    if (!user?.id) return;
    const onFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchProfile(user.id);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id]);

  useEffect(() => {
    // Get initial session and validate it against the auth service.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        clearAuthState();
        setLoading(false);
        return;
      }

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        if (!userError || isDefinitiveAuthError(userError)) {
          console.error('Discarding stale local session:', userError);
          clearAuthState();
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        // Transient failure validating the stored session (network blip, auth
        // service briefly unreachable): keep the session, stop loading and
        // let the client retry the refresh — do NOT sign the user out or
        // send them to /auth for a hiccup.
        console.warn('Could not validate stored session (keeping session):', userError);
        setSession(session);
        setUser(session.user);
        fetchProfile(session.user.id);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(currentUser);
      fetchProfile(currentUser.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        const newUser = newSession?.user ?? null;
        setUser((prevUser) => {
          // Only refetch profile when the user actually changes. Token
          // refreshes (TOKEN_REFRESHED) keep the same user id and should
          // NOT trigger a profile refetch — that's what was intermittently
          // resetting role to 'student' mid-session.
          if (newUser && newUser.id !== prevUser?.id) {
            setTimeout(() => fetchProfile(newUser.id), 0);
          } else if (!newUser) {
            clearAuthState();
          }
          return newUser;
        });
      }
    );

    return () => authSub.unsubscribe();
  }, []);

  // Check subscription status when session changes
  useEffect(() => {
    if (session) {
      checkSubscription();
    }
  }, [session]);

  // Refresh profile on window focus to pick up coach changes
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        fetchProfile(user.id);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAuthState();
    navigate('/auth');
  };

  const hasPermission = (scope: string) => permissions.includes(scope);
  // A "staff" user has the explicit 'staff' role. We also treat a non-admin
  // user with granted scopes as staff (defensive — covers any data drift).
  const isStaff = role === 'staff' || (role !== 'admin' && permissions.length > 0);
  // The owner/coach roles are never part of the student/staff view switch.
  const isPrivilegedRole = role === 'admin' || role === 'coach';
  // Scope resolution is delegated to staffLanding.ts (single source of truth).
  const canSwitchViews = !isPrivilegedRole && hasActiveStaffScopes(permissions) && isAlsoStudent;
  // A stored preference never grants access: without active scopes we force
  // student mode regardless of what is persisted.
  const viewMode: AppViewMode = canSwitchViews ? viewModeState : 'student';
  // Staff capabilities are suspended while a dual-role user browses as a student.
  // Admin/coach always keep full staff-side capabilities, independent of view mode.
  const isStaffView = isPrivilegedRole || (isStaff && !(canSwitchViews && viewMode === 'student'));

  const setViewMode = (mode: AppViewMode) => {
    if (!canSwitchViews && mode === 'staff') return;
    setViewModeState(mode);
    storeViewMode(user?.id, mode);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      role, 
      loading, 
      subscription,
      checkingSubscription,
      effectivePlan,
      graceUntil,
      graceTier,
      permissions,
      hasPermission,
      isStaff,
      isStaffView,
      isAlsoStudent,
      canSwitchViews,
      viewMode,
      setViewMode,
      isRefreshingProfile,
      previewTier,
      trialEndsAt,
      hasLinkedCoach,
      setPreviewTier,
      clearPreview,
      previewCoachId,
      previewCoachLabel,
      previewCoachPricingId,
      effectiveIsAdmin,
      effectiveCoachId,
      setPreviewCoach,
      clearCoachPreview,
      signOut, 
      refreshProfile,
      setOnboardingSeenAt,
      checkSubscription
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
