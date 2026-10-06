import React from 'react';
import { Play } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';
import { getProviderInfo } from '../../lib/streaming/providerRegistry';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

interface ContinueCardProps {
  content: UniversalContent;
}

export const ContinueCard: React.FC<ContinueCardProps> = ({ content }) => {
  const { setSelectedContentForDetails, logStreamingActivity } = useStreamingStore();
  const primaryProv = getProviderInfo(content.primaryProvider);

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    logStreamingActivity(content);
    const targetUrl = content.availability[0]?.webUrl;
    if (targetUrl && targetUrl !== '#') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      setSelectedContentForDetails(content);
    }
  };

  const hasRealProgress = content.playbackMode === 'youapp_player' && typeof content.progressPercent === 'number';

  return (
    <div
      className="mp-continue-card"
      onClick={() => setSelectedContentForDetails(content)}
    >
      <img
        src={content.posterUrl}
        alt={content.title}
        className="mp-continue-thumb"
      />

      <div className="mp-continue-details">
        <div className="mp-continue-title" title={content.title}>{content.title}</div>
        <div className="mp-continue-sub">
          {content.currentSeasonEpisode || content.remainingText || 'Abriste recientemente'}
        </div>

        <div className="mp-continue-provider">
          <span style={{ color: primaryProv.color }}>●</span>
          <span>{primaryProv.name}</span>
        </div>

        {hasRealProgress ? (
          <div className="mp-continue-progress-bg">
            <div
              className="mp-continue-progress-fill"
              style={{ width: `${content.progressPercent}%` }}
            ></div>
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
            Continuar en {primaryProv.name}
          </div>
        )}
      </div>

      <button
        className="mp-play-circle-btn"
        title={`Abrir en ${primaryProv.name}`}
        onClick={handleResume}
      >
        <Play size={13} fill="#007aff" />
      </button>
    </div>
  );
};
