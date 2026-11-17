import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { GlobalSearch } from '@/components/GlobalSearch';
import { getTierTheme } from '@/lib/tierTheme';

interface InternalHeaderProps {
  /**
   * Static title. Used as a fallback when `titleKey` is not provided
   * or when the key resolves to nothing.
   */
  title?: string;
  subtitle?: string;
  /**
   * Translation keys (preferred). When set, the resolved translation
   * is used. Falls back to `title` / `subtitle` if missing.
   */
  titleKey?: string;
  subtitleKey?: string;
  backTo: string;
  /** Optional element rendered on the right side (e.g. a refresh button). */
  actionSlot?: ReactNode;
}

export function InternalHeader({ title, subtitle, titleKey, subtitleKey, backTo, actionSlot }: InternalHeaderProps) {
  const { t } = useLanguage();
  const { effectivePlan } = useAuth();
  const resolvedTitle = titleKey ? (t(titleKey) || title || '') : (title || '');
  const resolvedSubtitle = subtitleKey ? (t(subtitleKey) || subtitle || '') : (subtitle || '');
  const tierTheme = getTierTheme(effectivePlan);
  return (
    <header
      className="sticky top-0 z-10"
      style={{
        background: tierTheme.headerBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        borderBottom: `1px solid ${tierTheme.border}`,
      }}
    >
      <div className="flex items-center px-5 py-4">
        <Link to={backTo} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" style={{ color: '#F5F0E8' }} />
        </Link>
        <div className="flex-1 text-center">
          <h1 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 600 }} className="leading-tight">
            {resolvedTitle}
          </h1>
          <p style={{ color: '#F5F0E8', opacity: 0.6, fontSize: 13 }}>{resolvedSubtitle}</p>
        </div>
        <div className="flex-shrink-0 min-w-5 flex items-center justify-end gap-2">
          {actionSlot}
          <GlobalSearch />
          <LanguageToggle variant="header" />
        </div>
      </div>
    </header>
  );
}
