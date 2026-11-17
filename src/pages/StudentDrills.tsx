import { useAuth } from '@/contexts/AuthContext';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { DrillsLinksList } from '@/components/DrillsLinksList';
import { StickyBookLesson } from '@/components/StickyBookLesson';

export default function StudentDrills() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen pb-28">
      <InternalHeader titleKey="admin.drillsLinksTitle" subtitleKey="admin.drillsLinksSub" backTo="/dashboard" />
      <main className="max-w-3xl mx-auto px-4 py-6">
        {user && <DrillsLinksList studentId={user.id} isCoach={false} />}
      </main>
      <SocialFooter />
      <StickyBookLesson />
    </div>
  );
}
