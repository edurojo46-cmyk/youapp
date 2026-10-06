import React from 'react';
import { Sparkles, Bookmark, Plus, Subtitles, Share2, Compass, List } from 'lucide-react';

interface PlayerActionBarProps {
  onContextClick?: () => void;
  onSummaryClick?: () => void;
  onMomentsClick?: () => void;
  onSaveClick?: () => void;
  onShareClick?: () => void;
}

export function PlayerActionBar({
  onContextClick,
  onSummaryClick,
  onMomentsClick,
  onSaveClick,
  onShareClick
}: PlayerActionBarProps) {
  return (
    <div className="action-bar">
      <button className="action-btn" onClick={onSummaryClick}>
        <Sparkles size={14} /> Resumen IA
      </button>
      <button className="action-btn" onClick={onMomentsClick}>
        <Bookmark size={14} /> Momentos
      </button>
      <button className="action-btn" onClick={onSaveClick}>
        <Plus size={14} /> Guardar
      </button>
      <button className="action-btn epistemic-action-btn" onClick={onContextClick} title="Contexto y rigor epistemológico del contenido">
        <Compass size={14} className="text-cyan-400" /> Contexto
      </button>
      <button className="action-btn" onClick={onShareClick}>
        <Share2 size={14} /> Compartir
      </button>
      
      <div style={{ flex: 1 }}></div>

      <button className="action-btn">
        1.0x Velocidad <span style={{ fontSize: '10px', marginLeft: 4 }}>▼</span>
      </button>
      <button className="action-btn">
        <List size={14} /> Lista
      </button>

      <style>{`
        .action-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--you-surface);
          border: 1px solid var(--you-border);
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-text);
          cursor: pointer;
          box-shadow: var(--you-shadow-sm);
          transition: 0.2s;
        }

        .action-btn:hover {
          background: var(--you-bg);
          transform: translateY(-1px);
        }

        .epistemic-action-btn {
          border-color: rgba(56, 189, 248, 0.4);
          background: rgba(56, 189, 248, 0.08);
          color: #38bdf8;
        }

        .epistemic-action-btn:hover {
          background: rgba(56, 189, 248, 0.16);
        }
      `}</style>
    </div>
  );
}
