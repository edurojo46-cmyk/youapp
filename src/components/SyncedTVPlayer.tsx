import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Radio } from 'lucide-react';

interface SyncedTVPlayerProps {
  url: string;
  isMuted: boolean;
  onUnmute: () => void;
  onVideoEnded: () => void;
  targetOffsetSeconds?: number;
  channelName?: string;
  playlistIds?: string;
}

// Extrae el Video ID de cualquier URL de YouTube
const extractVideoId = (url: string): string => {
  if (!url) return '';
  const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([^#&?]*).*/);
  if (match && match[1]) return match[1];
  return url.replace('https://www.youtube.com/embed/', '').replace('yt-', '').replace('mood-', '').replace('live-', '');
};

export const SyncedTVPlayer: React.FC<SyncedTVPlayerProps> = ({
  url,
  isMuted,
  onUnmute,
  onVideoEnded,
  targetOffsetSeconds = 0,
  channelName = 'YouApp TV',
  playlistIds
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoId = extractVideoId(url);

  // Escuchar eventos de la API de YouTube por PostMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // 0 = ENDED -> Pasar al siguiente video automáticamente
        if ((data.event === 'onStateChange' && data.info === 0) || data.info?.playerState === 0) {
          onVideoEnded();
        }
      } catch (e) {}
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onVideoEnded]);

  if (!url || !videoId) {
    return (
      <div className="synced-player-empty">
        <Radio size={48} className="text-accent" />
        <h2>{channelName}</h2>
        <p>Sintonizando señal en vivo...</p>
      </div>
    );
  }

  const startParam = targetOffsetSeconds > 0 ? `&start=${Math.floor(targetOffsetSeconds)}` : '';
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&enablejsapi=1${startParam}`;

  return (
    <div className="synced-player-container">
      <iframe
        key={`${videoId}_${isMuted ? 1 : 0}`}
        ref={iframeRef}
        src={embedUrl}
        title={channelName}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        className="synced-tv-iframe"
      />



      {/* Botón de Sonido Flotante si está silenciado */}
      {isMuted && (
        <button 
          onClick={(e) => { e.stopPropagation(); onUnmute(); }} 
          className="zapping-unmute-btn"
        >
          <VolumeX size={18} />
          <span>Toca para Activar Sonido</span>
        </button>
      )}

      <style>{`
        .synced-player-container {
          position: absolute;
          inset: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          background: #000;
          overflow: hidden;
        }

        .synced-tv-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: 0;
          background: #000;
        }

        .synced-player-empty {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0b0d14;
          color: white;
          gap: 16px;
        }
      `}</style>
    </div>
  );
};

export default SyncedTVPlayer;


