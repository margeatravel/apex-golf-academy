import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Public VAPID key (safe to expose). Env override wins when provided. */
const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  'BGHzKJuw4vvekjkdEYxErpMNhQa7eP4qyThK7c2PpDuExKwHjUlA_RYJvOlA4AhKvkBVb2lI8V4Ia03qVVOd6XQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Web Push (PWA) subscription management for the student portal.
 * Additive: does not touch in-app broadcast notifications.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'default',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reflect current browser subscription state on mount.
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    (async () => {
      try {
        setPermission(Notification.permission);
        const reg =
          (await navigator.serviceWorker.getRegistration('/sw.js')) ||
          (await navigator.serviceWorker.register('/sw.js'));
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        if (!cancelled) setIsSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user?.id) return false;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError(
          perm === 'denied'
            ? 'Tu navegador bloqueó las notificaciones para este sitio.'
            : 'No se concedió el permiso de notificaciones.',
        );
        return false; // denied/dismissed: no throw
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      const p256dh = json.keys?.p256dh || arrayBufferToBase64Url(sub.getKey('p256dh'));
      const auth = json.keys?.auth || arrayBufferToBase64Url(sub.getKey('auth'));

      // Insert-only path: the table intentionally exposes no UPDATE policy, so
      // an upsert (INSERT ... ON CONFLICT DO UPDATE) is rejected by RLS.
      // Clear any prior row for this endpoint, then insert a fresh one.
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error('[push] subscribe failed', e);
      setError(e instanceof Error ? e.message : 'No se pudo activar las notificaciones.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, user?.id]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      console.error('[push] unsubscribe failed', e);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { permission, isSubscribed, isSupported, loading, error, subscribe, unsubscribe };
}
