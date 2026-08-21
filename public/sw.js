/**
 * Service Worker Purger & Cache-Buster
 * Este archivo elimina automáticamente cualquier caché vieja y se autodestruye para forzar
 * que todos los navegadores móviles y de PC carguen el código 100% en vivo desde la red.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Petición directa a la red (0 retención de caché)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
