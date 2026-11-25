import { useState } from 'react';
import { Smartphone, X, Copy, Check, ExternalLink } from 'lucide-react';

interface RemoteConnectModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  isPhoneConnected: boolean;
}

const LAN_HOST_KEY = 'youapp_remote_lan_host_v1';

export default function RemoteConnectModal({
  sessionId,
  isOpen,
  onClose,
  isPhoneConnected,
}: RemoteConnectModalProps) {
  const [copied, setCopied] = useState(false);
  const [useFallbackQr, setUseFallbackQr] = useState(false);
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [lanHost, setLanHost] = useState<string>(() => {
    try {
      return localStorage.getItem(LAN_HOST_KEY) || '';
    } catch {
      return '';
    }
  });

  if (!isOpen) return null;

  const cleanLanHost = lanHost.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const baseOrigin =
    isLocalhost && cleanLanHost
      ? `${window.location.protocol}//${cleanLanHost}`
      : window.location.origin;
  const remoteUrl = `${baseOrigin}/remote/${encodeURIComponent(sessionId)}`;
  const qrCodeUrl = useFallbackQr
    ? `https://quickchart.io/qr?size=240&margin=2&text=${encodeURIComponent(remoteUrl)}`
    : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(remoteUrl)}&color=0f172a&bgcolor=ffffff`;

  const handleLanHostChange = (val: string) => {
    setLanHost(val);
    setUseFallbackQr(false);
    try {
      if (val.trim()) localStorage.setItem(LAN_HOST_KEY, val.trim());
      else localStorage.removeItem(LAN_HOST_KEY);
    } catch {
      // ignore
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(remoteUrl).catch(() => {});
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
              <p>Escaneá el QR o ingresá el PIN en tu teléfono para controlar esta TV</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Indicador de Estado de Conexión */}
          <div className={`status-pill ${isPhoneConnected ? 'connected' : 'waiting'}`}>
            <span className="dot">●</span>
            <span>{isPhoneConnected ? '¡Teléfono Conectado!' : 'Esperando conexión...'}</span>
          </div>

          {/* Código PIN de 4 Dígitos */}
          <div className="pin-display-box">
            <span className="pin-label">CÓDIGO PIN PARA TU CELULAR:</span>
            <div className="pin-number">{sessionId}</div>
          </div>

          {/* Código QR */}
          <div className="qr-container">
            <img
              src={qrCodeUrl}
              alt="Código QR del Control Remoto"
              className="qr-image"
              onError={() => {
                if (!useFallbackQr) setUseFallbackQr(true);
              }}
            />
          </div>

          {isLocalhost && (
            <div className="lan-host-box">
              <label htmlFor="youapp-lan-host">
                Estás en <strong>localhost</strong>. Para abrir desde el celular en tu Wi-Fi, poné la IP de esta PC:
              </label>
              <input
                id="youapp-lan-host"
                type="text"
                value={lanHost}
                onChange={(e) => handleLanHostChange(e.target.value)}
                placeholder={`Ej: 192.168.0.7:${window.location.port || '5173'}`}
              />
            </div>
          )}

          <div className="qr-instructions">
            <p>
              <strong>Opción 1 (Con Cámara):</strong> Apuntá la cámara de tu celular al código QR.
            </p>
            <p>
              <strong>Opción 2 (Con PIN):</strong> En tu celular abrí <u>{baseOrigin}/remote</u> y escribí el PIN{' '}
              <strong>{sessionId}</strong>.
            </p>
          </div>

          {/* Opciones alternativas */}
          <div className="modal-actions">
            <button type="button" className="btn btn-glass btn-sm" onClick={handleCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Enlace Copiado' : 'Copiar Enlace'}
            </button>
            <button
              type="button"
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
          background: rgba(0, 0, 0, 0.82);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
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
          border-radius: 22px;
          background: rgba(15, 17, 26, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
          text-align: center;
          color: #f8fafc;
        }

        .remote-connect-card .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          text-align: left;
          margin-bottom: 14px;
        }

        .remote-connect-card .close-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #e2e8f0;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .remote-connect-card .modal-header h3 {
          margin: 0;
          font-size: 1.08rem;
          color: #ffffff;
        }

        .remote-connect-card .modal-header p {
          margin: 2px 0 0 0;
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .remote-connect-card .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 14px;
        }

        .remote-connect-card .status-pill.waiting {
          background: rgba(234, 179, 8, 0.15);
          color: #facc15;
          border: 1px solid rgba(234, 179, 8, 0.3);
        }

        .remote-connect-card .status-pill.connected {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .remote-connect-card .status-pill .dot {
          animation: pulse 1.5s infinite;
        }

        .remote-connect-card .pin-display-box {
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.4);
          border-radius: 14px;
          padding: 8px 16px;
          margin-bottom: 14px;
        }

        .remote-connect-card .pin-label {
          display: block;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 1px;
          color: #a5b4fc;
        }

        .remote-connect-card .pin-number {
          font-family: monospace;
          font-size: 2.1rem;
          font-weight: 900;
          letter-spacing: 6px;
          color: #ffffff;
          text-shadow: 0 0 20px rgba(99, 102, 241, 0.8);
        }

        .remote-connect-card .qr-container {
          background: #ffffff;
          padding: 12px;
          border-radius: 18px;
          display: inline-block;
          border: 2px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
          margin-bottom: 14px;
        }

        .remote-connect-card .qr-image {
          width: 210px;
          height: 210px;
          display: block;
          border-radius: 6px;
        }

        .remote-connect-card .lan-host-box {
          text-align: left;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.28);
          border-radius: 12px;
          padding: 10px 12px;
          margin-bottom: 12px;
        }

        .remote-connect-card .lan-host-box label {
          display: block;
          font-size: 0.74rem;
          color: #bae6fd;
          margin-bottom: 6px;
          line-height: 1.35;
        }

        .remote-connect-card .lan-host-box input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 7px 10px;
          color: #ffffff;
          font-size: 0.82rem;
          outline: none;
        }

        .remote-connect-card .qr-instructions {
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.5;
          margin-bottom: 16px;
          text-align: left;
          background: rgba(255, 255, 255, 0.05);
          padding: 10px 14px;
          border-radius: 12px;
        }

        .remote-connect-card .qr-instructions p {
          margin: 4px 0;
          word-break: break-word;
        }

        .remote-connect-card .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .remote-connect-card .modal-actions .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 14px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }

        .remote-connect-card .modal-actions .btn-primary {
          background: linear-gradient(135deg, #6366f1, #38bdf8);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}
