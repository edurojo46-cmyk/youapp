import React from 'react';
import { Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';

export const StreamingSearch: React.FC = () => {
  const { searchQuery, setSearchQuery, setIsPlatformsModalOpen } = useStreamingStore();

  const QUICK_PROMPTS = [
    'Una película inteligente de menos de dos horas',
    'Algo divertido para cenar',
    'Una serie corta'
  ];

  return (
    <div className="mp-search-container" style={{ marginBottom: '24px' }}>
      <div className="mp-search-bar">
        <Search size={17} color="#94a3b8" />
        <input
          type="text"
          className="mp-search-input"
          placeholder="Buscá un título o decime qué querés ver..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <SlidersHorizontal
          size={17}
          className="mp-search-filter-icon"
          title="Configurar mis plataformas"
          onClick={() => setIsPlatformsModalOpen(true)}
        />
      </div>

      {/* Quick Intent Prompts */}
      {!searchQuery && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '-16px', marginBottom: '20px' }}>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setSearchQuery(prompt)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '11.5px',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={11} color="#007aff" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
