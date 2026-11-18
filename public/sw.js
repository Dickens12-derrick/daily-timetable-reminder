const CACHE_NAME = 'daily-timetable-cache-v4';
const APP_SHELL = ['./', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll([...APP_SHELL, '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png']);
      const index = await cache.match('/index.html');
      if (index) {
        const html = await index.text();
        const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
          .map(([, asset]) => new URL(asset, self.location.origin).pathname);
        if (assets.length) await cache.addAll(assets);
      }
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(requestUrl.pathname);
      if (cached && event.request.mode !== 'navigate') return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request, response.clone());
        } else if (cached) {
          return cached;
        }
        return response;
      } catch {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return cache.match('/index.html');
        return Response.error();
      }
    })()
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { title: 'Timetable reminder', body: event.data?.text() || 'An activity is starting.' };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Timetable reminder', {
    body: payload.body || 'An activity is starting.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'timetable-reminder',
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const appWindow = windows.find((client) => client.url.startsWith(self.location.origin));
    if (appWindow) return appWindow.focus();
    return clients.openWindow(targetUrl);
  }));
});
