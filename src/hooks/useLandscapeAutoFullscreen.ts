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

    const mq = window.matchMedia('(orientation: landscape) and (max-height: 600px)');

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

    const checkNow = () => {
      const isLandscape =
        mq.matches || (window.innerWidth > window.innerHeight && window.innerHeight <= 600);
      applyOrientation(isLandscape);
    };

    // Evalúa inmediatamente por si el usuario ya tenía el celular acostado al tocar un video
    if (hasActiveVideo) {
      checkNow();
    }

    const onChange = () => checkNow();
    const onResize = () => checkNow();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', onChange);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.body.classList.remove('youapp-landscape-fs');
    };
  }, [hasActiveVideo, setFullscreen]);
}
