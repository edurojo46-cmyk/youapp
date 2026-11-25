import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface XOfficialTweetEmbedProps {
  tweetId: string;
  sourceUrl?: string;
}

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        createTweet: (
          tweetId: string,
          container: HTMLElement,
          options?: Record<string, unknown>
        ) => Promise<HTMLElement | undefined>;
      };
    };
  }
}

let twitterWidgetsPromise: Promise<boolean> | null = null;

function loadTwitterWidgets(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.twttr?.widgets?.createTweet) return Promise.resolve(true);
  if (twitterWidgetsPromise) return twitterWidgetsPromise;

  twitterWidgetsPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = window.setTimeout(
      () => finish(Boolean(window.twttr?.widgets?.createTweet)),
      6500
    );

    const checkReady = () => {
      if (window.twttr?.widgets?.createTweet) {
        window.clearTimeout(timeout);
        finish(true);
        return true;
      }
      return false;
    };

    if (!document.getElementById('twitter-wjs')) {
      const s = document.createElement('script');
      s.id = 'twitter-wjs';
      s.async = true;
      s.src = 'https://platform.twitter.com/widgets.js';
      s.onload = () => {
        if (!checkReady()) {
          const poll = window.setInterval(() => {
            if (checkReady()) window.clearInterval(poll);
          }, 120);
        }
      };
      s.onerror = () => {
        window.clearTimeout(timeout);
        finish(false);
      };
      document.body.appendChild(s);
    } else {
      const poll = window.setInterval(() => {
        if (checkReady()) window.clearInterval(poll);
      }, 120);
    }
  });

  return twitterWidgetsPromise;
}

/**
 * Reproductor oficial de X / Twitter usando platform.twitter.com/widgets.js (twttr.widgets.createTweet).
 */
export const XOfficialTweetEmbed: React.FC<XOfficialTweetEmbedProps> = ({ tweetId, sourceUrl }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void loadTwitterWidgets().then(async (ok) => {
      if (cancelled || !hostRef.current) return;
      if (!ok || !window.twttr?.widgets?.createTweet) {
        setStatus('failed');
        return;
      }
      hostRef.current.replaceChildren();
      try {
        const el = await window.twttr.widgets.createTweet(tweetId, hostRef.current, {
          theme: 'dark',
          dnt: true,
          align: 'center',
          lang: 'es',
          conversation: 'none'
        });
        if (!cancelled) {
          setStatus(el ? 'ready' : 'failed');
        }
      } catch {
        if (!cancelled) setStatus('failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  const fallbackHref = sourceUrl || `https://x.com/i/status/${encodeURIComponent(tweetId)}`;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#0b0d12',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: status === 'ready' ? 'flex-start' : 'center',
        padding: '10px',
        boxSizing: 'border-box'
      }}
    >
      <div ref={hostRef} style={{ width: '100%', maxWidth: '520px' }} />

      {status === 'loading' && (
        <span style={{ fontSize: '12px', color: 'rgba(245, 245, 247, 0.72)' }}>
          Cargando publicación de X…
        </span>
      )}

      {status === 'failed' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            textAlign: 'center',
            padding: '16px',
            color: 'rgba(245, 245, 247, 0.82)',
            fontSize: '12.5px'
          }}
        >
          <span>
            X no permitió incrustar esta publicación (puede estar restringida o bloqueada por un bloqueador de rastreadores).
          </span>
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '999px',
              background: '#0071e3',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 650,
              fontSize: '12px'
            }}
          >
            <span>Abrir en X</span>
            <ExternalLink size={13} />
          </a>
        </div>
      )}
    </div>
  );
};
