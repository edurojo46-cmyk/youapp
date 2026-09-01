import React from 'react';
import { Sparkles, Bookmark, Plus, Subtitles, Share2, Settings2, List } from 'lucide-react';

export function PlayerActionBar() {
  return (
    <div className="action-bar">
      <button className="action-btn">
        <Sparkles size={14} /> Resumen IA
      </button>
      <button className="action-btn">
        <Bookmark size={14} /> Momentos
      </button>
      <button className="action-btn">
        <Plus size={14} /> Guardar
      </button>
      <button className="action-btn">
        <Subtitles size={14} /> Subtítulos
      </button>
      <button className="action-btn">
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
          gap: 12px;
          margin-top: 8px;
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
      `}</style>
    </div>
  );
}
