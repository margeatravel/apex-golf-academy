import { useEffect, useState, useCallback } from 'react';

type Platform = 'ios' | 'android' | 'desktop';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) {
    return 'ios';
  }
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mqStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return mqStandalone || iosStandalone;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsStandalone(detectStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferredPrompt) return null;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    isStandalone,
    platform,
    prompt,
  };
}