import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, hasProZoneAccess } from '@/contexts/AuthContext';
import { ProZoneTeaser } from '@/components/ProZoneTeaser';

/**
 * Single authorization boundary for Pro Zone and every sub-route.
 * Access = paid membership (Scratch / Pro / Apex) via `hasProZoneAccess`, or a
 * staff account that holds the `pro_zone` permission.
 *
 * Inside the admin student preview the auth context is re-published with the
 * previewed student's plan and no staff permissions, so the gate evaluates the
 * STUDENT's plan — a Free student looks locked to the admin too.
 *
 * Content is never rendered before the decision: while auth loads we show a
 * spinner, and a denied user only ever sees the upsell.
 */
export function ProZoneGate({ children }: { children: ReactNode }) {
  const { user, loading, effectivePlan, graceUntil, trialEndsAt, role, isStaffView, hasPermission } = useAuth();
  

  if (loading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const staffOverride = (role === 'admin' || role === 'coach' || isStaffView) && hasPermission('pro_zone');
  const allowed = staffOverride || hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);

  if (allowed) return <>{children}</>;

  // Denied: teaser only — real layout, blurred and inert, zero content payload.
  return <ProZoneTeaser />;
}
