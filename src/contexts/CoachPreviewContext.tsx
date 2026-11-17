import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { setCoachPreviewWriteGuard } from '@/lib/previewWriteGuard';

interface CoachPreviewValue { coachId: string; coachProfile: any; }
const CoachPreviewContext = createContext<CoachPreviewValue | null>(null);

export const useCoachPreview = () => useContext(CoachPreviewContext);

export function CoachPreviewProvider({
  coachId, children, fallback, denied,
}: { coachId: string; children: ReactNode; fallback: ReactNode; denied: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [coachProfile, setCoachProfile] = useState<any>(null);

  // Block every write while the coach preview is mounted.
  useEffect(() => {
    setCoachPreviewWriteGuard(true);
    return () => setCoachPreviewWriteGuard(false);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setState('loading');
      const { data } = await supabase.from('profiles').select('*').eq('id', coachId).maybeSingle();
      if (cancel) return;
      if (!data) { setState('denied'); return; }
      setCoachProfile(data);
      setState('ok');
    })();
    return () => { cancel = true; };
  }, [coachId]);

  if (state === 'loading') return <>{fallback}</>;
  if (state === 'denied') return <>{denied}</>;
  return (
    <CoachPreviewContext.Provider value={{ coachId, coachProfile }}>
      {children}
    </CoachPreviewContext.Provider>
  );
}
