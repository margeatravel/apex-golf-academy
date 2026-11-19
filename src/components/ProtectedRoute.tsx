import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { getStaffLandingRoute } from '@/lib/staffLanding';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireStudent?: boolean;
  /**
   * Allow access if the user is admin OR has this staff scope (e.g. 'pro_zone').
   * Used for granular per-section access for non-admin staff.
   */
  requirePermission?: string;
  /**
   * Additive override for routes that are normally student-only (requireStudent)
   * but should also let staff/coach accounts with this granted scope through.
   * Example: /pro-zone and /ai-coach allow staff with the 'pro_zone' access area
   * to use the consumer-facing Pro Zone / Margea AI features.
   */
  allowStaffPermission?: string;
}

export function ProtectedRoute({ children, requireAdmin = false, requireStudent = false, requirePermission, allowStaffPermission }: ProtectedRouteProps) {
  const { user, role, profile, loading, hasPermission, permissions, isStaff, isStaffView, isRefreshingProfile, previewTier, canSwitchViews } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Transient state: authenticated but role has not resolved yet. Wait here so
  // coaches never briefly render student-only pages while role data is loading.
  if (user && role === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If we already know the role, do not block the current page during a
  // background profile refresh.
  if (user && isRefreshingProfile && !requireStudent && !requirePermission && !requireAdmin) {
    return <>{children}</>;
  }

  // Student portal routes are only for real students, except when an admin
  // intentionally uses Student Preview. Coaches should never land in the
  // student profile/dashboard by accident.
  if (requireStudent) {
    // Additive: for staff-permission overrides, wait until the profile/role
    // refresh has finished loading staff_permissions. Otherwise a staff user
    // can briefly have role='staff' with permissions=[] and get incorrectly
    // redirected to /not-authorized before 'pro_zone' arrives.
    if (allowStaffPermission && isRefreshingProfile && (role === 'admin' || role === 'coach' || role === 'staff' || isStaffView)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    if (role === 'admin' && previewTier) return <>{children}</>;
    // Additive: staff/coach with the granted scope may use this student-facing
    // route (e.g. Pro Zone / Margea AI for staff with 'pro_zone' access area).
    if (allowStaffPermission && (role === 'admin' || role === 'coach' || isStaffView) && hasPermission(allowStaffPermission)) {
      return <>{children}</>;
    }
    if (role === 'admin' || role === 'coach') return <Navigate to="/admin" replace />;
    // Dual-role users (staff + student) keep full access to the student portal.
    if (canSwitchViews) return <>{children}</>;
    if (isStaffView) {
      const target = getStaffLandingRoute(permissions);
      return <Navigate to={target ?? '/not-authorized'} replace />;
    }
  }

  // One-time onboarding quiz: brand-new students only. `onboarding_seen_at` is
  // stamped as soon as the flow opens, so it never shows twice (existing
  // students were backfilled by the migration).
  if (
    requireStudent &&
    role === 'student' &&
    !isStaff &&
    profile &&
    !(profile as any).onboarding_completed &&
    !(profile as any).onboarding_seen_at
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Permission-based gating: admin OR scoped staff can pass.
  if (requirePermission) {
    if (role === 'admin') return <>{children}</>;
    // Pro Zone management is admin + scoped staff only (not partner coaches).
    const isOwnerOnly = requirePermission === 'pro_zone' || requirePermission === 'stripe';
    if (!isOwnerOnly && role === 'coach') return <>{children}</>;
    if (hasPermission(requirePermission)) {
      return <>{children}</>;
    }
    // Staff (or anyone) hitting a scope they don't have → not-authorized page.
    // Pure students with no scopes go back to their dashboard instead.
    return <Navigate to={isStaff ? '/not-authorized' : '/dashboard'} replace />;
  }

  if (requireAdmin && role !== 'admin' && role !== 'coach') {
    if (isStaff) {
      // Staff trying to reach an admin-only route → land them on their
      // first assigned section (or not-authorized if they somehow have none).
      const target = getStaffLandingRoute(permissions);
      return <Navigate to={target ?? '/not-authorized'} replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
