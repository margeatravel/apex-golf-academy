import { useState, useMemo, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, UserPlus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AddStudentModal } from '@/components/AddStudentModal';
import { useIsMobile } from '@/hooks/use-mobile';

// Canonical query key used everywhere for student lists
export const STUDENTS_QUERY_KEY = ['all-students-canonical'];

export function useStudentsList(enabled = true) {
  return useQuery({
    queryKey: STUDENTS_QUERY_KEY,
    queryFn: async () => {
      const { data: roleRows } = await supabase.from('user_roles').select('user_id').eq('role', 'student');
      if (!roleRows?.length) return [];
      const ids = roleRows.map((r: { user_id: string }) => r.user_id);
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids).order('full_name');
      return (data || []) as { id: string; full_name: string | null; email: string }[];
    },
    enabled,
    staleTime: 10_000,
  });
}

interface Props {
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  /** Visual variant */
  variant?: 'dark' | 'light';
  /** If provided, restrict the dropdown to only these student ids. */
  restrictToIds?: string[];
  /** Optional per-student metadata (e.g. session count badge). */
  meta?: Record<string, { badge?: string }>;
}

export function SearchableStudentSelect({ value, onValueChange, disabled, variant = 'dark', restrictToIds, meta }: Props) {
  const queryClient = useQueryClient();
  const { data: allStudents = [] } = useStudentsList();
  const students = useMemo(() => {
    if (!restrictToIds) return allStudents;
    const set = new Set(restrictToIds);
    return allStudents.filter((s) => set.has(s.id));
  }, [allStudents, restrictToIds]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mobilePortalContainer, setMobilePortalContainer] = useState<HTMLElement | null>(null);

  const selected = students.find(s => s.id === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      (s.full_name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  }, [students, search]);

  const isDark = variant === 'dark';

  const handleStudentAdded = () => {
    queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
  };

  // Lock body scroll only when mobile sheet is open (independent of any parent dialog)
  useEffect(() => {
    if (!isMobile || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, open]);

  useEffect(() => {
    if (!isMobile || !open) { setMounted(false); setMobilePortalContainer(null); return; }
    const dialog = rootRef.current?.closest<HTMLElement>('[role="dialog"]');
    setMobilePortalContainer(dialog ?? document.body);
    setMounted(true);
    const previousDialogStyle = dialog
      ? {
          left: dialog.style.left,
          top: dialog.style.top,
          right: dialog.style.right,
          bottom: dialog.style.bottom,
          width: dialog.style.width,
          maxWidth: dialog.style.maxWidth,
          height: dialog.style.height,
          maxHeight: dialog.style.maxHeight,
          transform: dialog.style.transform,
          overflow: dialog.style.overflow,
          borderRadius: dialog.style.borderRadius,
        }
      : null;

    if (dialog) {
      Object.assign(dialog.style, {
        left: '0',
        top: '0',
        right: '0',
        bottom: '0',
        width: '100vw',
        maxWidth: 'none',
        height: '100dvh',
        maxHeight: '100dvh',
        transform: 'none',
        overflow: 'hidden',
        borderRadius: '0',
      });
    }

    // Focus search after the portal is mounted so parent dialogs keep it inside their FocusScope.
    const t = window.setTimeout(() => mobileInputRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(t);
      if (dialog && previousDialogStyle) Object.assign(dialog.style, previousDialogStyle);
    };
  }, [isMobile, open]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
  };

  const triggerButton = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      onClick={isMobile ? () => setOpen(true) : undefined}
      type="button"
      className={cn(
        'w-full justify-between font-normal',
        isDark
          ? 'bg-white/5 border-white/10 text-[#F5F0E8] hover:bg-white/10'
          : 'bg-muted/50',
        !value && (isDark ? 'text-[#F5F0E8]/40' : 'text-muted-foreground')
      )}
    >
      {selected ? (selected.full_name || selected.email) : 'Select student'}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  // ---------- MOBILE: full-screen overlay (bypasses Radix Dialog pointer-events trap) ----------
  if (isMobile) {
    return (
      <div ref={rootRef}>
        {triggerButton}

        {open && mounted && mobilePortalContainer && createPortal(
          <div
            className={cn(
              'inset-0 z-[200] flex flex-col',
              mobilePortalContainer === document.body ? 'fixed' : 'absolute'
            )}
            style={{
              background: isDark ? 'hsl(220 30% 8%)' : 'hsl(var(--background))',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              height: mobilePortalContainer === document.body ? '100dvh' : '100%',
              maxHeight: mobilePortalContainer === document.body ? '100dvh' : '100%',
              pointerEvents: 'auto',
            }}
            // Prevent any parent Dialog from intercepting touches
            onPointerDownCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
            onTouchMoveCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
          >
            {/* Header w/ search */}
            <div
              className={cn(
                'shrink-0 flex items-center gap-2 px-3 py-3 border-b',
                isDark ? 'border-white/10' : 'border-border'
              )}
            >
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={mobileInputRef}
                value={search}
                onChange={handleSearchChange}
                onInput={handleSearchChange}
                placeholder="Search student..."
                className={cn(
                  'flex-1 bg-transparent text-base outline-none placeholder:opacity-50',
                  isDark ? 'text-[#F5F0E8] placeholder:text-[#F5F0E8]/40' : ''
                )}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
                onKeyDownCapture={(e) => e.stopPropagation()}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => { setOpen(false); setSearch(''); }}
                className={cn(
                  'h-8 w-8 flex items-center justify-center rounded-full',
                  isDark ? 'text-[#F5F0E8] hover:bg-white/10' : 'hover:bg-accent'
                )}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable list */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {filtered.length === 0 && (
                <p className={cn(
                  'py-8 text-center text-sm',
                  isDark ? 'text-[#F5F0E8]/50' : 'text-muted-foreground'
                )}>
                  No students found
                </p>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onValueChange(s.id); setOpen(false); setSearch(''); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2.5 text-[15px] text-left transition-colors border-b',
                    isDark
                      ? 'text-[#F5F0E8] border-white/5 active:bg-white/10'
                      : 'border-border active:bg-accent',
                    s.id === value && (isDark ? 'bg-white/5' : 'bg-accent')
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', s.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate flex-1">{s.full_name || s.email}</span>
                  {meta?.[s.id]?.badge && (
                    <span
                      className={cn(
                        'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full',
                        isDark ? 'bg-[#F0C040]/15 text-[#F0C040]' : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {meta[s.id].badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Footer add */}
            <div className={cn('shrink-0 border-t px-2 py-2', isDark ? 'border-white/10' : 'border-border')}>
              <button
                type="button"
                onClick={() => { setOpen(false); setShowAddStudent(true); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-3 text-sm rounded transition-colors',
                  isDark
                    ? 'text-[#4a7c59] active:bg-[#4a7c59]/10'
                    : 'text-primary active:bg-primary/10'
                )}
              >
                <UserPlus className="h-4 w-4" />
                Add new student
              </button>
            </div>
          </div>,
          mobilePortalContainer
        )}

        <AddStudentModal
          open={showAddStudent}
          onOpenChange={setShowAddStudent}
          onStudentCreated={(newId) => {
            handleStudentAdded();
            if (newId) onValueChange(newId);
          }}
        />
      </div>
    );
  }

  // ---------- DESKTOP: original Popover (unchanged) ----------
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {triggerButton}
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            'w-[var(--radix-popover-trigger-width)] p-0 z-[100] shadow-2xl',
            isDark ? 'bg-background border-white/10' : 'bg-card border-border'
          )}
          side="bottom"
          align="start"
          sideOffset={4}
          avoidCollisions={false}
        >
          {/* Search input */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 border-b',
            isDark ? 'border-white/10' : 'border-border'
          )}>
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              value={search}
                onChange={handleSearchChange}
                onInput={handleSearchChange}
              placeholder="Search student..."
              className={cn(
                'flex-1 bg-transparent text-sm outline-none placeholder:opacity-50',
                isDark ? 'text-[#F5F0E8] placeholder:text-[#F5F0E8]/40' : ''
              )}
              autoFocus
            />
          </div>

          {/* List */}
          <div
            className="max-h-[320px] overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            {filtered.length === 0 && (
              <p className={cn(
                'py-4 text-center text-sm',
                isDark ? 'text-[#F5F0E8]/50' : 'text-muted-foreground'
              )}>
                No students found
              </p>
            )}
            {filtered.map(s => (
              <button
                key={s.id}
                onClick={() => { onValueChange(s.id); setOpen(false); setSearch(''); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  isDark
                    ? 'text-[#F5F0E8] hover:bg-white/10'
                    : 'hover:bg-accent',
                  s.id === value && (isDark ? 'bg-white/5' : 'bg-accent')
                )}
              >
                <Check className={cn('h-4 w-4 shrink-0', s.id === value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate flex-1">{s.full_name || s.email}</span>
                {meta?.[s.id]?.badge && (
                  <span
                    className={cn(
                      'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full',
                      isDark ? 'bg-[#F0C040]/15 text-[#F0C040]' : 'bg-amber-100 text-amber-700'
                    )}
                  >
                    {meta[s.id].badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Add new student */}
          <div className={cn('border-t px-1 py-1', isDark ? 'border-white/10' : 'border-border')}>
            <button
              onClick={() => { setOpen(false); setShowAddStudent(true); }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors',
                isDark
                  ? 'text-[#4a7c59] hover:bg-[#4a7c59]/10'
                  : 'text-primary hover:bg-primary/10'
              )}
            >
              <UserPlus className="h-4 w-4" />
              Add new student
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <AddStudentModal
        open={showAddStudent}
        onOpenChange={setShowAddStudent}
        onStudentCreated={(newId) => {
          handleStudentAdded();
          if (newId) onValueChange(newId);
        }}
      />
    </>
  );
}
