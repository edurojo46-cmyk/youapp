import React, { useEffect, useRef } from 'react';
import { ExternalLink, Play } from 'lucide-react';

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

  if (isLocalhost) {
    const watchUrl = `https://www.dailymotion.com/video/${encodeURIComponent(videoId)}`;
    const thumbUrl = `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(videoId)}`;
    return (
      <div
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: `linear-gradient(180deg, rgba(15,15,20,0.45) 0%, rgba(10,10,14,0.88) 100%), url(${thumbUrl}) center/cover no-repeat`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          padding: '16px',
          textAlign: 'center',
          color: '#ffffff',
          boxSizing: 'border-box'
        }}
      >
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '999px',
            background: '#0071e3',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(0, 113, 227, 0.35)'
          }}
        >
          <Play size={14} fill="#ffffff" />
          <span>Ver / Escuchar en Dailymotion</span>
          <ExternalLink size={13} />
        </a>
        <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.82)', maxWidth: '340px' }}>
          Dailymotion bloquea embeds en <code>localhost</code> (403); al publicar en tu dominio{' '}
          <code>https://</code> reproduce integrado automáticamente.
        </span>
      </div>
    );
  }

  if (playerId) {
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
      src={`https://geo.dailymotion.com/player.html?video=${encodeURIComponent(videoId)}`}
      className={className}
      frameBorder="0"
      allow="autoplay; fullscreen; picture-in-picture; web-share"
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
