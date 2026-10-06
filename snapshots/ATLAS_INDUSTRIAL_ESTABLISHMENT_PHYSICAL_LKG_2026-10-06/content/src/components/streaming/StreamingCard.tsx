import React from 'react';
import { useStreamingStore } from '../../store/useStreamingStore';
import { getProviderInfo } from '../../lib/streaming/providerRegistry';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

interface StreamingCardProps {
  content: UniversalContent;
}

export const StreamingCard: React.FC<StreamingCardProps> = ({ content }) => {
  const { setSelectedContentForDetails, isPlatformEnabled } = useStreamingStore();
  const primaryProv = getProviderInfo(content.primaryProvider);
  const isIncluded = isPlatformEnabled(content.primaryProvider);

  return (
    <div
      className="mp-card"
      onClick={() => setSelectedContentForDetails(content)}
    >
      <div className="mp-card-poster-wrap">
        <img
          src={content.posterUrl}
          alt={content.title}
          className="mp-card-poster"
          loading="lazy"
        />
      </div>

      <div className="mp-card-info">
        <div className="mp-card-title" title={content.title}>{content.title}</div>
        <div className="mp-card-meta">
          {content.year || ''} {content.durationText ? `· ${content.durationText}` : ''}
        </div>
        
        <div className="mp-card-match">
          {content.matchScore || 90}% match
        </div>

        <div className="mp-card-provider">
          <span style={{ color: primaryProv.color }}>●</span>
          <span>{primaryProv.name}</span>
          {isIncluded && (
            <span style={{ color: '#007aff', fontSize: '10px', marginLeft: 'auto' }}>✓</span>
          )}
        </div>
      </div>
    </div>
  );
};
