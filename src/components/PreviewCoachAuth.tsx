import { ReactNode, useMemo } from 'react';
import { AuthContext, useAuth } from '@/contexts/AuthContext';
import { useCoachPreview } from '@/contexts/CoachPreviewContext';

/**
 * Re-publishes auth inside the coach preview so every nested admin page
 * reads the PREVIEWED coach's identity (user.id / effectiveCoachId = coachId).
 * The real session (auth.uid()) stays the admin's; writes are blocked by the guard.
 */
export function PreviewCoachAuth({ children }: { children: ReactNode }) {
  const real = useAuth();
  const ctx = useCoachPreview();
  const coachId = ctx?.coachId ?? null;
  const profile = ctx?.coachProfile ?? null;

  const value = useMemo(() => ({
    ...real,
    user: (coachId ? { ...(real.user as any), id: coachId, email: profile?.email ?? real.user?.email } : real.user) as any,
    profile,
    role: 'coach' as const,
    permissions: [] as string[],
    hasPermission: () => true,
    isStaff: false,
    isStaffView: true,
    isAlsoStudent: false,
    canSwitchViews: false,
    previewTier: null,
    previewCoachId: null,
    previewCoachLabel: null,
    previewCoachPricingId: null,
    effectiveIsAdmin: false,
    effectiveCoachId: coachId,
    loading: false,
  }), [real, coachId, profile]);

  return <AuthContext.Provider value={value as any}>{children}</AuthContext.Provider>;
}
