import { useState } from 'react';
import { X, Maximize2, RefreshCw, Volume2, VolumeX } from 'lucide-react';

interface MultiviewPiPProps {
  channel: any;
  isOpen: boolean;
  onClose: () => void;
  onSwapWithMain: () => void;
}

export default function MultiviewPiP({ channel, isOpen, onClose, onSwapWithMain }: MultiviewPiPProps) {
  const [isMuted, setIsMuted] = useState(true);

  if (!isOpen || !channel) return null;

  return (
    <div className="pip-floating-box glass-panel">
      <div className="pip-header">
        <span className="pip-tag">📺 2º CANAL EN VIVO</span>
        <div className="pip-controls">
          <button className="pip-btn" onClick={() => setIsMuted(prev => !prev)} title="Silenciar / Activar sonido">
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button className="pip-btn" onClick={onSwapWithMain} title="Intercambiar con pantalla principal">
            <RefreshCw size={14} />
          </button>
          <button className="pip-btn" onClick={onClose} title="Cerrar ventana flotante">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="pip-video-wrapper">
        <iframe
          src={`${channel.videoUrl}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0`}
          title={channel.name}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="pip-iframe"
        />
      </div>

      <div className="pip-footer">
        <p dangerouslySetInnerHTML={{ __html: channel.currentVideoTitle || channel.name }}></p>
      </div>

      <style>{`
        .pip-floating-box {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 280px;
          height: 190px;
          z-index: 110;
          border-radius: 14px;
          background: rgba(15, 17, 26, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.8);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease-out;
        }

        .pip-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: rgba(0, 0, 0, 0.6);
        }

        .pip-tag {
          font-size: 0.65rem;
          font-weight: 800;
          color: #a5b4fc;
          letter-spacing: 0.5px;
        }

        .pip-controls {
          display: flex;
          gap: 4px;
        }

        .pip-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
        }

        .pip-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .pip-video-wrapper {
          flex: 1;
          position: relative;
          background: black;
        }

        .pip-iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .pip-footer {
          padding: 4px 8px;
          background: rgba(15, 17, 26, 0.9);
        }

        .pip-footer p {
          margin: 0;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
