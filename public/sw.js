/**
 * Service Worker (Pass-through)
 * Este SW se mantiene activo para que Chrome reconozca la PWA como válida,
 * pero no cachea nada, asegurando que siempre veas la última versión.
 */
const CACHE_NAME = 'youapp-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Limpia cachés viejas si es necesario, pero mantiene el SW vivo
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Petición directa a la red (0 retención de caché) para forzar versión en vivo
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => {
    return caches.match(event.request);
  }));
});
