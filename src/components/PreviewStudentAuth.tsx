import { ReactNode, useMemo } from 'react';
import { AuthContext, useAuth, getEffectivePlan } from '@/contexts/AuthContext';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';

/**
 * Inside the read-only student preview, every page must read the PREVIEWED
 * student's identity instead of the signed-in owner's. Rather than threading a
 * studentId through every hook, this provider re-publishes the auth context
 * with the student's id / profile / plan for the whole preview subtree.
 *
 * The real Supabase session is untouched: auth.uid() (and therefore RLS on any
 * write) still belongs to the owner.
 */
export function PreviewStudentAuth({ children }: { children: ReactNode }) {
  const real = useAuth();
  const { studentId, previewProfile } = useStudentPreview();

  const value = useMemo(() => {
    const profile: any = previewProfile;
    return {
      ...real,
      // Identity of the previewed student.
      user: (studentId ? { ...(real.user as any), id: studentId } : real.user) as any,
      profile,
      role: 'student' as const,
      // Plan / trial / coach come from the student's own profile.
      effectivePlan: getEffectivePlan(profile),
      graceUntil: null,
      graceTier: null,
      trialEndsAt: profile?.trial_ends_at ?? null,
      hasLinkedCoach: !!profile?.assigned_coach_id,
      // No owner/staff capabilities leak into the previewed portal.
      permissions: [] as string[],
      hasPermission: () => false,
      isStaff: false,
      isStaffView: false,
      isAlsoStudent: true,
      canSwitchViews: false,
      previewTier: null,
      previewCoachId: null,
      previewCoachLabel: null,
      previewCoachPricingId: null,
      effectiveIsAdmin: false,
      effectiveCoachId: null,
      subscription: null,
      checkingSubscription: false,
      loading: false,
    };
  }, [real, studentId, previewProfile]);

  return <AuthContext.Provider value={value as any}>{children}</AuthContext.Provider>;
}
