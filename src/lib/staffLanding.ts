import { STAFF_ACCESS_AREAS } from '../../supabase/functions/_shared/staff-scopes';
// All staff with at least one granted scope land on the central staff menu,
// where they can pick a section. Per-scope direct routes are still used as
// fallbacks for callers that want a specific deep link.
export const STAFF_SCOPE_ROUTE_PRIORITY: Record<string, string> = Object.fromEntries(
  STAFF_ACCESS_AREAS.map(area => [area.id, area.route]),
);

export function getStaffLandingRoute(permissions: string[]): string | null {
  if (!permissions || permissions.length === 0) return null;
  // Prefer the central staff menu when the user has any granted scope.
  for (const scope of Object.keys(STAFF_SCOPE_ROUTE_PRIORITY)) {
    if (permissions.includes(scope)) return '/staff';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dual-role (staff + student) view switching
// ---------------------------------------------------------------------------

export type AppViewMode = 'student' | 'staff';

/**
 * Single source of truth for "does this user have active staff scopes?".
 * Reuses getStaffLandingRoute so scope resolution is never duplicated.
 */
export function hasActiveStaffScopes(permissions: string[]): boolean {
  return getStaffLandingRoute(permissions) !== null;
}

function viewModeKey(userId: string) {
  return `apex_view_mode_${userId}`;
}

/** Persisted per user, survives sessions. Never grants access by itself. */
export function readStoredViewMode(userId: string | null | undefined): AppViewMode | null {
  if (!userId || typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(viewModeKey(userId));
  return v === 'staff' || v === 'student' ? v : null;
}

export function storeViewMode(userId: string | null | undefined, mode: AppViewMode): void {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(viewModeKey(userId), mode);
}

/**
 * Resolve the post-login landing route from DB-derived facts only.
 * The stored preference is applied ONLY when the DB still says the user has
 * active staff scopes; otherwise it is ignored and they land as a student.
 */
export function resolveLandingRoute(opts: {
  userId: string | null | undefined;
  permissions: string[];
  isAlsoStudent: boolean;
}): string {
  const staffRoute = getStaffLandingRoute(opts.permissions);
  if (!staffRoute) return '/dashboard';
  if (!opts.isAlsoStudent) return staffRoute;
  // Dual role: default to the student portal unless they chose staff mode.
  return readStoredViewMode(opts.userId) === 'staff' ? staffRoute : '/dashboard';
}
