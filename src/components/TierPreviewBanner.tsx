import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const TIER_LABELS: Record<string, string> = {
  free: 'Free Member',
  member: 'Member',
  scratch: 'Scratch',
  pro: 'Pro',
  apex: 'Apex',
};

/**
 * Sticky banner shown to admins while they are previewing the student
 * experience as a specific subscription tier. Hidden for non-admins and
 * when no preview is active.
 */
export default function TierPreviewBanner() {
  const { role, previewTier, clearPreview } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (role !== 'admin' || !previewTier) return null;
  // Hide while the admin is actually inside the coach portal
  if (location.pathname.startsWith('/admin')) return null;

  const tierLabel = TIER_LABELS[previewTier] ?? previewTier;
  const label = tierLabel;

  return (
    <div
      className="sticky top-0 z-[60] w-full flex items-center justify-between gap-3 px-3 py-2 text-xs sm:text-sm"
      style={{
        background: 'linear-gradient(90deg, #F0C040 0%, #d4a017 100%)',
        color: '#1a1a1a',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        fontWeight: 600,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Previewing student view as <span className="font-bold">{label}</span>
        </span>
      </div>
      <button
        onClick={() => {
          clearPreview();
          navigate('/admin');
        }}
        className="flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap"
        style={{ background: 'rgba(0,0,0,0.85)', color: '#F0C040' }}
      >
        <X className="h-3.5 w-3.5" /> Exit preview
      </button>
    </div>
  );
}