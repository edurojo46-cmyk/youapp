import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Maximize2, X } from 'lucide-react';

export interface GlobalMiniVideoItem {
  videoId: string;
  title: string;
  channelName?: string;
  provider?: 'youtube' | 'vimeo' | 'peertube' | 'archive' | 'odysee' | 'twitch' | 'dailymotion';
  embedUrl?: string;
  watchUrl?: string;
  originPath: string;
}

const GLOBAL_MINI_EVENT = 'youapp:global-mini-video';
const GLOBAL_MINI_STORAGE_KEY = 'youapp_global_mini_video_v1';

function readStoredMiniVideo(): GlobalMiniVideoItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(GLOBAL_MINI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.videoId !== 'string' || !parsed.videoId) return null;
    return parsed as GlobalMiniVideoItem;
  } catch {
    return null;
  }
}

let currentGlobalMiniVideo: GlobalMiniVideoItem | null = readStoredMiniVideo();

export function setGlobalMiniVideo(video: GlobalMiniVideoItem | null): void {
  currentGlobalMiniVideo = video;
  if (typeof window !== 'undefined') {
    try {
      if (video) {
        sessionStorage.setItem(GLOBAL_MINI_STORAGE_KEY, JSON.stringify(video));
      } else {
        sessionStorage.removeItem(GLOBAL_MINI_STORAGE_KEY);
      }
    } catch {
      // ignore storage quota
    }
    window.dispatchEvent(new Event(GLOBAL_MINI_EVENT));
  }
}

export function getGlobalMiniVideo(): GlobalMiniVideoItem | null {
  return currentGlobalMiniVideo;
}

const OWN_PLAYER_PREFIXES = ['/mitv', '/misenal', '/live', '/player', '/reels', '/youmusic', '/remote'];

function buildEmbedSrc(v: GlobalMiniVideoItem): string | null {
  if (v.provider === 'vimeo') {
    const id = v.videoId.replace(/^vm_/, '');
    return `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1&dnt=1`;
  }
  if ((v.provider === 'peertube' || v.provider === 'odysee' || v.provider === 'twitch') && v.embedUrl) {
    return v.embedUrl;
  }
  if (v.provider === 'archive') {
    const id = v.videoId.replace(/^ar_/, '');
    return v.embedUrl || `https://archive.org/embed/${encodeURIComponent(id)}?autoplay=1`;
  }
  if (v.provider === 'dailymotion') {
    return null;
  }
  return `https://www.youtube.com/embed/${encodeURIComponent(v.videoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export const GlobalMiniPlayer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [video, setVideo] = useState<GlobalMiniVideoItem | null>(() => currentGlobalMiniVideo);

  useEffect(() => {
    const onSync = () => setVideo(currentGlobalMiniVideo);
    window.addEventListener(GLOBAL_MINI_EVENT, onSync);
    return () => window.removeEventListener(GLOBAL_MINI_EVENT, onSync);
  }, []);

  if (!video) return null;

  const path = location.pathname.toLowerCase();
  // En la misma página de origen ya se muestra el reproductor principal (sin duplicar audio)
  if (path === video.originPath.toLowerCase()) return null;
  // No competir con pantallas que ya tienen su propio reproductor principal
  if (OWN_PLAYER_PREFIXES.some((p) => path.startsWith(p))) return null;

  const embedSrc = buildEmbedSrc(video);
  if (!embedSrc) return null;

  return (
    <>
      <aside className="ya-global-mini" aria-label="Mini-reproductor flotante YOUAPP">
        <div className="ya-global-mini-bar">
          <span className="ya-global-mini-title" title={video.title}>
            {video.title}
          </span>
          <div className="ya-global-mini-actions">
            <button
              type="button"
              className="ya-global-mini-btn"
              onClick={() => navigate(video.originPath)}
              title="Volver al reproductor grande"
              aria-label="Volver al reproductor grande"
            >
              <Maximize2 size={12} />
            </button>
            <button
              type="button"
              className="ya-global-mini-btn"
              onClick={() => setGlobalMiniVideo(null)}
              title="Cerrar mini-reproductor"
              aria-label="Cerrar mini-reproductor"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <div className="ya-global-mini-frame">
          <iframe
            key={video.videoId}
            src={embedSrc}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </aside>

      <style>{`
        .ya-global-mini {
          position: fixed;
          right: 14px;
          bottom: max(14px, env(safe-area-inset-bottom));
          width: 310px;
          max-width: calc(100vw - 24px);
          z-index: 99990;
          border-radius: 14px;
          overflow: hidden;
          background: rgba(12, 15, 22, 0.96);
          border: 1.5px solid rgba(255, 255, 255, 0.28);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .ya-global-mini-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 5px 8px;
          background: rgba(8, 10, 16, 0.94);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ya-global-mini-title {
          font-size: 11px;
          font-weight: 600;
          color: #f5f5f7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
        }
        .ya-global-mini-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .ya-global-mini-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }
        .ya-global-mini-btn:hover {
          background: rgba(255, 255, 255, 0.24);
        }
        .ya-global-mini-frame {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
        }
        .ya-global-mini-frame iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }
        @media (max-width: 640px) {
          .ya-global-mini {
            width: 224px;
            right: 10px;
            bottom: max(10px, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </>
  );
};
