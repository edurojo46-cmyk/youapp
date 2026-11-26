import React from 'react';

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
  thumbnailUrl?: string;
  title?: string;
}

/**
 * Reproductor oficial de Dailymotion:
 * - Dailymotion bloquea (HTTP 403) los embeds genéricos sin Player ID de Dailymotion Studio.
 * - Si existe VITE_DAILYMOTION_PLAYER_ID: usa el iframe oficial geo.dailymotion.com/player/{playerId}.html?video={videoId}.
 * - Si aún no está configurado: muestra la miniatura real con botón directo "Ver en Dailymotion ↗"
 *   para evitar pantalla negra.
 */
export const DailymotionOfficialPlayer: React.FC<DailymotionOfficialPlayerProps> = ({
  videoIdOrUrl,
  playerId = CUSTOM_DM_PLAYER_ID,
  className = '',
  thumbnailUrl,
  title
}) => {
  const videoId = extractDailymotionVideoId(videoIdOrUrl);
  if (!videoId) return null;

  const watchUrl = `https://www.dailymotion.com/video/${encodeURIComponent(videoId)}`;

  if (playerId) {
    return (
      <iframe
        key={`${playerId}-${videoId}`}
        title={title ? `Dailymotion · ${title}` : `Dailymotion · ${videoId}`}
        src={`https://geo.dailymotion.com/player/${encodeURIComponent(playerId)}.html?video=${encodeURIComponent(videoId)}`}
        className={className}
        frameBorder="0"
        referrerPolicy="strict-origin-when-cross-origin"
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
  }

  const posterSrc = thumbnailUrl || `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(videoId)}`;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#070b14',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px',
        textAlign: 'center'
      }}
    >
      <img
        src={posterSrc}
        alt={title || 'Video de Dailymotion'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.42,
          filter: 'blur(2px) scale(1.03)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(5,7,12,0.45) 0%, rgba(5,7,12,0.82) 100%)'
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '340px'
        }}
      >
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            background: 'rgba(10, 132, 255, 0.25)',
            border: '1px solid rgba(100, 210, 255, 0.5)',
            color: '#93d5ff',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em'
          }}
        >
          DAILYMOTION
        </span>
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
            fontSize: '13.5px',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(0, 113, 227, 0.45)'
          }}
        >
          ▶ Ver en Dailymotion ↗
        </a>
      </div>
    </div>
  );
};
