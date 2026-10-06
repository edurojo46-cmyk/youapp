import React from 'react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { AudioLines } from 'lucide-react';
import { EpistemicBadge } from '../epistemic/EpistemicBadge';
import { ProviderBadge } from '../ui/ProviderBadge';
import { evaluateEpistemicNature } from '../../lib/field/epistemicGuard';

interface SignalBlockCardProps {
  block: ScheduleBlock;
  isCurrent: boolean;
  isPast: boolean;
  entityName?: string;
  onContextClick?: () => void;
}

export function SignalBlockCard({
  block,
  isCurrent,
  isPast,
  entityName = 'Tema',
  onContextClick
}: SignalBlockCardProps) {
  const thumb = block.contentItem.thumbnailUrl || (block.contentItem as any).thumbnail || 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=200&q=80';
  const assessment = evaluateEpistemicNature(block.contentItem, entityName, block.role);

  return (
    <div className={`tl-card ${isCurrent ? 'active' : ''} ${isPast ? 'past' : ''}`}>
      <div 
        className="tl-card-thumb"
        style={{ backgroundImage: `url(${thumb})` }}
      />
      
      <div className="tl-card-content">
        <h5 className="tl-card-title">{block.contentItem.title}</h5>
        <div className="tl-card-meta-row">
          <span className="tl-card-duration">{Math.round(block.durationSec / 60)} min</span>
          <ProviderBadge 
            provider={block.contentItem.provider} 
            publisherName={(block.contentItem as any).publisherName || (block.contentItem as any).publisher_name}
            retrievalSource={block.contentItem.retrievalSource}
            size="xs" 
          />
          <EpistemicBadge 
            nature={assessment.nature} 
            size="sm" 
            onClick={onContextClick}
          />
        </div>
      </div>


      {isCurrent && (
        <div className="tl-card-eq">
          <AudioLines size={16} color="white" />
        </div>
      )}

      <style>{`
        .tl-card {
          width: 240px;
          height: 68px;
          background: var(--you-surface);
          border: 1px solid var(--you-border);
          border-radius: var(--you-radius-sm);
          display: flex;
          align-items: center;
          padding: 6px 8px;
          gap: 10px;
          transition: 0.2s;
          position: relative;
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
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .tl-card-title {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: var(--you-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tl-card-meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tl-card-duration {
          font-size: 11px;
          color: var(--you-text-secondary);
        }

        .tl-card-eq {
          position: absolute;
          top: 6px;
          right: 6px;
        }
      `}</style>
    </div>
  );
}
