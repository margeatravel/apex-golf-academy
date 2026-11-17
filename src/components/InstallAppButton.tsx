import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Smartphone } from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const DISMISSED_KEY = 'install_prompt_dismissed_v1';
const AUTO_OPEN_DELAY_MS = 4000;

interface InstallAppButtonProps {
  /**
   * If true, render only the modal (no button). Useful when triggered
   * from a menu item elsewhere.
   */
  hidden?: boolean;
  /** Controlled open state (for menu-triggered modals). */
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
}

export function InstallAppButton({
  hidden = false,
  controlledOpen,
  onControlledOpenChange,
}: InstallAppButtonProps = {}) {
  const { isStandalone, platform } = useInstallPrompt();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onControlledOpenChange ?? setInternalOpen;

  // Auto-show once on mobile if the user hasn't dismissed it before.
  useEffect(() => {
    if (controlledOpen !== undefined) return; // controlled — skip auto
    if (isStandalone) return;
    if (platform === 'desktop') return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const t = window.setTimeout(() => {
      setInternalOpen(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isStandalone, platform, controlledOpen]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && controlledOpen === undefined) {
      try {
        localStorage.setItem(DISMISSED_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  };

  // Hide button in standalone mode (already installed).
  if (isStandalone) return null;

  if (hidden) {
    return <InstallAppModal open={open} onOpenChange={handleOpenChange} />;
  }

  return (
    <>
      <Button
        data-tour="install-app"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-ivory/70 hover:text-ivory hover:bg-white/10 gap-2"
        title="Install app on Home Screen"
      >
        <Smartphone className="h-4 w-4 text-gold-accent" />
        <span className="hidden sm:inline">Install App</span>
      </Button>
      <InstallAppModal open={open} onOpenChange={handleOpenChange} />
    </>
  );
}