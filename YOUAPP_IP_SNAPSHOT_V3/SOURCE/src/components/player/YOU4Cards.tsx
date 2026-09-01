import React from 'react';
import type { VideoMoment } from '../../lib/moments/momentTypes';
import { Maximize2, Info } from 'lucide-react';

interface YOU4CardsProps {
  moments: VideoMoment[];
  onMomentClick: (moment: VideoMoment, index: number) => void;
  activeMomentId?: string;
  thumbnailFallbackUrl?: string;
  onOpenMosaic?: () => void;
}

export function YOU4Cards({ moments, onMomentClick, activeMomentId, thumbnailFallbackUrl, onOpenMosaic }: YOU4CardsProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!moments || moments.length === 0) return null;

  return (
    <div className="you4-main-card">
      <div className="you4-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ color: 'var(--you-blue-vivid)', margin: 0, fontSize: '20px', fontWeight: 800 }}>YOU4</h2>
          <span style={{ color: 'var(--you-text-secondary)', fontSize: '13px', fontWeight: 500 }}>4 momentos clave en 1 vistazo</span>
        </div>
        <div style={{ color: 'var(--you-text-tertiary)', border: '1px solid var(--you-border)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Info size={12} />
        </div>
      </div>

      <div className="you4-cards-container">
        {moments.map((m, idx) => {
          const isActive = activeMomentId === m.id;
          return (
            <div 
              key={m.id} 
              className={`you4-item ${isActive ? 'active' : ''}`}
              style={{ backgroundImage: `url(${thumbnailFallbackUrl || 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=600&auto=format&fit=crop'})` }}
              onClick={() => onMomentClick(m, idx)}
            >
              <div className="you4-badge">{idx + 1}</div>
              <div className="you4-overlay">
                <h4 className="you4-title">{m.title}</h4>
                <div className="you4-times">
                  <span>{formatTime(m.startSec)}</span>
                  <span>{formatTime(m.endSec)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="you4-footer">
        <span style={{ fontSize: '12px', color: 'var(--you-text-secondary)', fontWeight: 500 }}>Saltá a cualquier momento del video</span>
        <button className="you4-btn-full" onClick={onOpenMosaic}>
          Ver Mosaico <Maximize2 size={12} />
        </button>
      </div>

      <style>{`
        .you4-main-card {
          background: var(--you-surface);
          border-radius: var(--you-radius-lg);
          padding: 24px;
          box-shadow: var(--you-shadow);
        }

        .you4-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .you4-cards-container {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        .you4-item {
          position: relative;
          aspect-ratio: 16/9;
          background-size: cover;
          background-position: center;
          border-radius: var(--you-radius-md);
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          transition: var(--you-transition);
        }

        .you4-item.active {
          border-color: var(--you-blue-vivid);
          box-shadow: 0 4px 16px rgba(49, 130, 206, 0.4);
        }

        .you4-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .you4-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--you-blue-vivid);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          color: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 2;
        }

        .you4-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.8) 100%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 12px;
          z-index: 1;
        }

        .you4-title {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }

        .you4-times {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255,255,255,0.7);
          font-weight: 600;
        }

        .you4-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 16px;
          border-top: 1px solid var(--you-border);
        }

        .you4-btn-full {
          background: transparent;
          border: 1px solid var(--you-border);
          border-radius: var(--you-radius-sm);
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-text);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: 0.2s;
        }

        .you4-btn-full:hover {
          background: var(--you-bg);
        }
      `}</style>
    </div>
  );
}
