import React, { useState, useEffect } from 'react';
import { Cast, Tv, Smartphone, QrCode, ExternalLink, X, Check, Wifi, Sparkles, Share2 } from 'lucide-react';

declare global {
  interface Window {
    chrome?: any;
    cast?: any;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
  }
  namespace JSX {
    interface IntrinsicElements {
      'google-cast-launcher': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}


interface CastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentChannel: any;
  pin: string;
}

export default function CastModal({
  isOpen,
  onClose,
  currentChannel,
  pin
}: CastModalProps) {
  const [castAvailable, setCastAvailable] = useState(false);
  const [copied, setCopied] = useState(false);

  // Inicializar Google Cast SDK
  useEffect(() => {
    // Definir callback global requerido por Google Cast SDK
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable && window.cast && window.cast.framework) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          context.setOptions({
            receiverApplicationId: 'CC1AD845', // Default Media Receiver
            autoJoinPolicy: (window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED) || 'origin_scoped'
          });
          setCastAvailable(true);
        } catch (e) {
          console.error("Error initializing Google Cast:", e);
        }
      }
    };

    // Inyectar el SDK de Google Cast si no existe
    if (!document.getElementById('google-cast-sdk')) {
      const script = document.createElement('script');
      script.id = 'google-cast-sdk';
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      document.body.appendChild(script);
    }
  }, []);

  if (!isOpen) return null;

  const rawVideoId = currentChannel?.videoUrl
    ? currentChannel.videoUrl.replace('https://www.youtube.com/embed/', '').replace('yt-', '').split('?')[0]
    : '';

  const tvUrl = `${window.location.origin}${window.location.pathname}#/live?room=${pin}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tvUrl)}&color=6366f1&bgcolor=0f111a`;

  const handleCopy = () => {
    navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeCast = () => {
    // Si Google Cast SDK está disponible, solicitar sesión de transmisión
    if (window.cast && window.cast.framework) {
      try {
        const context = window.cast.framework.CastContext.getInstance();
        context.requestSession().then(
          () => {
            console.log("Sesión de Google Cast iniciada con éxito");
          },
          (err: any) => {
            console.log("Cast cancelado o no disponible:", err);
          }
        );
        return;
      } catch (e) {}
    }

    // Fallback a Presentation API (Wireless Display / Pantallas Smart)
    if ('presentation' in navigator && (navigator as any).presentation?.defaultRequest) {
      try {
        (navigator as any).presentation.defaultRequest.start();
        return;
      } catch (e) {}
    }

    // Si no está en Google Chrome, guiar al usuario
    alert("Para transmitir con Chromecast / Google Home:\n1. Abre YouApp en Google Chrome en tu celular o PC.\n2. Pulsa el botón Transmitir en el menú de Chrome o usa el botón de Google Cast que aparece abajo.");
  };

  const openOnYouTubeTV = () => {
    if (rawVideoId) {
      window.open(`https://www.youtube.com/watch?v=${rawVideoId}`, '_blank');
    }
  };

  return (
    <div className="cast-modal-overlay" onClick={onClose}>
      <div className="cast-modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        
        {/* Cabecera */}
        <div className="cast-modal-header">
          <div className="cast-title-group">
            <div className="cast-icon-badge">
              <Cast size={22} className="text-accent" />
            </div>
            <div>
              <h3>Transmitir a la TV (Google Cast / Smart TV)</h3>
              <p>Envía la señal en vivo a tu Smart TV, Chromecast o Google Nest</p>
            </div>
          </div>
          <button className="close-cast-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Canales / Opciones de Transmisión */}
        <div className="cast-options-grid">

          {/* Opción 1: Google Cast / Chromecast Oficial */}
          <div className="cast-card glass-card" onClick={handleNativeCast}>
            <div className="cast-card-icon chromecast-icon">
              <Cast size={28} />
            </div>
            <div className="cast-card-content">
              <h4>1. Google Cast / Chromecast</h4>
              <p>Transmite directamente a tu Chromecast, Android TV o Google Home en tu red Wi-Fi.</p>
              
              <div className="google-cast-launcher-row" onClick={(e) => e.stopPropagation()}>
                {/* Botón Nativo oficial de Google Cast */}
                {React.createElement('google-cast-launcher', { className: 'custom-cast-launcher' })}
                <button className="btn btn-primary btn-sm" onClick={handleNativeCast}>
                  <Wifi size={16} style={{ marginRight: '6px' }} /> Conectar Dispositivo Wi-Fi
                </button>
              </div>

            </div>
          </div>

          {/* Opción 2: Modo Smart TV YouApp (PIN / QR) */}
          <div className="cast-card glass-card">
            <div className="cast-card-icon smarttv-icon">
              <Tv size={28} />
            </div>
            <div className="cast-card-content">
              <h4>2. Abrir en el Navegador de tu Smart TV</h4>
              <p>Abre YouApp en tu televisor y sincroniza instantáneamente con este PIN:</p>
              
              <div className="tv-pin-display">
                <span className="pin-label">PIN DE SALA:</span>
                <span className="pin-digits">{pin || '5821'}</span>
              </div>

              <div className="cast-qr-box">
                <img src={qrImageUrl} alt="QR para Smart TV" className="qr-img" />
                <div className="qr-instructions">
                  <span>Escanea con la cámara de otro celular o televisor para entrar a la misma sala sincronizada.</span>
                  <button className="btn btn-glass btn-sm" onClick={handleCopy} style={{ marginTop: '8px' }}>
                    {copied ? <Check size={14} /> : <Share2 size={14} />} {copied ? 'Enlace Copiado' : 'Copiar Enlace TV'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Opción 3: Abrir en la App de YouTube de la Smart TV */}
          {rawVideoId && (
            <div className="cast-card glass-card" onClick={openOnYouTubeTV}>
              <div className="cast-card-icon yt-app-icon">
                <ExternalLink size={28} />
              </div>
              <div className="cast-card-content">
                <h4>3. Abrir en la App de YouTube de tu TV</h4>
                <p>Si tu TV tiene la app de YouTube oficial instalada, puedes abrir el video directamente.</p>
                <button className="btn btn-glass btn-sm" onClick={openOnYouTubeTV} style={{ marginTop: '8px' }}>
                  <ExternalLink size={14} style={{ marginRight: '6px' }} /> Abrir en YouTube
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="cast-modal-footer">
          <button className="btn btn-glass" onClick={onClose} style={{ width: '100%' }}>
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
          max-width: 580px;
          max-height: 90vh;
          overflow-y: auto;
          background: #0f111a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          padding: 24px;
          color: white;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }

        .cast-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .cast-title-group {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .cast-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cast-title-group h3 {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0;
        }

        .cast-title-group p {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
          margin: 2px 0 0 0;
        }

        .close-cast-btn {
          background: transparent;
          border: 0;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
        }

        .close-cast-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .cast-options-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
        }

        .cast-card {
          display: flex;
          gap: 16px;
          padding: 18px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cast-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }

        .cast-card-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .chromecast-icon {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.3));
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .smarttv-icon {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.3));
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }

        .yt-app-icon {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.3));
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .cast-card-content {
          flex: 1;
        }

        .cast-card-content h4 {
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0 0 4px 0;
        }

        .cast-card-content p {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.65);
          margin: 0 0 10px 0;
          line-height: 1.35;
        }

        .google-cast-launcher-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .custom-cast-launcher {
          width: 38px;
          height: 38px;
          --disconnected-color: white;
          --connected-color: #60a5fa;
          cursor: pointer;
        }

        .tv-pin-display {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(0, 0, 0, 0.5);
          padding: 8px 14px;
          border-radius: 10px;
          margin-bottom: 12px;
          width: fit-content;
        }

        .pin-label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
        }

        .pin-digits {
          font-family: monospace;
          font-size: 1.3rem;
          font-weight: 800;
          color: #a5b4fc;
          letter-spacing: 3px;
        }

        .cast-qr-box {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(0, 0, 0, 0.4);
          padding: 12px;
          border-radius: 12px;
        }

        .qr-img {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .qr-instructions {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}
