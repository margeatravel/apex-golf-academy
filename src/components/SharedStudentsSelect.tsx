import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useStudentsList } from '@/components/SearchableStudentSelect';

interface Props {
  /** Selected student IDs (excluding the package owner) */
  value: string[];
  onValueChange: (ids: string[]) => void;
  /** Owner student ID — hidden from the picker (always implicitly included) */
  excludeId?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Multi-select for "Compartido con" — pick additional students that share a package.
 * Owner is excluded from the list and always implicitly part of the package.
 */
export function SharedStudentsSelect({
  value,
  onValueChange,
  excludeId,
  disabled,
  placeholder = 'Agregar estudiantes...',
}: Props) {
  const { data: students = [] } = useStudentsList();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const available = useMemo(
    () => students.filter(s => s.id !== excludeId),
    [students, excludeId]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(s =>
      (s.full_name || '').toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  }, [available, search]);

  const selectedStudents = available.filter(s => value.includes(s.id));

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onValueChange(value.filter(v => v !== id));
    } else {
      onValueChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal bg-white/5 border-white/10 text-[#F5F0E8] hover:bg-white/10"
          >
            <span className="flex items-center gap-2 truncate">
              <Users className="h-4 w-4 opacity-70" />
              {value.length > 0
                ? `${value.length} compartido${value.length > 1 ? 's' : ''}`
                : <span className="text-[#F5F0E8]/40">{placeholder}</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#0d1f18] border-white/10"
          align="start"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student..."
              className="flex-1 bg-transparent text-sm outline-none text-[#F5F0E8] placeholder:text-[#F5F0E8]/40"
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-[#F5F0E8]/50">
                No students found
              </p>
            )}
            {filtered.map(s => {
              const isSelected = value.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors text-[#F5F0E8] hover:bg-white/10',
                    isSelected && 'bg-white/5'
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100 text-[#4a7c59]' : 'opacity-0')} />
                  <span className="truncate">{s.full_name || s.email}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selectedStudents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedStudents.map(s => (
            <Badge
              key={s.id}
              variant="secondary"
              className="bg-[#4a7c59]/20 text-[#F5F0E8] border-[#4a7c59]/30 gap-1 pr-1"
            >
              <span className="truncate max-w-[120px]">{s.full_name || s.email}</span>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="rounded-full hover:bg-white/20 p-0.5"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
