import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { ParentSessionBanner } from "@/components/ParentSessionBanner";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StickyBookLesson } from "@/components/StickyBookLesson";
import TierPreviewBanner from "@/components/TierPreviewBanner";
import CoachPreviewBanner from "@/components/CoachPreviewBanner";
import { CoachFAB } from "@/components/CoachFAB";
import { VideoUploadFAB } from "@/components/VideoUploadFAB";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { CoachBottomNav } from "@/components/CoachBottomNav";
import { GuidedTour } from "@/components/GuidedTour";
import { StaffUtilityBar } from "@/components/StaffUtilityBar";
import Auth from "./pages/Auth";
import PublicLanding from "./pages/PublicLanding";
import AuthCallback from "./pages/AuthCallback";
import GoogleCalendarReturn from "./pages/oauth/GoogleCalendarReturn";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import StudentDashboard from "./pages/StudentDashboard";
import StudentOnboarding from "./pages/StudentOnboarding";
import StudentProfile from "./pages/StudentProfile";
import StudentCalendarConnect from "./pages/StudentCalendarConnect";
import StudentSettings from "./pages/StudentSettings";
import StudentDrills from "./pages/StudentDrills";
import StudentLessons from "./pages/StudentLessons";
import StudentVideos from "./pages/StudentVideos";
import StudentAiCoach from "./pages/StudentAiCoach";
import StudentHighlights from "./pages/StudentHighlights";
import FamilyChildView from "./pages/FamilyChildView";
import StudentFamily from "./pages/StudentFamily";
import VideoUpload from "./pages/VideoUpload";
import PlanSelectionPage from "./pages/PlanSelectionPage";
import StudentFixedSchedule from "./pages/StudentFixedSchedule";
import AdminFixedSchedule from "./pages/AdminFixedSchedule";
import AdminAvailability from "./pages/AdminAvailability";
import ProZone from "./pages/ProZone";
import { ProZoneGate } from "./components/ProZoneGate";
import ProZoneCategory from "./pages/ProZoneCategory";
import ProZoneStats from "./pages/ProZoneStats";
import CompareSwings from "./pages/CompareSwings";
import ProZoneSwingAnalysis from "./pages/ProZoneSwingAnalysis";
import AdminProZone from "./pages/AdminProZone";
import AdminFamily from "./pages/AdminFamily";
import AdminFamilyPreview from "./pages/AdminFamilyPreview";
import AdminDashboard from "./pages/AdminDashboard";
import AdminStudentDetail from "./pages/AdminStudentDetail";
import AdminUploadVideo from "./pages/AdminUploadVideo";
import AdminStudents from "./pages/AdminStudents";
import AdminStudentPreview from "./pages/AdminStudentPreview";
import AdminCoachPreview from "./pages/AdminCoachPreview";
import AdminLessons from "./pages/AdminLessons";
import AdminCalendar from "./pages/AdminCalendar";
import AdminAnalysisRequests from "./pages/AdminAnalysisRequests";
import CoachInbox from "./pages/CoachInbox";
import AdminRevenue from "./pages/AdminRevenue";
import AdminBulkImport from "./pages/AdminBulkImport";
import AdminMergeStudents from "./pages/AdminMergeStudents";
import AdminBulkPackageFix from "./pages/AdminBulkPackageFix";
import AdminSettings, { AdminPlansBillingPage, AdminLessonPricingPage, AdminGamificationPage } from "./pages/AdminSettings";
import CoachProfile from "./pages/CoachProfile";
import AdminEmailDomain from "./pages/AdminEmailDomain";
import AdminInviteCodes from "./pages/AdminInviteCodes";
import { CoachGoogleCalendarPage, StaffStripePage, OwnerIntegrationsPage } from "./pages/AdminIntegrations";
import Notifications from "./pages/Notifications";
import AdminStripePayments from "./pages/AdminStripePayments";
import AdminSubscribers from "./pages/AdminSubscribers";
import AdminStaff from "./pages/AdminStaff";
import AdminCoaches from "./pages/AdminCoaches";
import StaffMenu from "./pages/StaffMenu";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import NotAuthorized from "./pages/NotAuthorized";
import SharedVideo from "./pages/SharedVideo";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import { useAuth } from "@/contexts/AuthContext";
import { getStaffLandingRoute } from "@/lib/staffLanding";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

/**
 * Root redirector.
 * - Admins ALWAYS land on /admin (coach view) — never auto-route to /dashboard.
 * - Staff land on their first assigned scope.
 * - Students land on /dashboard.
 * - Logged-out users see the public landing (never the login form directly:
 *   Google's OAuth brand verification requires a homepage that names the app
 *   and explains what it does without logging in).
 */
const RoleHome = () => {
  const { user, role, permissions, isStaffView, loading, isRefreshingProfile } = useAuth();
  if (loading || (user && (role === null || isRefreshingProfile))) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <PublicLanding />;
  if (role === 'admin' || role === 'coach') return <Navigate to="/admin" replace />;
  if (isStaffView) {
    const target = getStaffLandingRoute(permissions);
    return <Navigate to={target ?? '/not-authorized'} replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

/**
 * Scroll to top of the page on every route change so navigation
 * always lands at the top of the destination page.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <DemoModeProvider>
          <DemoModeBanner />
          <ScrollToTop />
          <ParentSessionBanner />
          <TierPreviewBanner />
          <CoachPreviewBanner />
          <StickyBookLesson />
          <CoachFAB />
          <VideoUploadFAB />
          <StudentBottomNav />
          <CoachBottomNav />
          <GuidedTour />
          <StaffUtilityBar />
          <Routes>
            <Route path="/" element={<RoleHome />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/oauth/google-calendar/return" element={<GoogleCalendarReturn />} />
            <Route path="/auth/forgot" element={<ForgotPassword />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            {/* Public shared video page (no auth required) */}
            <Route path="/v/:videoId" element={<SharedVideo />} />
            <Route path="/privacidad" element={<PrivacyPolicy />} />
            <Route path="/not-authorized" element={
              <ProtectedRoute>
                <NotAuthorized />
              </ProtectedRoute>
            } />
            
            {/* One-time onboarding quiz for brand-new students */}
            <Route path="/onboarding" element={
              <ProtectedRoute>
                <StudentOnboarding />
              </ProtectedRoute>
            } />

            {/* Student Routes (also used as preview for admin) */}
            <Route path="/dashboard" element={
              <ProtectedRoute requireStudent>
                <StudentDashboard />
              </ProtectedRoute>
            } />
            <Route path="/calendar-connect" element={
              <ProtectedRoute requireStudent>
                <StudentCalendarConnect />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute requireStudent>
                <StudentProfile />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute requireStudent>
                <StudentSettings />
              </ProtectedRoute>
            } />
            <Route path="/lessons" element={
              <ProtectedRoute requireStudent>
                <StudentLessons />
              </ProtectedRoute>
            } />
            <Route path="/lessons/fixed-schedule" element={
              <ProtectedRoute requireStudent>
                <StudentFixedSchedule />
              </ProtectedRoute>
            } />
            <Route path="/videos" element={
              <ProtectedRoute requireStudent>
                <StudentVideos />
              </ProtectedRoute>
            } />
            <Route path="/highlights" element={
              <ProtectedRoute requireStudent>
                <StudentHighlights />
              </ProtectedRoute>
            } />
            <Route path="/drills" element={
              <ProtectedRoute requireStudent>
                <StudentDrills />
              </ProtectedRoute>
            } />
            <Route path="/ai-coach" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <StudentAiCoach />
              </ProtectedRoute>
            } />
            <Route path="/videos/upload" element={
              <ProtectedRoute requireStudent>
                <VideoUpload />
              </ProtectedRoute>
            } />
            <Route path="/plans" element={
              <ProtectedRoute requireStudent>
                <PlanSelectionPage />
              </ProtectedRoute>
            } />
            <Route path="/pro-zone" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <ProZoneGate><ProZone /></ProZoneGate>
              </ProtectedRoute>
            } />
            <Route path="/pro-zone/compare" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <ProZoneGate><CompareSwings /></ProZoneGate>
              </ProtectedRoute>
            } />
            <Route path="/pro-zone/stats" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <ProZoneStats />
              </ProtectedRoute>
            } />
            <Route path="/pro-zone/swing-analysis" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <ProZoneGate><ProZoneSwingAnalysis /></ProZoneGate>
              </ProtectedRoute>
            } />
            <Route path="/pro-zone/:category" element={
              <ProtectedRoute requireStudent allowStaffPermission="pro_zone">
                <ProZoneGate><ProZoneCategory /></ProZoneGate>
              </ProtectedRoute>
            } />
            <Route path="/notifications" element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            } />
            <Route path="/payment-success" element={
              <ProtectedRoute requireStudent>
                <PaymentSuccess />
              </ProtectedRoute>
            } />
            <Route path="/family" element={
              <ProtectedRoute requireStudent>
                <StudentFamily />
              </ProtectedRoute>
            } />
            <Route path="/family/:childId" element={
              <ProtectedRoute>
                <FamilyChildView />
              </ProtectedRoute>
            } />
            
            {/* Admin/Coach Routes */}
            <Route path="/admin/inbox" element={<ProtectedRoute requireAdmin><CoachInbox /></ProtectedRoute>} />
            <Route path="/admin" element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/profile" element={
              <ProtectedRoute>
                <CoachProfile />
              </ProtectedRoute>
            } />
            <Route path="/admin/student/:studentId" element={
              <ProtectedRoute requirePermission="students">
                <AdminStudentDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/upload-video" element={
              <ProtectedRoute requirePermission="students">
                <AdminUploadVideo />
              </ProtectedRoute>
            } />
            <Route path="/admin/student-preview/:studentId" element={
              <ProtectedRoute requirePermission="students">
                <AdminStudentPreview />
              </ProtectedRoute>
            } />
            <Route path="/admin/coach-preview/:coachId" element={
              <ProtectedRoute requireAdmin>
                <AdminCoachPreview />
              </ProtectedRoute>
            } />
            <Route path="/admin/students" element={
              <ProtectedRoute requirePermission="students">
                <AdminStudents />
              </ProtectedRoute>
            } />
            <Route path="/admin/lessons" element={
              <ProtectedRoute requirePermission="lessons">
                <AdminLessons />
              </ProtectedRoute>
            } />
            <Route path="/admin/calendar" element={
              <ProtectedRoute requirePermission="calendar">
                <AdminCalendar />
              </ProtectedRoute>
            } />
            <Route path="/admin/fixed-schedule" element={
              <ProtectedRoute requirePermission="lessons">
                <AdminFixedSchedule />
              </ProtectedRoute>
            } />
            <Route path="/admin/availability" element={
              <ProtectedRoute requirePermission="lessons">
                <AdminAvailability />
              </ProtectedRoute>
            } />
            <Route path="/admin/analysis-requests" element={
              <ProtectedRoute requirePermission="analysis_requests">
                <AdminAnalysisRequests />
              </ProtectedRoute>
            } />
            <Route path="/admin/bulk-import" element={
              <ProtectedRoute requireAdmin>
                <AdminBulkImport />
              </ProtectedRoute>
            } />
            <Route path="/admin/merge-students" element={
              <ProtectedRoute requireAdmin>
                <AdminMergeStudents />
              </ProtectedRoute>
            } />
            <Route path="/admin/bulk-package-fix" element={
              <ProtectedRoute requireAdmin>
                <AdminBulkPackageFix />
              </ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute requirePermission="settings">
                <AdminSettings />
              </ProtectedRoute>
            } />
            <Route path="/admin/plans-billing" element={
              <ProtectedRoute requirePermission="plans_billing">
                <AdminPlansBillingPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/pricing" element={
              <ProtectedRoute requirePermission="lesson_pricing">
                <AdminLessonPricingPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/gamification" element={
              <ProtectedRoute requirePermission="settings">
                <AdminGamificationPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/pro-zone" element={
              <ProtectedRoute requirePermission="pro_zone">
                <AdminProZone />
              </ProtectedRoute>
            } />
            <Route path="/admin/family" element={
              <ProtectedRoute requirePermission="lessons">
                <AdminFamily />
              </ProtectedRoute>
            } />
            <Route path="/admin/family/preview/:linkId" element={
              <ProtectedRoute requirePermission="lessons">
                <AdminFamilyPreview />
              </ProtectedRoute>
            } />
            <Route path="/admin/revenue" element={
              <ProtectedRoute requirePermission="revenue">
                <AdminRevenue />
              </ProtectedRoute>
            } />
            <Route path="/admin/stripe-payments" element={
              <ProtectedRoute requirePermission="stripe_payments">
                <AdminStripePayments />
              </ProtectedRoute>
            } />
            <Route path="/admin/subscribers" element={
              <ProtectedRoute requirePermission="subscribers">
                <AdminSubscribers />
              </ProtectedRoute>
            } />
            <Route path="/admin/staff" element={
              <ProtectedRoute requireAdmin>
                <AdminStaff />
              </ProtectedRoute>
            } />
            <Route path="/admin/coaches" element={
              <ProtectedRoute requireAdmin>
                <AdminCoaches />
              </ProtectedRoute>
            } />
            <Route path="/staff" element={
              <ProtectedRoute>
                <StaffMenu />
              </ProtectedRoute>
            } />
            <Route path="/admin/email-domain" element={
              <ProtectedRoute requireAdmin>
                <AdminEmailDomain />
              </ProtectedRoute>
            } />
            <Route path="/admin/invites" element={
              <ProtectedRoute requireAdmin>
                <AdminInviteCodes />
              </ProtectedRoute>
            } />
            <Route path="/admin/integrations" element={
              <ProtectedRoute requireAdmin>
                <OwnerIntegrationsPage />
              </ProtectedRoute>
            } />
            <Route path="/admin/integrations/google-calendar" element={
              <ProtectedRoute requirePermission="google_calendar">
                <CoachGoogleCalendarPage />
              </ProtectedRoute>
            } />

            <Route path="/admin/integrations/stripe" element={
              <ProtectedRoute requirePermission="stripe">
                <StaffStripePage />
              </ProtectedRoute>
            } />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
            </Routes>
          </DemoModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
