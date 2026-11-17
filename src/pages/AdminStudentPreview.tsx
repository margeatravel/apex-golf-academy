import {
  useParams, Navigate, MemoryRouter, Routes, Route, useLocation,
  UNSAFE_LocationContext, UNSAFE_RouteContext,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { StudentPreviewProvider } from '@/contexts/StudentPreviewContext';
import { StudentPreviewBanner } from '@/components/StudentPreviewBanner';
import { PreviewStudentAuth } from '@/components/PreviewStudentAuth';
import { StudentBottomNav } from '@/components/StudentBottomNav';
import StudentDashboard from '@/pages/StudentDashboard';
import StudentProfile from '@/pages/StudentProfile';
import StudentSettings from '@/pages/StudentSettings';
import StudentLessons from '@/pages/StudentLessons';
import StudentFixedSchedule from '@/pages/StudentFixedSchedule';
import StudentVideos from '@/pages/StudentVideos';
import StudentHighlights from '@/pages/StudentHighlights';
import StudentDrills from '@/pages/StudentDrills';
import StudentAiCoach from '@/pages/StudentAiCoach';
import PlanSelectionPage from '@/pages/PlanSelectionPage';
import { ProZoneGate } from '@/components/ProZoneGate';
import ProZone from '@/pages/ProZone';
import ProZoneStats from '@/pages/ProZoneStats';
import ProZoneCategory from '@/pages/ProZoneCategory';
import ProZoneSwingAnalysis from '@/pages/ProZoneSwingAnalysis';
import CompareSwings from '@/pages/CompareSwings';
import Notifications from '@/pages/Notifications';
import VideoUpload from '@/pages/VideoUpload';
import FamilyChildView from '@/pages/FamilyChildView';
import StudentFamily from '@/pages/StudentFamily';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';

/**
 * Read-only child progress inside the preview.
 * Server-validated twice before rendering: `can_preview_student(studentId)` and
 * an actual family_links row (parent = previewed student, child = childId).
 */
function PreviewFamilyChild() {
  const { childId } = useParams<{ childId: string }>();
  const { studentId } = useStudentPreview();

  const { data: ok, isLoading } = useQuery({
    queryKey: ['preview-family-link', studentId, childId],
    queryFn: async () => {
      const { data: canPreview, error: rpcError } = await supabase.rpc(
        'can_preview_student' as any,
        { _student_id: studentId },
      );
      if (rpcError || canPreview !== true) return false;
      // Same validation FamilyChildView uses: the link is valid in either
      // direction (previewed student as parent OR as child, e.g. pareja).
      const { data: link, error } = await supabase
        .from('family_links')
        .select('id')
        .or(
          `and(parent_user_id.eq.${studentId},child_user_id.eq.${childId}),` +
          `and(child_user_id.eq.${studentId},parent_user_id.eq.${childId})`,
        )
        .maybeSingle();
      if (error) return false;
      return !!link;
    },
    enabled: !!studentId && !!childId,
  });

  if (isLoading) {
    return (
      <div className="app-bg app-bg-green min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (!ok) return <PreviewUnavailable />;
  return <FamilyChildView />;
}

/** Shown for any student route that has no preview equivalent. */
function PreviewUnavailable() {
  const location = useLocation();
  return (
    <div
      className="app-bg app-bg-green min-h-screen flex items-center justify-center px-6 text-center"
      title="No disponible en vista previa"
    >
      <div className="glass-card px-6 py-8 max-w-sm">
        <p className="text-ivory font-semibold">No disponible en vista previa</p>
        <p className="text-ivory/55 text-xs mt-2 break-all">{location.pathname}</p>
      </div>
    </div>
  );
}

/**
 * /admin/student-preview/:studentId
 * Renders the WHOLE student portal with that student's real data, read-only.
 *
 * The portal runs inside its own MemoryRouter, so every existing link
 * (`/videos`, `/pro-zone/stats`, …) navigates within the preview instead of
 * leaving it — no link rewriting needed anywhere in the student pages.
 * Owner-only: the route redirects non-admins and `can_preview_student`
 * enforces the same rule server-side.
 */
export default function AdminStudentPreview() {
  const { studentId } = useParams<{ studentId: string }>();
  const { loading, role } = useAuth();

  if (loading) {
    return (
      <div className="app-bg app-bg-green min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
      </div>
    );
  }
  if (role !== 'admin') return <Navigate to="/not-authorized" replace />;
  if (!studentId) return <Navigate to="/admin/students" replace />;

  return (
    <StudentPreviewProvider
      studentId={studentId}
      fallback={
        <div className="app-bg app-bg-green min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
        </div>
      }
      denied={<Navigate to="/not-authorized" replace />}
    >
      <StudentPreviewBanner />
      <PreviewStudentAuth>
        {/* Reset the outer router context so the preview can run its own
            in-memory router (React Router forbids nested routers otherwise). */}
        <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false } as any}>
        <UNSAFE_LocationContext.Provider value={null as any}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <StudentBottomNav />
          <Routes>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/profile" element={<StudentProfile />} />
            <Route path="/settings" element={<StudentSettings />} />
            <Route path="/lessons" element={<StudentLessons />} />
            <Route path="/lessons/fixed-schedule" element={<StudentFixedSchedule />} />
            <Route path="/videos" element={<StudentVideos />} />
            <Route path="/videos/upload" element={<VideoUpload />} />
            <Route path="/highlights" element={<StudentHighlights />} />
            <Route path="/drills" element={<StudentDrills />} />
            <Route path="/ai-coach" element={<StudentAiCoach />} />
            <Route path="/plans" element={<PlanSelectionPage />} />
            <Route path="/pro-zone" element={<ProZoneGate><ProZone /></ProZoneGate>} />
            <Route path="/pro-zone/compare" element={<ProZoneGate><CompareSwings /></ProZoneGate>} />
            <Route path="/pro-zone/stats" element={<ProZoneStats />} />
            <Route path="/pro-zone/swing-analysis" element={<ProZoneGate><ProZoneSwingAnalysis /></ProZoneGate>} />
            <Route path="/pro-zone/:category" element={<ProZoneGate><ProZoneCategory /></ProZoneGate>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/family" element={<StudentFamily />} />
            <Route path="/family/:childId" element={<PreviewFamilyChild />} />
            <Route path="*" element={<PreviewUnavailable />} />
          </Routes>
        </MemoryRouter>
        </UNSAFE_LocationContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </PreviewStudentAuth>
    </StudentPreviewProvider>
  );
}
