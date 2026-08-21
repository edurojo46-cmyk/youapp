import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// ── REGISTRO Y AUTO-ACTUALIZACIÓN AUTOMÁTICA DE LA APP (PWA) ──────────────────
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Verificar actualizaciones en segundo plano cada 10 minutos
        setInterval(() => {
          registration.update().catch(() => {});
        }, 10 * 60 * 1000);

        // Si se instala un nuevo Service Worker, recargar automáticamente
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[YouApp Auto-Update] Nueva versión detectada. Aplicando actualización...');
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[YouApp PWA] Service Worker registration skipped:', err);
      });

    // Escuchar cuando el controlador cambia
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

