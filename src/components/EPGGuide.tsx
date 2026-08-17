import { Tv, X, Play, Radio } from 'lucide-react';

interface EPGGuideProps {
  channels: any[];
  currentChannelIndex: number;
  onSelectChannel: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function EPGGuide({
  channels,
  currentChannelIndex,
  onSelectChannel,
  isOpen,
  onClose,
}: EPGGuideProps) {
  if (!isOpen) return null;

  return (
    <div className="epg-guide-overlay" onClick={onClose}>
      <div className="epg-guide-container glass-panel" onClick={(e) => e.stopPropagation()}>
        <header className="epg-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tv size={24} className="text-accent" />
            <div>
              <h3>Guía de Canales de Cable (EPG)</h3>
              <p>Sintoniza cualquier señal de la grilla en vivo al instante</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="epg-grid-list">
          {channels.map((ch, idx) => {
            const isCurrent = idx === currentChannelIndex;
            const currentVideo = ch.programming?.[0]?.videos;

            return (
              <div
                key={ch.id}
                className={`epg-channel-row ${isCurrent ? 'is-active' : ''}`}
                onClick={() => {
                  onSelectChannel(idx);
                  onClose();
                }}
              >
                <div className="channel-number-col">
                  <span className="ch-num">CH {String(idx + 1).padStart(2, '0')}</span>
                  {isCurrent && <span className="live-dot">● EN VIVO</span>}
                </div>

                <div className="channel-main-col">
                  <div className="ch-header">
                    <h4>{ch.name}</h4>
                    <span className="cat-badge">{ch.category || 'General'}</span>
                  </div>
                  {currentVideo ? (
                    <p className="now-title" dangerouslySetInnerHTML={{ __html: currentVideo.title }}></p>
                  ) : (
                    <p className="now-title" style={{ color: 'rgba(255,255,255,0.4)' }}>Transmisión continua 24/7</p>
                  )}
                </div>

                <div className="channel-action-col">
                  <button className="btn btn-primary btn-sm zap-btn">
                    <Play size={14} /> Sintonizar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .epg-guide-overlay {
          position: fixed;
          inset: 0;
          z-index: 150;
          background: rgba(5, 7, 12, 0.85);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .epg-guide-container {
          width: 100%;
          max-width: 680px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          border-radius: 20px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          overflow: hidden;
        }

        .epg-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .epg-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .epg-header p {
          margin: 2px 0 0 0;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .epg-grid-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .epg-channel-row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s, border-color 0.2s;
        }

        .epg-channel-row:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
          border-color: #6366f1;
        }

        .epg-channel-row.is-active {
          background: rgba(99, 102, 241, 0.2);
          border-color: #6366f1;
        }

        .channel-number-col {
          width: 80px;
          display: flex;
          flex-direction: column;
        }

        .ch-num {
          font-family: monospace;
          font-weight: 800;
          font-size: 1rem;
          color: #a5b4fc;
        }

        .live-dot {
          font-size: 0.6rem;
          font-weight: 800;
          color: #ef4444;
          margin-top: 2px;
        }

        .channel-main-col {
          flex: 1;
          overflow: hidden;
          padding: 0 16px;
        }

        .ch-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }

        .ch-header h4 {
          margin: 0;
          font-size: 0.95rem;
        }

        .cat-badge {
          font-size: 0.65rem;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.7);
        }

        .now-title {
          margin: 0;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .channel-action-col {
          flex-shrink: 0;
        }

        .zap-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          padding: 6px 12px;
        }
      `}</style>
    </div>
  );
}
