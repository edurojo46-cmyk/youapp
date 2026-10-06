import React, { useState } from 'react';
import { Play, Plus, Check } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';
import { getProviderInfo } from '../../lib/streaming/providerRegistry';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

interface FeaturedHeroProps {
  content: UniversalContent;
}

export const FeaturedHero: React.FC<FeaturedHeroProps> = ({ content }) => {
  const { toggleSaveLibrary, isInLibrary, setSelectedContentForDetails, isPlatformEnabled } = useStreamingStore();
  const [activeDot, setActiveDot] = useState(0);

  const primaryProv = getProviderInfo(content.primaryProvider);
  const isAvailableInMyPlatforms = isPlatformEnabled(content.primaryProvider);

  return (
    <div>
      <div className="mp-featured-card">
        <div className="mp-featured-visual">
          <span className="mp-featured-badge">DESTACADA</span>
          <img
            src={content.backdropUrl || content.posterUrl}
            alt={content.title}
            className="mp-featured-img"
          />
          <div className="mp-featured-overlay"></div>
        </div>

        <div className="mp-featured-details">
          <h2 className="mp-featured-heading">{content.title}</h2>
          <div className="mp-featured-meta">
            {content.year} · {content.durationText} · {content.genres.join(', ')}
          </div>
          
          <div className="mp-featured-match">
            <span style={{ color: '#007aff', fontWeight: 800 }}>Alta afinidad</span>
            <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '8px', fontSize: '12px' }}>
              · Disponible en {primaryProv.name} {isAvailableInMyPlatforms ? '✓' : ''}
            </span>
          </div>

          <p className="mp-featured-desc">
            {content.description}
          </p>

          <div className="mp-featured-actions">
            <button
              className="mp-btn-primary"
              onClick={() => setSelectedContentForDetails(content)}
            >
              <Play size={15} fill="#ffffff" />
              <span>Ver ahora</span>
            </button>
            <button
              className="mp-btn-secondary"
              onClick={() => toggleSaveLibrary(content)}
            >
              {isInLibrary(content.id) ? (
                <>
                  <Check size={15} color="#007aff" />
                  <span>En mi lista</span>
                </>
              ) : (
                <>
                  <Plus size={15} />
                  <span>Mi lista</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mp-carousel-dots">
        <span className={`mp-dot ${activeDot === 0 ? 'active' : ''}`} onClick={() => setActiveDot(0)}></span>
        <span className={`mp-dot ${activeDot === 1 ? 'active' : ''}`} onClick={() => setActiveDot(1)}></span>
        <span className={`mp-dot ${activeDot === 2 ? 'active' : ''}`} onClick={() => setActiveDot(2)}></span>
        <span className={`mp-dot ${activeDot === 3 ? 'active' : ''}`} onClick={() => setActiveDot(3)}></span>
      </div>
    </div>
  );
};
