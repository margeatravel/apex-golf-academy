import { GoogleCalendarConnect } from '@/components/GoogleCalendarConnect';
import { InternalHeader } from '@/components/InternalHeader';
import { useLanguage } from '@/contexts/LanguageContext';

export default function StudentCalendarConnect() {
  const { language } = useLanguage();
  const en = language === 'en';
  return (
    <div className="app-bg min-h-screen">
      <InternalHeader
        title={en ? 'Connect calendar' : 'Conectar calendario'}
        subtitle={en ? 'Sync your lessons with Google Calendar' : 'Sincroniza tus clases con Google Calendar'}
        backTo="/dashboard"
      />
      <main className="container mx-auto px-4 py-6 pb-32 max-w-2xl">
        <GoogleCalendarConnect />
      </main>
    </div>
  );
}
