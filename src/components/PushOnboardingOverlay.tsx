import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';

const BELL_SELECTOR = '[data-push-bell]';
const RADIUS = 34;

/**
 * One-time onboarding spotlight over the notifications bell.
 * Additive: does not change BroadcastBell or usePushNotifications logic.
 */
export function PushOnboardingOverlay() {
  const { user } = useAuth();
  const { isSubscribed, permission, isSupported } = usePushNotifications();

  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  // Check the persisted flag once we know the user.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('push_onboarding_seen_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setEligible(!!data && data.push_onboarding_seen_at === null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const shouldShow = eligible && isSupported && !isSubscribed && permission !== 'denied';

  // Delay 1s so the layout is stable before measuring the bell.
  useEffect(() => {
    if (!shouldShow) return;
    const measure = () => {
      const el = document.querySelector(BELL_SELECTOR) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top + r.height / 2, left: r.left + r.width / 2 });
    };
    const timer = window.setTimeout(() => {
      measure();
      setVisible(true);
    }, 1000);
    // Keep the spotlight aligned if the bell moves (scroll of any ancestor,
    // viewport resize, header reflow). Capture phase catches inner scrollers.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [shouldShow]);

  // Lock page scroll while the spotlight is open so the circle and the bell
  // can never drift apart.
  useEffect(() => {
    if (!visible) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [visible]);

  const dismiss = useCallback(
    async (openBell = false) => {
      setVisible(false);
      setEligible(false);
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ push_onboarding_seen_at: new Date().toISOString() })
          .eq('id', user.id);
      }
      if (openBell) {
        const el = document.querySelector(BELL_SELECTOR) as HTMLElement | null;
        el?.click();
      }
    },
    [user?.id],
  );

  if (!visible || !rect) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={() => void dismiss(false)}
      role="dialog"
      aria-label="Activa tus notificaciones"
    >
      {/* Spotlight: transparent circle with a huge shadow darkening everything else */}
      <button
        type="button"
        aria-label="Abrir notificaciones"
        onClick={(e) => {
          e.stopPropagation();
          void dismiss(true);
        }}
        className="absolute rounded-full"
        style={{
          top: rect.top - RADIUS,
          left: rect.left - RADIUS,
          width: RADIUS * 2,
          height: RADIUS * 2,
          background: 'transparent',
          boxShadow: '0 0 0 9999px rgba(4, 14, 10, 0.82), 0 0 24px 6px rgba(240,192,64,0.45) inset',
          border: '2px solid rgba(240,192,64,0.85)',
        }}
      />

      <div
        className="absolute w-64 text-center"
        style={{
          top: rect.top + RADIUS + 14,
          left: Math.min(Math.max(rect.left - 128, 12), window.innerWidth - 268),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <ArrowUp className="h-6 w-6" style={{ color: '#F0C040' }} />
        </div>
        <h3 className="mt-2 text-base font-semibold text-ivory">Activa tus notificaciones</h3>
        <p className="mt-1 text-sm text-ivory/75">
          Toca la campana para enterarte cuando subamos nuevos tips a Pro Zone.
        </p>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => void dismiss(false)}
        >
          Entendido
        </Button>
      </div>
    </div>
  );
}
