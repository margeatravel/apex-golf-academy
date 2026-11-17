import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

/**
 * Admin-only searchable list of every student (active + archived) that opens
 * the read-only student preview at /admin/student-preview/:studentId.
 * Purely an entry point — it does not touch the preview logic itself.
 */
export function StudentPreviewSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const { data: students = [] } = useQuery({
    queryKey: ['student-preview-search-list'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'student');
      if (rolesError) throw rolesError;
      const ids = (roleRows || []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_archived')
        .in('id', ids);
      if (error) throw error;
      return (data || []).sort((a: any, b: any) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
      );
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = students as any[];
    if (!term) return list.slice(0, 30);
    return list
      .filter((s) =>
        `${s.full_name || ''} ${s.email || ''}`.toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [students, q]);

  return (
    <div
      className="px-2 pb-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar alumno…"
          className="h-8 pl-7 text-xs border-white/15 bg-white/5"
          style={{ color: '#F5F0E8' }}
        />
      </div>
      {q.trim() !== '' && (
        <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-white/10">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-white/50">Sin resultados</div>
          ) : (
            filtered.map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/admin/student-preview/${s.id}`)}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-white/10 flex items-center justify-between gap-2"
                style={{ color: '#F5F0E8' }}
              >
                <span className="truncate">{s.full_name || s.email}</span>
                {s.is_archived === true && (
                  <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-white/20 text-white/60">
                    Archivado
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
