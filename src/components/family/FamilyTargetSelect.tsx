import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFamilyTargets } from '@/hooks/useFamilyTargets';
import { cn } from '@/lib/utils';

interface Props {
  /** The student picked in the upload form. */
  studentId: string;
  /** Currently selected destination (defaults to the student). */
  value: string;
  onChange: (id: string) => void;
  variant?: 'dark' | 'light';
}

/**
 * Secondary picker shown after choosing a student: when that student has
 * family linked (children, managed kids without an account, partner), the
 * coach can file the upload under the right person. Renders nothing when
 * there is no family, so single-student flows look exactly as before.
 */
export function FamilyTargetSelect({ studentId, value, onChange, variant = 'dark' }: Props) {
  const { t } = useLanguage();
  const { data: targets = [] } = useFamilyTargets(studentId);

  if (targets.length < 2) return null;

  const dark = variant === 'dark';

  return (
    <div className="space-y-2">
      <Label className={dark ? 'text-ivory' : undefined}>{t('media.uploadForWho')}</Label>
      <div className="flex flex-wrap gap-2">
        {targets.map((tg) => {
          const active = (value || studentId) === tg.id;
          return (
            <button
              key={tg.id}
              type="button"
              onClick={() => onChange(tg.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                active
                  ? 'bg-[#F0C040] text-[#0d1f18] border-[#F0C040]'
                  : dark
                    ? 'bg-white/5 text-ivory/80 border-white/15 hover:bg-white/10'
                    : 'bg-muted text-foreground border-border hover:bg-muted/70',
              )}
            >
              {tg.isSelf ? `${tg.name} · ${t('media.uploadForStudent')}` : tg.name}
              {tg.isManaged && ` · ${t('media.uploadNoAccount')}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
