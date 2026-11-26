import React, { useEffect, useRef } from 'react';

const CUSTOM_DM_PLAYER_ID: string =
  ((import.meta as any).env?.VITE_DAILYMOTION_PLAYER_ID || '').trim();

export function extractDailymotionVideoId(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const geoMatch = trimmed.match(/geo\.dailymotion\.com\/player[^?]*\?[^#]*video=([a-zA-Z0-9]+)/i);
  if (geoMatch?.[1]) return geoMatch[1];
  const urlMatch = trimmed.match(/(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^x[a-zA-Z0-9]{4,10}$/.test(trimmed)) return trimmed;
  return null;
}

interface DailymotionOfficialPlayerProps {
  videoIdOrUrl: string;
  playerId?: string;
  className?: string;
}

/**
 * Reproductor oficial de Dailymotion:
 * - En dominio HTTPS público (tu web online): usa el iframe oficial o Player Script de Dailymotion.
 * - En localhost (donde geo.dailymotion.com devuelve 403): muestra tarjeta limpia con miniatura
 *   y botón directo "Abrir en Dailymotion ↗" en lugar de pantalla negra.
 */
export const DailymotionOfficialPlayer: React.FC<DailymotionOfficialPlayerProps> = ({
  videoIdOrUrl,
  playerId = CUSTOM_DM_PLAYER_ID,
  className = ''
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const videoId = extractDailymotionVideoId(videoIdOrUrl);
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'http:');

  useEffect(() => {
    if (!playerId || isLocalhost) return;
    const container = hostRef.current;
    if (!container || !videoId) return;

    container.innerHTML = '';
    const script = document.createElement('script');
    script.src = `https://geo.dailymotion.com/player/${encodeURIComponent(playerId)}.js`;
    script.setAttribute('data-video', videoId);
    script.async = true;
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [isLocalhost, playerId, videoId]);

  if (!videoId) return null;

  if (playerId && !isLocalhost) {
    return (
      <div
        ref={hostRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '220px',
          background: '#000000',
          position: 'relative'
        }}
      />
    );
  }

  return (
    <iframe
      key={videoId}
      title={`Dailymotion · ${videoId}`}
      src={`https://www.dailymotion.com/embed/video/${encodeURIComponent(videoId)}?autoplay=1&queue-enable=false`}
      className={className}
      frameBorder="0"
      allow="autoplay; fullscreen; picture-in-picture; web-share"
      allowFullScreen
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        background: '#000000'
      }}
    />
  );
};
