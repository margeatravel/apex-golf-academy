import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEffectivePlan } from '@/contexts/AuthContext';
import { setPreviewWriteGuard } from '@/lib/previewWriteGuard';

/**
 * Read-only "View as student" preview.
 *
 * Renders the REAL student dashboard component with the REAL data of another
 * student. Unlike Demo Mode (fictional data), this reads live rows.
 *
 * Security:
 *  - Server-side check via the `can_preview_student` SECURITY DEFINER function
 *    (admin, or the coach the student is assigned to). Hiding the UI is not
 *    enough — the provider refuses to render children when it returns false.
 *  - RLS still applies to every underlying query.
 *  - `readOnly` is always true: every write path must call `blockWrite()`.
 */
export interface StudentPreviewValue {
  isStudentPreview: boolean;
  /** Previewed student's user id (null when not previewing). */
  studentId: string | null;
  /** Previewed student's profile row, used in place of the admin's own profile. */
  previewProfile: any | null;
  effectivePlan: 'free' | 'member' | 'scratch' | 'pro' | 'apex' | 'family';
  studentName: string;
  loading: boolean;
  allowed: boolean;
  /** Always true inside a preview — no writes are permitted. */
  readOnly: boolean;
  /** Call at the top of any write handler. Returns true when the write was blocked. */
  blockWrite: () => boolean;
}

const DEFAULT: StudentPreviewValue = {
  isStudentPreview: false,
  studentId: null,
  previewProfile: null,
  effectivePlan: 'free',
  studentName: '',
  loading: false,
  allowed: false,
  readOnly: false,
  blockWrite: () => false,
};

const StudentPreviewContext = createContext<StudentPreviewValue>(DEFAULT);

export function useStudentPreview() {
  return useContext(StudentPreviewContext);
}

export function StudentPreviewProvider({
  studentId,
  children,
  fallback,
  denied,
}: {
  studentId: string;
  children: ReactNode;
  fallback?: ReactNode;
  denied?: ReactNode;
}) {
  // Sandbox mode: the UI stays interactive, so mutations are intercepted at the
  // data layer. Enable synchronously so no child can write before the effect.
  setPreviewWriteGuard(true);
  useEffect(() => {
    setPreviewWriteGuard(true);
    return () => setPreviewWriteGuard(false);
  }, []);

  const { data: allowed, isLoading: checking } = useQuery({
    queryKey: ['can-preview-student', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_preview_student' as any, {
        _student_id: studentId,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!studentId,
    staleTime: 60_000,
  });

  const { data: previewProfile, isLoading: loadingProfile } = useQuery({
    queryKey: ['student-preview-profile', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId && allowed === true,
  });

  const loading = checking || (allowed === true && loadingProfile);

  if (loading) return <>{fallback ?? null}</>;
  if (!allowed) return <>{denied ?? null}</>;

  const value: StudentPreviewValue = {
    isStudentPreview: true,
    studentId,
    previewProfile: previewProfile ?? null,
    effectivePlan: getEffectivePlan((previewProfile ?? null) as any),
    studentName:
      (previewProfile as any)?.full_name || (previewProfile as any)?.email || 'Alumno',
    loading: false,
    allowed: true,
    // Sandbox: nothing in the UI is disabled anymore. Writes are stopped by the
    // centralized guard in src/lib/previewWriteGuard.ts.
    readOnly: false,
    blockWrite: () => false,
  };

  return (
    <StudentPreviewContext.Provider value={value}>{children}</StudentPreviewContext.Provider>
  );
}
