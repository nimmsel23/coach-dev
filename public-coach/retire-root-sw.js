// Retire the obsolete root worker without reloading open editors or clearing other app caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith('/api/coach/local/')) await cache.delete(request);
      }
    }
    await self.registration.unregister();
  })());
});
