import React from 'react';
import { Armchair, Mic, AudioLines } from 'lucide-react';

interface DirectorCardProps {
  onRemove: () => void;
  onSurprise: () => void;
}

export function DirectorCard({ onRemove, onSurprise }: DirectorCardProps) {
  return (
    <div className="dir-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Armchair size={16} color="var(--you-blue-vivid)" />
        <h4 className="you-text-title" style={{ fontSize: '14px', letterSpacing: '0.2px', color: 'var(--you-blue-vivid)' }}>
          Director
        </h4>
      </div>
      
      <div style={{ fontSize: '12px', color: 'var(--you-text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
        Tu asistente inteligente
      </div>

      <div className="dir-mic-container">
        <div className="dir-mic-btn">
          <AudioLines size={24} color="white" />
        </div>
      </div>

      <button className="dir-btn">
        Hablá con Director
      </button>

      <style>{`
        .dir-card {
          background: var(--you-surface);
          border-radius: var(--you-radius-lg);
          padding: 24px;
          box-shadow: var(--you-shadow);
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .dir-mic-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }

        .dir-mic-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--you-blue-vivid);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(49, 130, 206, 0.4);
          cursor: pointer;
          transition: 0.2s;
        }

        .dir-mic-btn:hover {
          transform: scale(1.05);
        }

        .dir-btn {
          margin-top: auto;
          background: var(--you-blue-soft);
          border: none;
          border-radius: var(--you-radius-lg);
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-blue-vivid);
          cursor: pointer;
          text-align: center;
          width: 100%;
          transition: 0.2s;
        }

        .dir-btn:hover {
          background: #dbeafe;
        }
      `}</style>
    </div>
  );
}
