import React, { useRef, useEffect, useState } from 'react';
import { VolumeX, Volume2, Radio, Play } from 'lucide-react';
import Hls from 'hls.js';

interface SyncedTVPlayerProps {
  url: string;
  isMuted: boolean;
  onUnmute: () => void;
  onVideoEnded: () => void;
  targetOffsetSeconds?: number;
  channelName?: string;
  hideLiveBadge?: boolean;
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
  if (url.includes('listType=') || url.includes('listtype=')) return '';
  const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([^#&?]*).*/);
  if (match && match[1] && match[1].length === 11) return match[1];
  const clean = url.replace('https://www.youtube.com/embed/', '').replace('yt-', '').replace('mood-', '').replace('live-', '').split('?')[0];
  return clean.length === 11 ? clean : '';
};

// Construye la URL oficial y válida para iframes de YouTube
const buildYouTubeEmbedSrc = (inputUrl: string, isMuted: boolean, offsetSeconds = 0, channelName = 'YouApp TV'): string => {
  if (!inputUrl) {
    return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(channelName)}&autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&rel=0&playsinline=1&enablejsapi=1`;
  }

  // 1. Si es búsqueda nativa de YouTube embebida (listType=search)
  if (inputUrl.includes('listType=search') || inputUrl.includes('listtype=search')) {
    const listMatch = inputUrl.match(/list=([^&#?]+)/);
    const queryTerm = listMatch ? listMatch[1] : encodeURIComponent(channelName);
    return `https://www.youtube.com/embed?listType=search&list=${queryTerm}&autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&rel=0&playsinline=1&enablejsapi=1`;
  }

  // 2. Si es una lista de reproducción / series (videoseries)
  if (inputUrl.includes('videoseries') || inputUrl.includes('list=PL') || inputUrl.includes('list=UU')) {
    const listMatch = inputUrl.match(/list=([^&#?]+)/);
    const listId = listMatch ? listMatch[1] : '';
    if (listId) {
      return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&rel=0&loop=1&playsinline=1`;
    }
  }

  // 3. Si es un video individual o con cola de videos 24/7
  const vid = extractYouTubeId(inputUrl);
  if (!vid || vid.length !== 11) {
    const queryFallback = encodeURIComponent(channelName || 'musica argentina');
    return `https://www.youtube.com/embed?listType=search&list=${queryFallback}&autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&rel=0&playsinline=1&enablejsapi=1`;
  }

  const baseUrl = `https://www.youtube.com/embed/${vid}`;
  const params = new URLSearchParams({
    autoplay: '1',
    mute: isMuted ? '1' : '0',
    controls: '1',
    rel: '0',
    playsinline: '1',
    enablejsapi: '1'
  });

  // Solo adjuntar cola de playlist si hay videos adicionales diferentes al principal
  const playlistMatch = inputUrl.match(/playlist=([^&#?]+)/);
  if (playlistMatch && playlistMatch[1]) {
    const rawList = decodeURIComponent(playlistMatch[1]).split(',').filter(Boolean);
    const otherIds = rawList.filter(id => id !== vid);
    if (otherIds.length > 0) {
      params.set('playlist', otherIds.join(','));
      params.set('loop', '1');
    }
  }

  if (offsetSeconds > 0) {
    params.set('start', Math.floor(offsetSeconds).toString());
  }

  // YouTube requiere comas literales para la lista de IDs en el parámetro playlist
  return `${baseUrl}?${params.toString().replace(/%2C/gi, ',')}`;
};

export const SyncedTVPlayer: React.FC<SyncedTVPlayerProps> = ({
  url,
  isMuted,
  onUnmute,
  onVideoEnded,
  targetOffsetSeconds = 0,
  channelName = 'YouApp TV',
  hideLiveBadge = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerId = useRef(`yt-container-${Math.floor(Math.random() * 100000)}`).current;
  const [needsUserTap, setNeedsUserTap] = useState(false);
  const isDirect = isDirectVideo(url);

  // Reloj Determinístico Global Universal (UTC Epoch Lock)
  const getExactUtcLiveSecond = (duration: number = 600) => {
    if (!duration || !isFinite(duration) || isNaN(duration) || duration <= 0) {
      return 0; // Transmisiones en vivo van en directo natural
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
          console.warn('Autoplay bloqueado por el navegador:', err);
          setNeedsUserTap(true);
        });
      }
    };

    if (url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(videoEl);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, startPlaying);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.addEventListener('loadedmetadata', startPlaying, { once: true });
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
      if (hlsInstance) hlsInstance.destroy();
    };
  }, [url, isDirect, onVideoEnded]);

  // Sincronización de mute nativo
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleUserUnlock = () => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.play().catch(console.warn);
    }
    setNeedsUserTap(false);
    onUnmute();
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
      ) : url.includes('player.twitch.tv') ? (
        /* 2. Reproductor Oficial de Twitch */
        <iframe
          id={containerId}
          key={url}
          src={url.includes('muted=') ? url : `${url}&muted=${isMuted}`}
          title={channelName}
          frameBorder="0"
          allow="autoplay; fullscreen"
          className="synced-tv-iframe"
        />
      ) : (
        /* 3. Reproductor YouTube Oficial y Fiable (Iframe directo optimizado 24/7) */
        <iframe
          id={containerId}
          key={`${url}_${targetOffsetSeconds}`}
          src={buildYouTubeEmbedSrc(url, isMuted, targetOffsetSeconds, channelName)}
          title={channelName}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
          className="synced-tv-iframe"
        />
      )}

      {/* Indicador de Transmisión Sincronizada en Vivo 24/7 */}
      {!hideLiveBadge && (
        <div className="player-top-badges">
          <button 
            className="live-sync-badge-pill" 
            onClick={handleUserUnlock}
            title="Toca para forzar sincronización"
          >
            <span className="live-red-dot" />
            <span>EN VIVO {formatMinSec(liveSeconds)}</span>
          </button>

          {!isDirect && url.includes('youtube') && (
            <a
              href={url.includes('/embed/') ? url.replace('/embed/', '/watch?v=').split('?')[0] : url}
              target="_blank"
              rel="noopener noreferrer"
              className="player-yt-external-link"
              title="Abrir transmisión en YouTube"
            >
              <span>Ver en YouTube</span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
            </a>
          )}
        </div>
      )}

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
          className="unmute-floating-pill" 
          onClick={handleUserUnlock}
          title="Toca para Activar Audio de la TV"
        >
          <VolumeX size={18} />
          <span>Activar Audio</span>
        </button>
      )}

      <style>{`
        .synced-player-container {
          position: relative;
          width: 100%;
          height: 100%;
          background: #000000;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .synced-native-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .synced-tv-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
          pointer-events: auto;
        }

        .synced-player-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          height: 100%;
          color: rgba(255, 255, 255, 0.7);
        }

        .player-top-badges {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 40;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .live-sync-badge-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 0, 85, 0.4);
          color: #ffffff;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 6px 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .live-sync-badge-pill:hover {
          background: rgba(255, 0, 85, 0.2);
          border-color: #ff0055;
          transform: scale(1.05);
        }

        .player-yt-external-link {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.85);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 20px;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .player-yt-external-link:hover {
          background: rgba(255, 0, 0, 0.3);
          border-color: #ff0000;
          color: #ffffff;
          transform: scale(1.05);
        }
        .live-red-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff0055;
          box-shadow: 0 0 8px #ff0055;
          animation: blink 1.2s infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .mobile-tap-unlock-overlay {
          position: absolute;
          inset: 0;
          z-index: 50;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          cursor: pointer;
          color: #ffffff;
          font-weight: 600;
        }
        .unlock-play-btn {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00f0ff, #7928ca);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.5);
          cursor: pointer;
        }

        .unmute-floating-pill {
          position: absolute;
          bottom: 24px;
          right: 24px;
          z-index: 40;
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #ff0077, #7928ca);
          border: none;
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 10px 18px;
          border-radius: 24px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(255, 0, 119, 0.4);
          transition: all 0.2s ease;
        }
        .unmute-floating-pill:hover {
          filter: brightness(1.2);
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
};

export default SyncedTVPlayer;
