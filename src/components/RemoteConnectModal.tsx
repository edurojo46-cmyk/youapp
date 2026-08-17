import { useState } from 'react';
import { Smartphone, X, Copy, Check, ExternalLink, QrCode } from 'lucide-react';

interface RemoteConnectModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  isPhoneConnected: boolean;
}

export default function RemoteConnectModal({
  sessionId,
  isOpen,
  onClose,
  isPhoneConnected,
}: RemoteConnectModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const remoteUrl = `${window.location.origin}${window.location.pathname}#/remote/${sessionId}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(remoteUrl)}&color=6366f1&bgcolor=0b0d14`;


  const handleCopy = () => {
    navigator.clipboard.writeText(remoteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="remote-connect-overlay" onClick={onClose}>
      <div className="remote-connect-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={24} className="text-accent" />
            <div>
              <h3>Control Remoto por Celular</h3>
              <p>Escanea el código para controlar esta pantalla desde tu teléfono</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Indicador de Estado de Conexión */}
          <div className={`status-pill ${isPhoneConnected ? 'connected' : 'waiting'}`}>
            <span className="dot">●</span>
            <span>{isPhoneConnected ? '¡Teléfono Conectado!' : 'Esperando escaneo del celular...'}</span>
          </div>

          {/* Código QR */}
          <div className="qr-container">
            <img 
              src={qrCodeUrl} 
              alt="Código QR del Control Remoto" 
              className="qr-image"
            />
          </div>

          <p className="qr-instructions">
            1. Abre la cámara de tu celular (iPhone o Android).<br />
            2. Apunta al código QR y toca el enlace que aparece.<br />
            3. ¡Listo! Tu teléfono se convertirá en un control remoto táctil.
          </p>

          {/* Opciones alternativas */}
          <div className="modal-actions">
            <button className="btn btn-glass btn-sm" onClick={handleCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Enlace Copiado' : 'Copiar Enlace'}
            </button>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => window.open(remoteUrl, '_blank')}
            >
              <ExternalLink size={16} /> Abrir Control en otra pestaña
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .remote-connect-overlay {
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

        .remote-connect-card {
          width: 100%;
          max-width: 440px;
          padding: 24px;
          border-radius: 20px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          text-align: center;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          text-align: left;
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

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 16px;
        }

        .status-pill.waiting {
          background: rgba(234, 179, 8, 0.15);
          color: #facc15;
          border: 1px solid rgba(234, 179, 8, 0.3);
        }

        .status-pill.connected {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .status-pill .dot {
          animation: pulse 1.5s infinite;
        }

        .qr-container {
          background: #0b0d14;
          padding: 12px;
          border-radius: 16px;
          display: inline-block;
          border: 2px solid rgba(99, 102, 241, 0.3);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
          margin-bottom: 16px;
        }

        .qr-image {
          width: 200px;
          height: 200px;
          display: block;
          border-radius: 8px;
        }

        .qr-instructions {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.5;
          margin-bottom: 20px;
          text-align: left;
          background: rgba(255, 255, 255, 0.04);
          padding: 12px 16px;
          border-radius: 10px;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
