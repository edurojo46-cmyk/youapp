import { useState } from 'react';
import { Cast, Tv, Smartphone, Share2, Copy, Check, X, ExternalLink } from 'lucide-react';

interface CastScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CastScreenModal({ isOpen, onClose }: CastScreenModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentUrl = window.location.href;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'YouApp - Televisión Digital 24/7',
          text: '¡Mira este canal de televisión 24/7 en YouApp!',
          url: currentUrl,
        });
      } catch {
        // Ignorar si cancela
      }
    } else {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cast-modal-overlay" onClick={onClose}>
      <div className="cast-modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cast size={24} className="text-accent" />
            <div>
              <h3>Transmitir Pantalla a tu Televisor</h3>
              <p>Elige cómo quieres ver YouApp en la pantalla grande</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="cast-options-grid">
          {/* Opción 1: Google Cast / Android */}
          <div className="cast-option-item">
            <div className="icon-circle">
              <Tv size={22} color="#6366f1" />
            </div>
            <div className="option-text">
              <h4>Chromecast / Android TV / Smart TV</h4>
              <p>Toca los <strong>3 puntitos (⋮)</strong> arriba a la derecha en tu navegador Chrome del celular y selecciona <strong>"Transmitir"</strong> o <strong>"Cast"</strong>.</p>
            </div>
          </div>

          {/* Opción 2: Apple AirPlay (iPhone) */}
          <div className="cast-option-item">
            <div className="icon-circle">
              <Smartphone size={22} color="#38bdf8" />
            </div>
            <div className="option-text">
              <h4>Apple AirPlay (iPhone / iPad / Mac)</h4>
              <p>Desliza hacia abajo para abrir el <strong>Centro de Control</strong> de tu iPhone, toca <strong>"Duplicar pantalla"</strong> y selecciona tu Smart TV.</p>
            </div>
          </div>

          {/* Opción 3: Compartir Enlace a la Tele o WhatsApp */}
          <div className="cast-option-item">
            <div className="icon-circle">
              <Share2 size={22} color="#4ade80" />
            </div>
            <div className="option-text">
              <h4>Enviar Enlace a la Tele o por WhatsApp</h4>
              <p>Comparte el enlace directo para abrirlo en el navegador de tu TV o enviarlo a un amigo.</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn btn-primary btn-sm" onClick={handleShare}>
                  <Share2 size={14} /> Compartir por WhatsApp
                </button>
                <button className="btn btn-glass btn-sm" onClick={handleCopyLink}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-glass" style={{ width: '100%' }} onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>

      <style>{`
        .cast-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .cast-modal-card {
          width: 100%;
          max-width: 480px;
          padding: 24px;
          border-radius: 20px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .modal-header p {
          margin: 2px 0 0 0;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .cast-options-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .cast-option-item {
          display: flex;
          gap: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 14px;
          align-items: flex-start;
        }

        .icon-circle {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .option-text h4 {
          margin: 0 0 4px 0;
          font-size: 0.85rem;
          color: white;
        }

        .option-text p {
          margin: 0;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.4;
        }

        .modal-footer {
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
}
