import { useState } from 'react';
import { Maximize2, Volume2, VolumeX, X, Grid, RefreshCw } from 'lucide-react';

interface QuadMultiviewProps {
  channels: any[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMainChannel: (index: number) => void;
}

export default function QuadMultiview({
  channels,
  isOpen,
  onClose,
  onSelectMainChannel,
}: QuadMultiviewProps) {
  // Índices de los 4 canales en los cuadrantes (0, 1, 2, 3)
  const [quadIndices, setQuadIndices] = useState<number[]>([0, 1, 2, 3]);
  // Cuadrante que tiene el audio activo (0, 1, 2 o 3, o null para todos mute)
  const [activeAudioQuad, setActiveAudioQuad] = useState<number | null>(0);

  if (!isOpen || channels.length === 0) return null;

  // Cambiar el canal de un cuadrante específico
  const handleNextChannelInQuad = (quadIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuadIndices((prev) => {
      const next = [...prev];
      next[quadIndex] = (next[quadIndex] + 1) % channels.length;
      return next;
    });
  };

  return (
    <div className="quad-multiview-viewport">
      {/* Barra Superior del Modo 4 Pantallas */}
      <header className="quad-header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Grid size={20} className="text-accent" />
          <span className="quad-title">MODO QUAD-VIEW (4 PANTALLAS EN VIVO)</span>
          <span className="quad-hint">• Toca cualquier pantalla para escuchar su audio</span>
        </div>
        <button className="quad-close-btn" onClick={onClose} title="Volver a 1 Pantalla (ESC)">
          <X size={20} /> Salir de 4 Pantallas
        </button>
      </header>

      {/* Cuadrícula 2x2 */}
      <div className="quad-grid">
        {quadIndices.map((channelIdx, quadPos) => {
          const ch = channels[channelIdx % channels.length] || channels[0];
          const isAudioActive = activeAudioQuad === quadPos;

          return (
            <div
              key={quadPos}
              className={`quad-cell ${isAudioActive ? 'audio-active' : ''}`}
              onClick={() => setActiveAudioQuad(quadPos)}
            >
              {/* Iframe del Canal */}
              <iframe
                src={`${ch.videoUrl}?autoplay=1&mute=${isAudioActive ? 0 : 1}&controls=0`}
                title={ch.name}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="quad-iframe"
              />

              {/* Overlay de Control del Cuadrante */}
              <div className="quad-cell-overlay">
                <div className="quad-cell-header">
                  <span className="quad-badge">
                    CH {String((channelIdx % channels.length) + 1).padStart(2, '0')} • {ch.name}
                  </span>
                  <div className="quad-cell-actions">
                    <button
                      className={`quad-icon-btn ${isAudioActive ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAudioQuad(isAudioActive ? null : quadPos);
                      }}
                      title={isAudioActive ? 'Silenciar audio' : 'Activar audio en esta pantalla'}
                    >
                      {isAudioActive ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                    <button
                      className="quad-icon-btn"
                      onClick={(e) => handleNextChannelInQuad(quadPos, e)}
                      title="Cambiar canal en este cuadrante"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="quad-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMainChannel(channelIdx % channels.length);
                        onClose();
                      }}
                      title="Ver este canal a pantalla completa"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="quad-cell-footer">
                  <p dangerouslySetInnerHTML={{ __html: ch.currentVideoTitle || ch.name }}></p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .quad-multiview-viewport {
          position: fixed;
          inset: 0;
          z-index: 9000;
          background: #000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: fadeIn 0.2s ease-out;
        }

        .quad-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          background: rgba(15, 17, 26, 0.9);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 100;
        }

        .quad-title {
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #a5b4fc;
        }

        .quad-hint {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .quad-close-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }

        .quad-close-btn:hover {
          background: #ef4444;
        }

        .quad-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 4px;
          background: #0b0d14;
          padding: 4px;
        }

        .quad-cell {
          position: relative;
          background: black;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .quad-cell:hover {
          border-color: rgba(99, 102, 241, 0.6);
        }

        .quad-cell.audio-active {
          border-color: #6366f1;
          box-shadow: inset 0 0 0 2px #6366f1;
        }

        .quad-iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
          pointer-events: none;
        }

        .quad-cell-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 10px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.8) 100%);
          opacity: 0.85;
          transition: opacity 0.2s;
        }

        .quad-cell:hover .quad-cell-overlay {
          opacity: 1;
        }

        .quad-cell-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .quad-badge {
          background: rgba(15, 17, 26, 0.85);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .quad-cell-actions {
          display: flex;
          gap: 6px;
        }

        .quad-icon-btn {
          background: rgba(15, 17, 26, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        .quad-icon-btn:hover {
          background: #6366f1;
        }

        .quad-icon-btn.active {
          background: #6366f1;
          border-color: #6366f1;
        }

        .quad-cell-footer p {
          margin: 0;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }

        @media (max-width: 768px) {
          .quad-grid {
            grid-template-columns: 1fr;
            grid-template-rows: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
