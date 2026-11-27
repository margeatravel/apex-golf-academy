import { useDemoMode } from '@/contexts/DemoModeContext';

/**
 * Persistent orange banner shown at the very top while Demo Mode is active.
 * Pure display — sits above all routes. Sits inside DemoModeProvider in App.tsx.
 */
export function DemoModeBanner() {
  const { isDemoMode, setDemoMode } = useDemoMode();
  if (!isDemoMode) return null;
  return (
    <div
      role="status"
      className="w-full text-center text-sm font-semibold flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2"
      style={{
        background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
        color: '#fff',
        boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
        position: 'sticky',
        top: 0,
        zIndex: 60,
        paddingTop: `calc(env(safe-area-inset-top, 0px) + 8px)`,
      }}
    >
      <span>🎭 MODO DEMO — datos ficticios</span>
      <button
        type="button"
        onClick={() => setDemoMode(false)}
        className="text-xs uppercase tracking-wider rounded px-2 py-0.5"
        style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
      >
        Salir
      </button>
    </div>
  );
}