import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Radio, Loader2 } from 'lucide-react';

interface SyncedTVPlayerProps {
  url: string;
  isMuted: boolean;
  onUnmute: () => void;
  onVideoEnded: () => void;
  targetOffsetSeconds?: number;
  channelName?: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Extrae el Video ID de URLs de YouTube
const extractVideoId = (url: string): string => {
  if (!url) return '';
  const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([^#&?]*).*/);
  return match && match[1] ? match[1] : url.replace('https://www.youtube.com/embed/', '').replace('yt-', '');
};

export const SyncedTVPlayer: React.FC<SyncedTVPlayerProps> = ({
  url,
  isMuted,
  onUnmute,
  onVideoEnded,
  targetOffsetSeconds = 0,
  channelName = 'YouApp TV'
}) => {
  const containerIdRef = useRef(`yt-player-${Math.floor(Math.random() * 100000)}`);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const videoId = extractVideoId(url);

  // Cargar el script de YouTube IFrame API una sola vez
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Inicializar o actualizar el reproductor
  useEffect(() => {
    if (!videoId) return;

    let isSubscribed = true;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 200);
        return;
      }

      if (!isSubscribed) return;

      // Si el reproductor ya existe, cargar el nuevo video
      if (playerRef.current && playerRef.current.loadVideoById) {
        try {
          playerRef.current.loadVideoById({
            videoId,
            startSeconds: targetOffsetSeconds > 0 ? targetOffsetSeconds : 0
          });
          if (isMuted) playerRef.current.mute();
          else playerRef.current.unMute();
          return;
        } catch (e) {
          // recreate
        }
      }

      // Crear nuevo reproductor de YouTube
      playerRef.current = new window.YT.Player(containerIdRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          playsinline: 0,
          start: targetOffsetSeconds > 0 ? Math.floor(targetOffsetSeconds) : 0
        },
        events: {
          onReady: (event: any) => {
            if (!isSubscribed) return;
            setIsReady(true);
            if (isMuted) event.target.mute();
            else event.target.unMute();
            event.target.playVideo();

            // Salto forzado al segundo exacto sincronizado en vivo
            if (targetOffsetSeconds > 0) {
              event.target.seekTo(targetOffsetSeconds, true);
            }
          },
          onStateChange: (event: any) => {
            // 0 = YT.PlayerState.ENDED (Video Terminado -> Pasar al siguiente automáticamente!)
            if (event.data === 0) {
              onVideoEnded();
            }
          },
          onError: (err: any) => {
            console.warn("YouTube video error, pasando al siguiente:", err);
            // Si el video está bloqueado, avanza al siguiente automáticamente
            setTimeout(() => {
              if (isSubscribed) onVideoEnded();
            }, 2000);
          }
        }
      });
    };

    initPlayer();

    return () => {
      isSubscribed = false;
    };
  }, [videoId]);

  // Manejo de Mute en tiempo real
  useEffect(() => {
    if (playerRef.current && playerRef.current.mute && playerRef.current.unMute) {
      if (isMuted) playerRef.current.mute();
      else playerRef.current.unMute();
    }
  }, [isMuted]);

  if (!url) {
    return (
      <div className="synced-player-empty">
        <Radio size={48} className="text-accent" />
        <h2>{channelName}</h2>
        <p>Sintonizando señal en vivo...</p>
      </div>
    );
  }

  return (
    <div className="synced-player-container">
      {/* Contenedor del IFrame de YouTube */}
      <div id={containerIdRef.current} className="yt-iframe-target" />

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

      {/* Indicador de Sincronización */}
      {!isReady && (
        <div className="player-buffering-indicator">
          <Loader2 className="animate-spin" size={20} />
          <span>Sincronizando señal 24/7...</span>
        </div>
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

        .yt-iframe-target {
          width: 100%;
          height: 100%;
          border: 0;
          background: #000;
        }

        .yt-iframe-target iframe {
          width: 100% !important;
          height: 100% !important;
          border: 0 !important;
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

        .player-buffering-indicator {
          position: absolute;
          bottom: 100px;
          right: 20px;
          z-index: 40;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 17, 26, 0.85);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.9);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.8rem;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

export default SyncedTVPlayer;

