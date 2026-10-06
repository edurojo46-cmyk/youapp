import React from 'react';
import { Play, Sparkles } from 'lucide-react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';

interface ChosenForYouProps {
  currentBlock: ScheduleBlock | null;
}

export function ChosenForYou({ currentBlock }: ChosenForYouProps) {
  if (!currentBlock) return null;

  return (
    <div className="c4u-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Sparkles size={16} color="var(--you-blue-vivid)" />
        <h4 className="you-text-title" style={{ fontSize: '14px', letterSpacing: '0.2px', color: 'var(--you-blue-vivid)' }}>
          Elegido para vos
        </h4>
      </div>

      <p className="you-text-subtitle" style={{ fontSize: '12px', lineHeight: 1.5, marginBottom: '16px', color: 'var(--you-text)' }}>
        {typeof currentBlock.generationReason === 'object' 
          ? JSON.stringify(currentBlock.generationReason) 
          : String(currentBlock.generationReason || 'Introduce este tema antes del bloque siguiente.')}
      </p>

      <div style={{ fontSize: '12px', color: 'var(--you-text-secondary)', marginBottom: '16px' }}>
        {Math.round(currentBlock.durationSec / 60)} min · {currentBlock.topic} · Nivel introductorio
      </div>

      <button className="c4u-btn">
        Ver sugerencia →
      </button>

      <style>{`
        .c4u-card {
          background: var(--you-surface);
          border-radius: var(--you-radius-lg);
          padding: 24px;
          box-shadow: var(--you-shadow);
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .c4u-btn {
          margin-top: auto;
          background: transparent;
          border: 1px solid var(--you-border);
          border-radius: var(--you-radius-lg);
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-blue-vivid);
          cursor: pointer;
          text-align: center;
          transition: 0.2s;
        }

        .c4u-btn:hover {
          background: var(--you-blue-soft);
        }
      `}</style>
    </div>
  );
}
