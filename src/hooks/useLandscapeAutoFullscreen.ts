import { useEffect, useRef } from 'react';

/**
 * Experiencia YouTube / Netflix en celular:
 * - Al girar el celular en horizontal (landscape) mientras hay un video activo,
 *   expande automáticamente el reproductor a pantalla completa (100vw × 100dvh) y oculta la barra superior.
 * - Al volver a posición vertical (portrait), regresa automáticamente a la vista normal.
 */
export function useLandscapeAutoFullscreen(
  hasActiveVideo: boolean,
  setFullscreen: (next: boolean) => void
) {
  const autoEnteredRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia('(orientation: landscape) and (max-height: 540px)');

    const applyOrientation = (isPhoneLandscape: boolean) => {
      if (isPhoneLandscape && hasActiveVideo) {
        autoEnteredRef.current = true;
        document.body.classList.add('youapp-landscape-fs');
        setFullscreen(true);
        try {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            void document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch {
          // ignore browser gesture restrictions
        }
      } else if (!isPhoneLandscape && autoEnteredRef.current) {
        autoEnteredRef.current = false;
        document.body.classList.remove('youapp-landscape-fs');
        setFullscreen(false);
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            void document.exitFullscreen().catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    };

    // Evalúa inmediatamente por si el usuario ya tenía el celular acostado al tocar un video
    if (mq.matches && hasActiveVideo) {
      applyOrientation(true);
    }

    const onChange = (e: MediaQueryListEvent) => applyOrientation(e.matches);
    const onResize = () => applyOrientation(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
    } else {
      window.addEventListener('resize', onResize);
    }

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', onChange);
      } else {
        window.removeEventListener('resize', onResize);
      }
      document.body.classList.remove('youapp-landscape-fs');
    };
  }, [hasActiveVideo, setFullscreen]);
}
