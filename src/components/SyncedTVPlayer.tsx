import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Volume2, Radio, Play, Loader2 } from 'lucide-react';
import Hls from 'hls.js';

declare global {
  interface Window {
    YT: any;
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

// Determina si una URL es video directo (MP4, WebM, HLS m3u8) o YouTube
const isDirectVideo = (url: string): boolean => {
  if (!url) return false;
  const clean = url.toLowerCase().split('?')[0];
  return (
    clean.endsWith('.mp4') ||
    clean.endsWith('.m3u8') ||
    clean.endsWith('.webm') ||
    clean.includes('.mp4') ||
    clean.includes('.m3u8') ||
    clean.includes('commondatastorage.googleapis.com') ||
    clean.includes('storage.googleapis.com') ||
    clean.includes('supabase.co/storage')
  );
};

// Extrae el Video ID de YouTube
const extractYouTubeId = (url: string): string => {
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerId = useRef(`yt-container-${Math.floor(Math.random() * 100000)}`).current;
  const ytPlayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserTap, setNeedsUserTap] = useState(false);

  const isDirect = isDirectVideo(url);
  const ytId = !isDirect ? extractYouTubeId(url) : '';

  // Reloj Determinístico Global Universal (UTC Epoch Lock)
  const getExactUtcLiveSecond = (duration: number = 600) => {
    if (!duration || !isFinite(duration) || isNaN(duration) || duration <= 0) {
      return 0; // Transmisiones en vivo continuas van en directo natural sin seek
    }
    const epochSec = Math.floor(Date.now() / 1000);
    const seed = (url || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return (epochSec + seed) % Math.max(10, Math.floor(duration));
  };

  const [liveSeconds, setLiveSeconds] = useState(() => getExactUtcLiveSecond(600));

  // Ticker de emisión visual
  useEffect(() => {
    const interval = setInterval(() => {
      const currentDur = videoRef.current?.duration;
      if (currentDur && isFinite(currentDur) && currentDur > 0) {
        setLiveSeconds(getExactUtcLiveSecond(currentDur));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [url]);

  // ==========================================
  // MOTOR NATIVO HTML5 / HLS (Control Total 100%)
  // ==========================================
  useEffect(() => {
    if (!isDirect || !url || !videoRef.current) return;

    const videoEl = videoRef.current;
    let hlsInstance: Hls | null = null;

    videoEl.muted = isMuted;

    const startPlaying = () => {
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Autoplay blocked or waiting for user tap:", err);
          setNeedsUserTap(true);
        });
      }
    };

    if (url.includes('.m3u8')) {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.addEventListener('loadedmetadata', startPlaying, { once: true });
      } else if (Hls.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(videoEl);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          startPlaying();
        });
        hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hlsInstance?.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hlsInstance?.recoverMediaError();
            }
          }
        });
      }
    } else {
      videoEl.src = url;
      videoEl.load();
      videoEl.addEventListener('loadeddata', startPlaying, { once: true });
      videoEl.addEventListener('error', () => {
        console.warn('[SyncedTVPlayer] Video failed to load, skipping to next:', url);
        onVideoEnded();
      }, { once: true });
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [url, isDirect]);

  // Sincronizar Mute nativo
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // ==========================================
  // MOTOR YOUTUBE (Bindeo correcto de API sobre Iframe)
  // ==========================================
  useEffect(() => {
    if (isDirect || !ytId) return;

    let isSubscribed = true;

    const initYt = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initYt, 150);
        return;
      }
      if (!isSubscribed) return;

      const liveSec = targetOffsetSeconds || getExactUtcLiveSecond(600);

      try {
        ytPlayerRef.current = new window.YT.Player(containerId, {
          events: {
            onReady: (e: any) => {
              if (!isSubscribed) return;
              if (liveSec > 0) e.target.seekTo(liveSec, true);
              if (isMuted) e.target.mute();
              else e.target.unMute();
              e.target.playVideo();
            },
            onStateChange: (e: any) => {
              if (e.data === 0) onVideoEnded();
            }
          }
        });
      } catch (err) {
        console.error("Error binding YT Player:", err);
      }
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    initYt();

    return () => {
      isSubscribed = false;
    };
  }, [ytId, isDirect, targetOffsetSeconds]);

  // Sincronizar Mute para YouTube programáticamente
  useEffect(() => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function') {
      try {
        if (isMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch (e) {}
    }
  }, [isMuted]);

  // Desbloqueo táctil de usuario (Mobile Gesture Unlock)
  const handleUserUnlock = () => {
    setNeedsUserTap(false);
    onUnmute();

    if (isDirect && videoRef.current) {
      const videoEl = videoRef.current;
      videoEl.muted = false;
      if (videoEl.duration) {
        videoEl.currentTime = getExactUtcLiveSecond(videoEl.duration);
      }
      videoEl.play();
    } else if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.unMute();
        if (targetOffsetSeconds > 0) {
          ytPlayerRef.current.seekTo(targetOffsetSeconds, true);
        }
        ytPlayerRef.current.playVideo();
      } catch (e) {}
    }
  };

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
      {/* 1. Reproductor Nativo HTML5 para MP4 / HLS */}
      {isDirect ? (
        <video
          ref={videoRef}
          className="synced-native-video"
          src={url.includes('.m3u8') ? undefined : url}
          playsInline
          autoPlay
          loop
          muted={isMuted}
          controls={false}
          onClick={handleUserUnlock}
        />
      ) : (
        /* 2. Reproductor YouTube Oficial y Fiable (Iframe directo bindeado) */
        <iframe
          id={containerId}
          key={`${ytId}_${targetOffsetSeconds}`}
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&enablejsapi=1&rel=0&fs=1&playsinline=0${targetOffsetSeconds ? `&start=${Math.floor(targetOffsetSeconds)}` : ''}`}
          title={channelName}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          {...{ webkitAllowFullScreen: true, mozAllowFullScreen: true } as any}
          className="synced-tv-iframe"
        />
      )}


      {/* Indicador de Transmisión Sincronizada en Vivo 24/7 */}
      <button 
        className="live-sync-badge-pill" 
        onClick={handleUserUnlock}
        title="Toca para forzar sincronización"
      >
        <span className="live-red-dot" />
        <span>EN VIVO {formatMinSec(liveSeconds)}</span>
      </button>

      {/* Overlay de Desbloqueo si el móvil bloqueó el autoplay */}
      {needsUserTap && isDirect && (
        <div className="mobile-tap-unlock-overlay" onClick={handleUserUnlock}>
          <button className="unlock-play-btn">
            <Play size={32} fill="white" />
          </button>
          <span>Toca para Sintonizar en Vivo</span>
        </div>
      )}

      {/* Botón de Sonido Flotante si está silenciado */}
      {isMuted && (
        <button 
          onClick={(e) => { e.stopPropagation(); handleUserUnlock(); }} 
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

        .synced-native-video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
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

        /* Fullscreen nativo en móvil - idéntico a YouTube */
        .synced-tv-iframe:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 99999 !important;
        }

        .synced-tv-iframe:-moz-full-screen {
          width: 100vw !important;
          height: 100vh !important;
        }

        .synced-tv-iframe:fullscreen {
          width: 100vw !important;
          height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 99999 !important;
          background: #000 !important;
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

