import React from 'react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { AudioLines } from 'lucide-react';

interface SignalBlockCardProps {
  block: ScheduleBlock;
  isCurrent: boolean;
  isPast: boolean;
}

export function SignalBlockCard({
  block,
  isCurrent,
  isPast
}: SignalBlockCardProps) {
  const thumb = block.contentItem.thumbnailUrl || (block.contentItem as any).thumbnail || 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=200&q=80';

  return (
    <div className={`tl-card ${isCurrent ? 'active' : ''} ${isPast ? 'past' : ''}`}>
      <div 
        className="tl-card-thumb"
        style={{ backgroundImage: `url(${thumb})` }}
      />
      
      <div className="tl-card-content">
        <h5 className="tl-card-title">{block.contentItem.title}</h5>
        <div className="tl-card-meta">
          {Math.round(block.durationSec / 60)} min
        </div>
      </div>

      {isCurrent && (
        <div className="tl-card-eq">
          <AudioLines size={16} color="white" />
        </div>
      )}

      <style>{`
        .tl-card {
          width: 220px;
          height: 64px;
          background: var(--you-surface);
          border: 1px solid var(--you-border);
          border-radius: var(--you-radius-sm);
          display: flex;
          align-items: center;
          padding: 6px;
          gap: 12px;
          transition: 0.2s;
        }

        .tl-card:hover {
          background: var(--you-bg);
        }

        .tl-card.active {
          background: var(--you-blue-vivid);
          border-color: var(--you-blue-vivid);
          box-shadow: 0 4px 12px rgba(49, 130, 206, 0.3);
        }

        .tl-card.past {
          opacity: 0.6;
          filter: grayscale(1);
        }

        .tl-card-thumb {
          width: 52px;
          height: 52px;
          border-radius: 6px;
          background-size: cover;
          background-position: center;
          flex-shrink: 0;
        }

        .tl-card-content {
          flex: 1;
          min-width: 0;
        }

        .tl-card-title {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 600;
          color: var(--you-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tl-card-meta {
          font-size: 11px;
          color: var(--you-text-secondary);
        }

        .you-block-eq {
          position: absolute;
          top: 16px;
          right: 16px;
          display: flex;
          gap: 2px;
          height: 12px;
          align-items: flex-end;
        }
        .you-block-eq span {
          width: 3px;
          background: var(--you-blue);
          border-radius: 2px;
          animation: eq 1.2s ease-in-out infinite;
        }
        .you-block-eq span:nth-child(2) { animation-delay: 0.2s; }
        .you-block-eq span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes eq {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }
      `}</style>
    </div>
  );
}
