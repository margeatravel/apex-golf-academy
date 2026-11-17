import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Fixed banner shown while an admin previews a student's real dashboard
 * in read-only mode. Deliberately blue — the orange banner means Demo Mode.
 */
export function StudentPreviewBanner() {
  const { isStudentPreview, studentName } = useStudentPreview();
  const navigate = useNavigate();
  const { t } = useLanguage();
  if (!isStudentPreview) return null;

  /** Return to the admin page the preview was opened from. */
  const exitPreview = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/admin/students');
  };

  return (
    <div
      role="status"
      className="w-full text-center text-sm font-semibold flex items-center justify-center gap-3 px-4 py-2"
      style={{
        background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
        color: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 70,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      }}
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {t('misc.previewViewingPortal').replace('{name}', studentName ?? '')}
        <span className="hidden sm:inline font-normal opacity-90">
          {' '}· {t('misc.previewWritesLive')}
        </span>
      </span>
      <button
        type="button"
        onClick={exitPreview}
        className="text-xs uppercase tracking-wider rounded px-2 py-0.5 shrink-0"
        style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
      >
        {t('misc.previewExit')}
      </button>
    </div>
  );
}
