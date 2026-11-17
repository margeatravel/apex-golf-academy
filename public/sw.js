/* Apex Golf — Web Push messaging service worker.
   Push/notification handling only. No app-shell caching, no offline behavior. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'Apex Golf', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Apex Golf Academy';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'apex-broadcast',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      for (const client of allClients) {
        if ('navigate' in client && 'focus' in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })(),
  );
});
