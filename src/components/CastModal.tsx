import React, { useState, useEffect, useCallback } from 'react';
import { Cast, Tv, ExternalLink, X, Wifi, Download } from 'lucide-react';

declare global {
  interface Window {
    chrome?: any;
    cast?: any;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    YouAppAndroidPiP?: {
      isSupported?: () => boolean;
      enterPiP?: () => void;
      share?: (title: string, text: string, url: string) => void;
      openCastSettings?: () => void;
    };
  }
  namespace JSX {
    interface IntrinsicElements {
      'google-cast-launcher': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

const ANDROID_TV_APK_URL =
  'https://github.com/edurojo46-cmyk/youapp/releases/download/android-pip-latest/YOUAPP-TV-Android-PiP.apk';

interface CastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentChannel: any;
  pin: string;
}

export default function CastModal({ isOpen, onClose, currentChannel }: CastModalProps) {
  const [castNotice, setCastNotice] = useState<string | null>(null);

  const hasAndroidNativeCast =
    typeof window !== 'undefined' && typeof window.YouAppAndroidPiP?.openCastSettings === 'function';

  const rawVideoId = (() => {
    const rawUrl = String(currentChannel?.videoUrl || '');
    const m = rawUrl.match(/(?:embed\/|v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    const clean = rawUrl.replace('https://www.youtube.com/embed/', '').replace('yt-', '').split('?')[0];
    return /^[A-Za-z0-9_-]{11}$/.test(clean) ? clean : '';
  })();

  const isDirectStream = Boolean(
    currentChannel?.videoUrl && /\.(mp4|m3u8|webm)(\?|$)/i.test(String(currentChannel.videoUrl))
  );

  const sendMediaToCast = useCallback(
    (castSession: any) => {
      if (!castSession || !window.chrome?.cast || !currentChannel?.videoUrl) return;
      const videoUrl = String(currentChannel.videoUrl);
      if (!isDirectStream) {
        setCastNotice(
          'Chromecast genérico solo reproduce streams MP4/HLS. Para videos de YouTube, usá «Transmitir pantalla a tu TV» arriba o «Abrir en YouTube» abajo.'
        );
        try {
          castSession.endSession(true);
        } catch {
          // ignore
        }
        return;
      }
      setCastNotice(null);
      try {
        const contentType = videoUrl.includes('.m3u8')
          ? 'application/x-mpegurl'
          : videoUrl.includes('.webm')
            ? 'video/webm'
            : 'video/mp4';
        const mediaInfo = new window.chrome.cast.media.MediaInfo(videoUrl, contentType);
        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = currentChannel.name || 'YouApp TV';
        mediaInfo.metadata.subtitle = currentChannel.currentVideoTitle || 'Transmisión en Vivo';
        if (currentChannel.thumbnail) {
          mediaInfo.metadata.images = [{ url: currentChannel.thumbnail }];
        }
        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        castSession.loadMedia(request).catch(() => {});
      } catch {
        // ignore
      }
    },
    [currentChannel, isDirectStream]
  );

  useEffect(() => {
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable && window.cast && window.cast.framework) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          context.setOptions({
            receiverApplicationId: 'CC1AD845',
            autoJoinPolicy: window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED || 'origin_scoped'
          });
          context.addEventListener(
            window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            (event: any) => {
              if (
                event.sessionState === window.cast.framework.SessionState.SESSION_STARTED ||
                event.sessionState === window.cast.framework.SessionState.SESSION_RESUMED
              ) {
                const session = context.getCurrentSession();
                if (session) sendMediaToCast(session);
              }
            }
          );
        } catch {
          // ignore
        }
      }
    };

    if (!document.getElementById('google-cast-sdk')) {
      const script = document.createElement('script');
      script.id = 'google-cast-sdk';
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      document.body.appendChild(script);
    }
  }, [sendMediaToCast]);

  if (!isOpen) return null;

  const handleDirectTvCast = () => {
    // 1. En la APK Android: abre el selector nativo de Emitir / Smart View / Chromecast del celular en 1 toque
    if (hasAndroidNativeCast) {
      window.YouAppAndroidPiP?.openCastSettings?.();
      return;
    }

    // 2. Si es un stream directo MP4/HLS en Chrome: usa Google Cast SDK directo
    if (isDirectStream && window.cast && window.cast.framework) {
      try {
        const context = window.cast.framework.CastContext.getInstance();
        context
          .requestSession()
          .then(() => {
            const session = context.getCurrentSession();
            if (session) sendMediaToCast(session);
          })
          .catch(() => {});
        return;
      } catch {
        // fallback below
      }
    }

    setCastNotice(
      'En Chrome tocá el menú ⋮ (arriba a la derecha) → Guardar y compartir → Transmitir… y elegí tu Chromecast o Smart TV. En la APK Android de YOUAPP este botón abre el selector de TV directo en 1 toque.'
    );
  };

  const openOnYouTubeTV = () => {
    if (rawVideoId) {
      window.open(`https://www.youtube.com/watch?v=${rawVideoId}`, '_blank');
    }
  };

  return (
    <div className="cast-modal-overlay" onClick={onClose}>
      <div className="cast-modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cast-modal-header">
          <div className="cast-title-group">
            <div className="cast-icon-badge">
              <Cast size={22} className="text-accent" />
            </div>
            <div>
              <h3>Transmitir directo a tu TV</h3>
              <p>Sin abrir navegador en la tele ni usar el teclado del control remoto</p>
            </div>
          </div>
          <button type="button" className="close-cast-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {castNotice && <div className="cast-notice-box">{castNotice}</div>}

        <div className="cast-options-grid">
          {/* Opción 1: Transmitir directo a Chromecast / Smart TV */}
          <div className="cast-card glass-card" onClick={handleDirectTvCast}>
            <div className="cast-card-icon chromecast-icon">
              <Cast size={26} />
            </div>
            <div className="cast-card-content">
              <h4>1. Transmitir a Chromecast / Smart TV</h4>
              <p>
                {hasAndroidNativeCast
                  ? 'Abre el selector nativo de tu Android (Chromecast, Smart View, Screen Share) en 1 toque para enviar todo YOUAPP en HD.'
                  : 'Envía tu señal directo a Chromecast, Samsung Smart View, LG o Android TV en tu Wi-Fi.'}
              </p>
              <div className="google-cast-launcher-row" onClick={(e) => e.stopPropagation()}>
                {!hasAndroidNativeCast &&
                  isDirectStream &&
                  React.createElement('google-cast-launcher', { className: 'custom-cast-launcher' })}
                <button type="button" className="btn btn-primary btn-sm" onClick={handleDirectTvCast}>
                  <Wifi size={15} style={{ marginRight: '6px' }} />
                  {hasAndroidNativeCast ? 'Elegir mi TV ahora' : 'Transmitir a mi TV'}
                </button>
              </div>
            </div>
          </div>

          {/* Opción 2: Abrir en la app de YouTube para Chromecast nativo */}
          {rawVideoId && (
            <div className="cast-card glass-card" onClick={openOnYouTubeTV}>
              <div className="cast-card-icon yt-app-icon">
                <ExternalLink size={24} />
              </div>
              <div className="cast-card-content">
                <h4>2. Enviar por App de YouTube (Chromecast nativo)</h4>
                <p>Abre este video en YouTube para tocar su botón Cast oficial y apagar la pantalla del celular.</p>
                <button
                  type="button"
                  className="btn btn-glass btn-sm"
                  onClick={openOnYouTubeTV}
                  style={{ marginTop: '8px' }}
                >
                  <ExternalLink size={14} style={{ marginRight: '6px' }} /> Abrir en YouTube
                </button>
              </div>
            </div>
          )}

          {/* Opción 3: App nativa YOUAPP para Android TV / Google TV / Fire TV */}
          <div className="cast-card glass-card">
            <div className="cast-card-icon smarttv-icon">
              <Tv size={26} />
            </div>
            <div className="cast-card-content">
              <h4>{rawVideoId ? '3.' : '2.'} App YOUAPP para Android TV / Google TV</h4>
              <p>
                Instalala una vez en tu Google TV, Android TV o Fire TV (sin navegador). Se vincula sola con tu celular por tu cuenta.
              </p>
              <a
                href={ANDROID_TV_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-glass btn-sm"
                style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                <Download size={14} style={{ marginRight: '6px' }} /> Descargar App Android / Android TV
              </a>
            </div>
          </div>
        </div>

        <div className="cast-modal-footer">
          <button type="button" className="btn btn-glass" onClick={onClose} style={{ width: '100%' }}>
            Cerrar
          </button>
        </div>
      </div>

      <style>{`
        .cast-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(12px);
          padding: 16px;
        }
        .cast-modal-container {
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow-y: auto;
          background: #0f111a;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 20px;
          padding: 20px;
          color: white;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }
        .cast-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .cast-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cast-title-group h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 750;
        }
        .cast-title-group p {
          margin: 2px 0 0;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.68);
        }
        .cast-icon-badge {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(0, 113, 227, 0.24);
          border: 1px solid rgba(100, 210, 255, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #64d2ff;
        }
        .close-cast-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .cast-notice-box {
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(245, 158, 11, 0.16);
          border: 1px solid rgba(245, 158, 11, 0.45);
          color: #fde68a;
          font-size: 12.5px;
          line-height: 1.45;
        }
        .cast-options-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .cast-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          cursor: pointer;
        }
        .cast-card:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(100, 210, 255, 0.45);
        }
        .cast-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .chromecast-icon { background: rgba(0, 113, 227, 0.25); color: #64d2ff; }
        .yt-app-icon { background: rgba(239, 68, 68, 0.24); color: #fca5a5; }
        .smarttv-icon { background: rgba(139, 92, 246, 0.25); color: #c4b5fd; }
        .cast-card-content {
          flex: 1;
          min-width: 0;
        }
        .cast-card-content h4 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }
        .cast-card-content p {
          margin: 0;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
          line-height: 1.4;
        }
        .google-cast-launcher-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .custom-cast-launcher {
          width: 30px;
          height: 30px;
          display: inline-block;
        }
        .cast-modal-footer {
          margin-top: 14px;
        }
      `}</style>
    </div>
  );
}
