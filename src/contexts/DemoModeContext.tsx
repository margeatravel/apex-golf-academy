import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'apex_demo_mode_v1';
const ADMIN_EMAIL = 'castilla.santi@gmail.com';

interface DemoModeContextValue {
  isDemoMode: boolean;
  canUseDemoMode: boolean;
  toggleDemoMode: () => void;
  setDemoMode: (v: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  canUseDemoMode: false,
  toggleDemoMode: () => {},
  setDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const canUseDemoMode = (user?.email || '').toLowerCase() === ADMIN_EMAIL;

  const [isDemoMode, setIsDemoModeState] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Auto-disable on logout / non-admin
  useEffect(() => {
    // Wait for auth to resolve: on reload `user` is briefly null.
    if (!loading && !canUseDemoMode && isDemoMode) {
      setIsDemoModeState(false);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [loading, canUseDemoMode, isDemoMode]);

  const setDemoMode = (v: boolean) => {
    if (v === isDemoMode) return;
    setIsDemoModeState(v);
    try {
      if (v) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    // Reload so every cached query and the AuthContext profile are re-read
    // through the demo layer (demo coach, demo data) instead of keeping stale
    // real data in memory. The demo store lives in sessionStorage, so demo
    // writes made earlier in the session survive the reload.
    window.location.reload();
  };

  const toggleDemoMode = () => setDemoMode(!isDemoMode);

  return (
    <DemoModeContext.Provider value={{ isDemoMode: isDemoMode && canUseDemoMode, canUseDemoMode, toggleDemoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}

/**
 * Non-hook accessor for use inside react-query queryFns where calling
 * hooks isn't possible. Reads sessionStorage directly.
 */
export function isDemoModeActive(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}