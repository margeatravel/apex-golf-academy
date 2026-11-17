import { useEffect } from 'react';
import {
  useParams, Navigate, MemoryRouter, Routes, Route, useLocation,
  UNSAFE_LocationContext, UNSAFE_RouteContext,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CoachPreviewProvider, useCoachPreview } from '@/contexts/CoachPreviewContext';
import { PreviewCoachAuth } from '@/components/PreviewCoachAuth';
import CoachPreviewBanner from '@/components/CoachPreviewBanner';
import { CoachFAB } from '@/components/CoachFAB';
import AdminDashboard from '@/pages/AdminDashboard';
import CoachProfile from '@/pages/CoachProfile';
import AdminStudentDetail from '@/pages/AdminStudentDetail';
import AdminStudents from '@/pages/AdminStudents';
import AdminLessons from '@/pages/AdminLessons';
import AdminCalendar from '@/pages/AdminCalendar';
import AdminFixedSchedule from '@/pages/AdminFixedSchedule';
import AdminAvailability from '@/pages/AdminAvailability';
import AdminAnalysisRequests from '@/pages/AdminAnalysisRequests';
import AdminFamily from '@/pages/AdminFamily';
import AdminSubscribers from '@/pages/AdminSubscribers';
import AdminRevenue from '@/pages/AdminRevenue';
import AdminStripePayments from '@/pages/AdminStripePayments';
import AdminBulkPackageFix from '@/pages/AdminBulkPackageFix';
import AdminSettings from '@/pages/AdminSettings';

const Spinner = () => (
  <div className="app-bg app-bg-green min-h-screen flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-green-accent" />
  </div>
);

function PreviewUnavailable() {
  const location = useLocation();
  return (
    <div className="app-bg app-bg-green min-h-screen flex items-center justify-center px-6 text-center">
      <div className="glass-card px-6 py-8 max-w-sm">
        <p className="text-ivory font-semibold">No disponible en vista previa</p>
        <p className="text-ivory/55 text-xs mt-2 break-all">{location.pathname}</p>
      </div>
    </div>
  );
}

function Banner() {
  const ctx = useCoachPreview();
  const p = ctx?.coachProfile;
  return <CoachPreviewBanner forceShow label={p?.full_name || p?.email || 'coach'} />;
}

/**
 * /admin/coach-preview/:coachId — the coach portal with that coach's identity,
 * inside an isolated MemoryRouter. Read-only (write guard on).
 */
export default function AdminCoachPreview() {
  const { coachId } = useParams<{ coachId: string }>();
  const { loading, role, previewCoachId, clearCoachPreview } = useAuth();

  // Never leave /admin in a mixed legacy preview state.
  useEffect(() => {
    if (previewCoachId) clearCoachPreview();
  }, [previewCoachId, clearCoachPreview]);

  if (loading) return <Spinner />;
  if (role !== 'admin') return <Navigate to="/not-authorized" replace />;
  if (!coachId) return <Navigate to="/admin/coaches" replace />;

  return (
    <CoachPreviewProvider coachId={coachId} fallback={<Spinner />} denied={<Navigate to="/admin/coaches" replace />}>
      <Banner />
      <PreviewCoachAuth>
        <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false } as any}>
        <UNSAFE_LocationContext.Provider value={null as any}>
        <MemoryRouter initialEntries={['/admin']}>
          <CoachFAB />
          <Routes>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/profile" element={<CoachProfile />} />
            <Route path="/admin/student/:studentId" element={<AdminStudentDetail />} />
            <Route path="/admin/students" element={<AdminStudents />} />
            <Route path="/admin/lessons" element={<AdminLessons />} />
            <Route path="/admin/calendar" element={<AdminCalendar />} />
            <Route path="/admin/fixed-schedule" element={<AdminFixedSchedule />} />
            <Route path="/admin/availability" element={<AdminAvailability />} />
            <Route path="/admin/analysis-requests" element={<AdminAnalysisRequests />} />
            <Route path="/admin/family" element={<AdminFamily />} />
            <Route path="/admin/subscribers" element={<AdminSubscribers />} />
            <Route path="/admin/revenue" element={<AdminRevenue />} />
            <Route path="/admin/stripe-payments" element={<AdminStripePayments />} />
            <Route path="/admin/bulk-package-fix" element={<AdminBulkPackageFix />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="*" element={<PreviewUnavailable />} />
          </Routes>
        </MemoryRouter>
        </UNSAFE_LocationContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </PreviewCoachAuth>
    </CoachPreviewProvider>
  );
}
