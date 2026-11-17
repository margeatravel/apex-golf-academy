import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Sticky banner shown to the owner (admin) while previewing another coach's
 * portal (dashboard + menu scoped to that coach's students/data).
 */
export default function CoachPreviewBanner({ label, forceShow }: { label?: string; forceShow?: boolean } = {}) {
  const { role, previewCoachId, previewCoachLabel: storedLabel, clearCoachPreview } = useAuth();
  const previewCoachLabel = label ?? storedLabel;
  const navigate = useNavigate();

  if (!forceShow && (role !== 'admin' || !previewCoachId)) return null;

  return (
    <div
      className="sticky top-0 z-[60] w-full flex items-center justify-between gap-3 px-3 py-2 text-xs sm:text-sm"
      style={{
        background: 'linear-gradient(90deg, #4a7c59 0%, #2f5a3d 100%)',
        color: '#F5F0E8',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        fontWeight: 600,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Previewing coach portal as{' '}
          <span className="font-bold">{previewCoachLabel || 'coach'}</span>
        </span>
      </div>
      <button
        onClick={() => {
          clearCoachPreview();
          navigate('/admin/coaches');
        }}
        className="flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#F0C040' }}
      >
        <X className="h-3.5 w-3.5" /> Exit preview
      </button>
    </div>
  );
}
