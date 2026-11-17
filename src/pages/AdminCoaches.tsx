import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { CoachManagementSection } from '@/components/admin/CoachManagementSection';

export default function AdminCoaches() {
  return (
    <div className="app-bg min-h-screen">
      <InternalHeader
        titleKey="admin.coachAccessTitle"
        subtitleKey="admin.coachAccessSub"
        backTo="/admin/settings"
      />
      <main className="px-4 py-6 space-y-6 max-w-3xl mx-auto">
        <CoachManagementSection />
      </main>
      <SocialFooter />
    </div>
  );
}