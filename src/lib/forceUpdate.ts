/**
 * forceUpdate.ts
 * Limpiador y Forzador de Actualizaciones Inmediatas para YouApp TV (Móviles & Desktop).
 */

export const CURRENT_BUILD_VERSION = 'v6.5.0-20260821-1400';
const VERSION_STORAGE_KEY = 'youapp_app_installed_version';

/**
 * Fuerza la limpieza completa de Service Workers, CacheStorage y recarga la app
 */
export async function forceHardUpdate(): Promise<void> {
  try {
    // 1. Desregistrar todos los Service Workers viejos
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }

    // 2. Borrar todas las cachés locales del navegador (CacheStorage)
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }

    // 3. Limpiar cachés temporales en localStorage
    Object.keys(localStorage)
      .filter(k => k.startsWith('youapp_cache_') || k.startsWith('youapp_live_') || k.startsWith('youapp_yt_'))
      .forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });

    // 4. Guardar la nueva versión
    localStorage.setItem(VERSION_STORAGE_KEY, CURRENT_BUILD_VERSION);

    // 5. Forzar recarga completa evitando caché del navegador
    const cleanUrl = window.location.href.split('?')[0] + '?update=' + Date.now() + window.location.hash;
    window.location.href = cleanUrl;
  } catch (err) {
    console.warn('[forceHardUpdate] Error during purge:', err);
    window.location.reload();
  }
}

/**
 * Verifica si hay una versión nueva y la aplica automáticamente
 */
export function checkAndApplyAutomaticUpdate(): boolean {
  try {
    const installed = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!installed || installed !== CURRENT_BUILD_VERSION) {
      console.log(`[YouApp Version Manager] Actualizando de ${installed || 'inicial'} a ${CURRENT_BUILD_VERSION}...`);
      localStorage.setItem(VERSION_STORAGE_KEY, CURRENT_BUILD_VERSION);
      
      // Si ya existía una versión previa instalada, forzar purga de caché
      if (installed && installed !== CURRENT_BUILD_VERSION) {
        forceHardUpdate();
        return true;
      }
    }
  } catch {}
  return false;
}
