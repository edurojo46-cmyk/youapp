import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Radio } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

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
  channelName = 'YouApp TV'
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const videoId = extractVideoId(url);

  // Calcula el segundo exacto mundial de emisión en este milisegundo
  const getExactUtcLiveSecond = () => {
    const cycleDuration = 600; // ciclo de 10 minutos
    const epochSec = Math.floor(Date.now() / 1000);
    const hash = (videoId || '').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    return (epochSec + hash) % cycleDuration;
  };

  const [liveSeconds, setLiveSeconds] = useState(getExactUtcLiveSecond);

  // Reloj de emisión en vivo 24/7 en tiempo real sincronizado por UTC
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveSeconds(getExactUtcLiveSecond());
    }, 1000);
    return () => clearInterval(interval);
  }, [videoId]);

  // Cargar YouTube IFrame API script global si no existe
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  const initialStartSec = useRef(getExactUtcLiveSecond());

  // Reset al cambiar de video
  useEffect(() => {
    initialStartSec.current = getExactUtcLiveSecond();
  }, [videoId]);

  // Función para forzar sincronización imperativa con el reloj mundial
  const forceSyncToLive = () => {
    const currentExactSecond = getExactUtcLiveSecond();

    if (ytPlayerRef.current && ytPlayerRef.current.seekTo) {
      try {
        ytPlayerRef.current.seekTo(currentExactSecond, true);
        return;
      } catch (e) {}
    }

    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 1 }),
          '*'
        );
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'seekTo',
            args: [currentExactSecond, true]
          }),
          '*'
        );
      } catch (e) {}
    }
  };

  // Conectar YT.Player cuando el iframe termine de cargar
  const handleIframeLoad = () => {
    if (window.YT && window.YT.Player && iframeRef.current) {
      try {
        ytPlayerRef.current = new window.YT.Player(iframeRef.current, {
          events: {
            onStateChange: (event: any) => {
              if (event.data === 0) {
                onVideoEnded();
              }
            }
          }
        });
      } catch (e) {}
    }
  };

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

  const startParam = `&start=${Math.floor(initialStartSec.current)}`;
  const originParam = `&origin=${encodeURIComponent(window.location.origin)}`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&enablejsapi=1&rel=0&playsinline=0${originParam}${startParam}`;



  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="synced-player-container">
      <iframe
        key={`${videoId}_${isMuted ? 1 : 0}`}
        ref={iframeRef}
        src={embedUrl}
        onLoad={handleIframeLoad}
        title={channelName}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        className="synced-tv-iframe"
      />

      {/* Indicador de Transmisión Sincronizada en Vivo 24/7 */}
      <button 
        className="live-sync-badge-pill" 
        onClick={forceSyncToLive}
        title="Toca para forzar sincronización exacta con otros celulares"
      >
        <span className="live-red-dot" />
        <span>EN VIVO {formatMinSec(liveSeconds)}</span>
      </button>

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

        .live-sync-badge-pill {
          position: absolute;
          top: 70px;
          right: 20px;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 17, 26, 0.85);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
          transition: transform 0.2s, background 0.2s;
        }

        .live-sync-badge-pill:active {
          transform: scale(0.95);
          background: rgba(239, 68, 68, 0.3);
        }

        .live-red-dot {
          width: 8px;
          height: 8px;
          background: #ef4444;
          border-radius: 50%;
          animation: livePulse 1.5s infinite;
        }

        @keyframes livePulse {
          0% { transform: scale(0.9); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(0.9); opacity: 1; }
        }
      `}</style>

    </div>
  );
};

export default SyncedTVPlayer;


