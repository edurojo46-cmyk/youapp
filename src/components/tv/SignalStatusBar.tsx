import React from 'react';
import { Target, Clock, Sparkles, ShieldCheck, Settings2 } from 'lucide-react';

export function SignalStatusBar() {
  return (
    <div className="status-bar">
      <div className="status-item">
        <Target size={20} color="var(--you-blue-vivid)" className="status-icon" />
        <div>
          <div className="status-label">Tu señal inteligente</div>
          <div className="status-value">Hecha para vos</div>
        </div>
      </div>

      <div className="status-divider"></div>

      <div className="status-item">
        <Clock size={20} color="var(--you-blue-vivid)" className="status-icon" />
        <div>
          <div className="status-label">Duración total</div>
          <div className="status-value">1 h 05 min</div>
        </div>
      </div>

      <div className="status-divider"></div>

      <div className="status-item">
        <Sparkles size={20} color="var(--you-blue-vivid)" className="status-icon" />
        <div>
          <div className="status-label">Contenido de calidad</div>
          <div className="status-value">Curado con IA</div>
        </div>
      </div>

      <div className="status-divider"></div>

      <div className="status-item">
        <ShieldCheck size={20} color="var(--you-blue-vivid)" className="status-icon" />
        <div>
          <div className="status-label">Fuentes confiables</div>
          <div className="status-value">Verificadas</div>
        </div>
      </div>

      <div style={{ flex: 1 }}></div>

      <div className="status-item" style={{ marginRight: '24px' }}>
        <div className="live-dot"></div>
        <div>
          <div className="status-label">Señal activa</div>
          <div className="status-value">En vivo</div>
        </div>
      </div>

      <button className="status-edit-btn">
        Editar mi señal <Settings2 size={14} />
      </button>

      <style>{`
        .status-bar {
          display: flex;
          align-items: center;
          padding: 16px 40px;
          background: var(--you-surface);
          border-top: 1px solid var(--you-border);
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-icon {
          opacity: 0.8;
        }

        .status-divider {
          width: 1px;
          height: 24px;
          background: var(--you-border);
          margin: 0 24px;
        }

        .status-label {
          font-size: 11px;
          color: var(--you-text-secondary);
          margin-bottom: 2px;
          font-weight: 500;
        }

        .status-value {
          font-size: 13px;
          color: var(--you-text);
          font-weight: 600;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: #48bb78;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(72, 187, 120, 0.6);
        }

        .status-edit-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--you-bg);
          border: 1px solid var(--you-border);
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-text);
          cursor: pointer;
          transition: 0.2s;
        }

        .status-edit-btn:hover {
          background: var(--you-border);
        }
      `}</style>
    </div>
  );
}
