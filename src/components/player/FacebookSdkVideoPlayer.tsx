import React, { useEffect, useId, useRef, useState } from 'react';

interface FacebookSdkVideoPlayerProps {
  url: string;
  title?: string;
  width?: number;
  muted?: boolean;
  autoplay?: boolean;
  playTrigger?: number;
  pauseTrigger?: number;
}

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      XFBML?: { parse: (el?: HTMLElement | null) => void };
      Event?: {
        subscribe: (event: string, cb: (msg: any) => void) => void;
        unsubscribe: (event: string, cb: (msg: any) => void) => void;
      };
    };
    fbAsyncInit?: () => void;
  }
}

let fbSdkPromise: Promise<boolean> | null = null;

function loadFacebookSdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.FB?.XFBML) return Promise.resolve(true);
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = window.setTimeout(() => finish(Boolean(window.FB?.XFBML)), 6000);

    const prevInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      if (typeof prevInit === 'function') prevInit();
      try {
        window.FB?.init({
          xfbml: true,
          version: 'v19.0'
        });
      } catch {
        // ignore
      }
      window.clearTimeout(timeout);
      finish(true);
    };

    if (!document.getElementById('facebook-jssdk')) {
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.async = true;
      js.defer = true;
      js.crossOrigin = 'anonymous';
      js.src = 'https://connect.facebook.net/es_LA/sdk.js#xfbml=1&version=v19.0';
      js.onerror = () => {
        window.clearTimeout(timeout);
        finish(false);
      };
      document.body.appendChild(js);
    } else {
      const poll = window.setInterval(() => {
        if (window.FB?.XFBML) {
          window.clearInterval(poll);
          window.clearTimeout(timeout);
          finish(true);
        }
      }, 150);
    }
  });

  return fbSdkPromise;
}

/**
 * Reproductor oficial de Facebook basado en el SDK JS de Meta (FB.XFBML + player.play()).
 * Si el SDK es bloqueado por un bloqueador de rastreadores, cae automáticamente al iframe oficial.
 */
export const FacebookSdkVideoPlayer: React.FC<FacebookSdkVideoPlayerProps> = ({
  url,
  title = 'Facebook Video',
  width = 360,
  muted = true,
  autoplay = true,
  playTrigger = 0,
  pauseTrigger = 0
}) => {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const playerDomId = `fb-vid-${reactId}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [fallbackToIframe, setFallbackToIframe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    instanceRef.current = null;
    setFallbackToIframe(false);

    const handleXfbmlReady = (msg: any) => {
      if (cancelled || !msg || msg.type !== 'video') return;
      if (msg.id !== playerDomId) return;
      const inst = msg.instance;
      if (!inst) return;
      instanceRef.current = inst;
      try {
        if (mutedRef.current) {
          inst.mute?.();
        } else {
          inst.unmute?.();
        }
        if (autoplay) {
          inst.play?.();
        }
      } catch {
        // ignore
      }
    };

    void loadFacebookSdk().then((ok) => {
      if (cancelled) return;
      if (!ok || !window.FB?.XFBML) {
        setFallbackToIframe(true);
        return;
      }

      try {
        window.FB.Event?.subscribe('xfbml.ready', handleXfbmlReady);
      } catch {
        // ignore
      }

      if (hostRef.current) {
        hostRef.current.replaceChildren();
        const div = document.createElement('div');
        div.id = playerDomId;
        div.className = 'fb-video';
        div.setAttribute('data-href', url);
        div.setAttribute('data-width', String(width));
        div.setAttribute('data-show-text', 'false');
        div.setAttribute('data-allowfullscreen', 'true');
        div.setAttribute('data-autoplay', autoplay ? 'true' : 'false');
        hostRef.current.appendChild(div);
        try {
          window.FB.XFBML.parse(hostRef.current);
        } catch {
          setFallbackToIframe(true);
        }
      }
    });

    return () => {
      cancelled = true;
      try {
        window.FB?.Event?.unsubscribe('xfbml.ready', handleXfbmlReady);
      } catch {
        // ignore
      }
      instanceRef.current = null;
    };
  }, [url, width, autoplay, playerDomId]);

  // Control reactivo de mute/unmute sin recargar el reproductor (ideal para YOU4)
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    try {
      if (muted) {
        inst.mute?.();
      } else {
        inst.unmute?.();
        inst.play?.();
      }
    } catch {
      // ignore
    }
  }, [muted]);

  // Disparo maestro de "Activar las 4" / "Pausar las 4" desde el botón central de YOU4
  useEffect(() => {
    if (!playTrigger) return;
    const inst = instanceRef.current;
    if (!inst) return;
    try {
      if (mutedRef.current) inst.mute?.();
      else inst.unmute?.();
      inst.play?.();
    } catch {
      // ignore
    }
  }, [playTrigger]);

  useEffect(() => {
    if (!pauseTrigger) return;
    const inst = instanceRef.current;
    if (!inst) return;
    try {
      inst.pause?.();
    } catch {
      // ignore
    }
  }, [pauseTrigger]);

  if (fallbackToIframe) {
    return (
      <iframe
        title={title}
        src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&mute=1&width=${width}`}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        overflow: 'hidden'
      }}
    />
  );
};
