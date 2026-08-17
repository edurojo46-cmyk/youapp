import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Volume2, Radio, Play, Loader2 } from 'lucide-react';

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
  const containerId = useRef(`yt-container-${Math.floor(Math.random() * 100000)}`).current;
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserTap, setNeedsUserTap] = useState(false);
  const hasSeekedRef = useRef(false);
  const videoId = extractVideoId(url);

  const [liveSeconds, setLiveSeconds] = useState(Math.floor(targetOffsetSeconds));

  // Reloj visual de emisión
  useEffect(() => {
    setLiveSeconds(Math.floor(targetOffsetSeconds));
    const interval = setInterval(() => {
      setLiveSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [videoId, targetOffsetSeconds]);

  // Cargar SDK de YouTube una sola vez
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Inicializar reproductor de YouTube
  useEffect(() => {
    if (!videoId) return;
    hasSeekedRef.current = false;
    setIsPlaying(false);

    let isSubscribed = true;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 150);
        return;
      }

      if (!isSubscribed) return;

      // Si el reproductor ya existe en memoria, cargar nuevo video
      if (playerRef.current && playerRef.current.loadVideoById) {
        try {
          playerRef.current.loadVideoById({
            videoId,
            startSeconds: Math.floor(targetOffsetSeconds)
          });
          if (isMuted) playerRef.current.mute();
          else playerRef.current.unMute();
          return;
        } catch (e) {}
      }

      // Crear nuevo reproductor oficial
      try {
        playerRef.current = new window.YT.Player(containerId, {
          videoId,
          playerVars: {
            autoplay: 1,
            mute: isMuted ? 1 : 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            playsinline: 1,
            start: Math.floor(targetOffsetSeconds)
          },
          events: {
            onReady: (event: any) => {
              if (!isSubscribed) return;
              if (isMuted) event.target.mute();
              else event.target.unMute();

              try {
                event.target.seekTo(targetOffsetSeconds, true);
                event.target.playVideo();
              } catch (e) {}

              // Si en 1.5s no está reproduciendo, mostrar botón para toque de usuario
              setTimeout(() => {
                if (isSubscribed && event.target.getPlayerState && event.target.getPlayerState() !== 1) {
                  setNeedsUserTap(true);
                }
              }, 1500);
            },
            onStateChange: (event: any) => {
              // 1 = PLAYING
              if (event.data === 1) {
                setIsPlaying(true);
                setNeedsUserTap(false);
                // Forzar salto exacto en el primer fotograma
                if (!hasSeekedRef.current && targetOffsetSeconds > 0) {
                  event.target.seekTo(targetOffsetSeconds, true);
                  hasSeekedRef.current = true;
                }
              }
              // 0 = ENDED -> Siguiente video automáticamente
              if (event.data === 0) {
                onVideoEnded();
              }
            }
          }
        });
      } catch (e) {}
    };

    initPlayer();

    return () => {
      isSubscribed = false;
    };
  }, [videoId, targetOffsetSeconds]);

  // Manejar Mute
  useEffect(() => {
    if (playerRef.current) {
      try {
        if (isMuted) playerRef.current.mute();
        else playerRef.current.unMute();
      } catch (e) {}
    }
  }, [isMuted]);

  // Toque de usuario para desbloquear y sincronizar en móviles
  const handleUserUnlock = () => {
    setNeedsUserTap(false);
    onUnmute();
    if (playerRef.current) {
      try {
        playerRef.current.unMute();
        playerRef.current.seekTo(targetOffsetSeconds, true);
        playerRef.current.playVideo();
        hasSeekedRef.current = true;
      } catch (e) {}
    }
  };

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!url || !videoId) {
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
      {/* Contenedor oficial de YouTube */}
      <div id={containerId} className="synced-tv-iframe" />

      {/* Botón de Sincronización en Vivo */}
      <button 
        className="live-sync-badge-pill" 
        onClick={handleUserUnlock}
        title="Toca para forzar sincronización"
      >
        <span className="live-red-dot" />
        <span>EN VIVO {formatMinSec(liveSeconds)}</span>
      </button>

      {/* Overlay de Desbloqueo si el móvil bloqueó el autoplay */}
      {needsUserTap && (
        <div className="mobile-tap-unlock-overlay" onClick={handleUserUnlock}>
          <button className="unlock-play-btn">
            <Play size={32} fill="white" />
          </button>
          <span>Toca para Sintonizar en Vivo</span>
        </div>
      )}

      {/* Botón de Sonido Flotante si está silenciado */}
      {isMuted && !needsUserTap && (
        <button 
          onClick={(e) => { e.stopPropagation(); onUnmute(); if (playerRef.current) { try { playerRef.current.unMute(); } catch (e) {} } }} 
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
          width: 100% !important;
          height: 100% !important;
          border: 0;
          background: #000;
        }

        .synced-tv-iframe iframe {
          width: 100% !important;
          height: 100% !important;
          border: 0 !important;
        }

        .mobile-tap-unlock-overlay {
          position: absolute;
          inset: 0;
          z-index: 60;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          color: white;
          gap: 16px;
          cursor: pointer;
        }

        .unlock-play-btn {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: #6366f1;
          border: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(99, 102, 241, 0.6);
          animation: pulseBtn 2s infinite;
        }

        @keyframes pulseBtn {
          0% { transform: scale(1); box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); }
          50% { transform: scale(1.1); box-shadow: 0 0 35px rgba(99, 102, 241, 0.8); }
          100% { transform: scale(1); box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); }
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
