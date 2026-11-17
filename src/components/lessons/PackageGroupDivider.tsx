import React from 'react';

export type PackageGroupDividerProps = {
  /** null / undefined => "Individual lessons" divider */
  pkg?: {
    id?: string;
    package_name?: string | null;
    package_size?: number | null;
    classes_used?: number | null;
    _totalLessonsUsed?: number | null;
    _totalLessonsRemaining?: number | null;
    _isShared?: boolean | null;
    _otherMemberNames?: string[] | null;
  } | null;
  isActive?: boolean;
  /** Optional override for used count (e.g. computed from lessons list). */
  usedOverride?: number | null;
  /** Render only the closing (single-line) divider */
  variant?: 'open' | 'close';
};

/**
 * Divider row used between package-grouped lesson lists.
 * Gold accent when the group is the active package; muted ivory otherwise.
 * Mirrors the inline divider used in the coach's AdminStudentDetail view.
 */
export function PackageGroupDivider({
  pkg,
  isActive = false,
  usedOverride,
  variant = 'open',
}: PackageGroupDividerProps) {
  const isIndividual = !pkg;
  const accent = isIndividual
    ? 'rgba(245,240,232,0.15)'
    : isActive
      ? '#F0C040'
      : 'rgba(245,240,232,0.25)';

  if (variant === 'close') {
    return (
      <div className="flex items-center gap-3 pt-1 pb-2">
        <div className="flex-1 h-px" style={{ background: accent }} />
      </div>
    );
  }

  const labelColor = isIndividual
    ? 'rgba(245,240,232,0.5)'
    : isActive
      ? '#F0C040'
      : 'rgba(245,240,232,0.7)';

  const label = isIndividual
    ? 'Individual lessons'
    : (pkg?.package_name || `${pkg?.package_size ?? '?'}-Lesson Package`);

  const used = usedOverride ?? pkg?._totalLessonsUsed ?? pkg?.classes_used ?? 0;
  const size = pkg?.package_size;
  const statusText = !pkg
    ? null
    : isActive
      ? 'Active'
      : (pkg._totalLessonsRemaining ?? Math.max(0, (pkg.package_size ?? 0) - (used ?? 0))) <= 0
        ? 'Completed'
        : 'Inactive';

  const isShared = !!pkg?._isShared;
  const sharingText = pkg ? (isShared ? 'Shared' : 'Individual') : null;
  const otherNames: string[] = (pkg?._otherMemberNames || []) as string[];

  return (
    <div className="flex items-center gap-3 pt-4 pb-1">
      <div className="flex-1 h-px" style={{ background: accent }} />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider whitespace-nowrap">
        <span style={{ color: labelColor, fontWeight: 600 }}>{label}</span>
        {pkg && size != null && (
          <span style={{ color: 'rgba(245,240,232,0.4)' }}>
            · {used ?? 0}/{size} used
          </span>
        )}
        {sharingText && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px]"
            style={{
              background: isShared ? 'rgba(74,124,89,0.18)' : 'rgba(245,240,232,0.06)',
              color: isShared ? '#4a7c59' : 'rgba(245,240,232,0.55)',
            }}
            title={isShared && otherNames.length ? `with ${otherNames.join(', ')}` : undefined}
          >
            {sharingText}
            {isShared && otherNames.length > 0
              ? ` · with ${otherNames.slice(0, 2).join(', ')}${otherNames.length > 2 ? '…' : ''}`
              : ''}
          </span>
        )}
        {statusText && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px]"
            style={{
              background: isActive ? 'rgba(240,192,64,0.15)' : 'rgba(245,240,232,0.08)',
              color: labelColor,
            }}
          >
            {statusText}
          </span>
        )}
      </div>
      <div className="flex-1 h-px" style={{ background: accent }} />
    </div>
  );
}