import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Sparkles, Bookmark } from 'lucide-react';
import { StreamingLayout } from '../../components/streaming/StreamingLayout';
import { StreamingSearch } from '../../components/streaming/StreamingSearch';
import { FeaturedHero } from '../../components/streaming/FeaturedHero';
import { PlatformFilterPills } from '../../components/streaming/PlatformFilterPills';
import { StreamingCard } from '../../components/streaming/StreamingCard';
import { ContinueCard } from '../../components/streaming/ContinueCard';
import { useStreamingStore } from '../../store/useStreamingStore';
import { streamingRepository } from '../../lib/streaming/streamingRepository';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

export default function MiPlataforma() {
  const {
    userPlatforms,
    activePlatformFilter,
    onlyMyPlatforms,
    searchQuery,
    savedLibrary
  } = useStreamingStore();

  const [featured, setFeatured] = useState<UniversalContent | null>(null);
  const [recommended, setRecommended] = useState<UniversalContent[]>([]);
  const [continueWatching, setContinueWatching] = useState<UniversalContent[]>([]);

  useEffect(() => {
    streamingRepository.getFeaturedTitle().then(setFeatured);
    streamingRepository.getRecommendedTitles(userPlatforms).then(setRecommended);
    streamingRepository.getContinueWatching().then(setContinueWatching);
  }, [userPlatforms]);

  // Filtered titles based on active filters and search
  const filteredRecommendations = useMemo(() => {
    let list = [...recommended];

    if (onlyMyPlatforms || activePlatformFilter === 'my_platforms') {
      const set = new Set(userPlatforms);
      list = list.filter(item => item.availability.some(a => set.has(a.provider)));
    } else if (activePlatformFilter !== 'all') {
      list = list.filter(item => item.availability.some(a => a.provider === activePlatformFilter));
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => (
        item.title.toLowerCase().includes(q) ||
        item.genres.some(g => g.toLowerCase().includes(q)) ||
        (item.director && item.director.toLowerCase().includes(q)) ||
        (item.cast && item.cast.some(c => c.toLowerCase().includes(q)))
      ));
    }

    return list;
  }, [recommended, userPlatforms, activePlatformFilter, onlyMyPlatforms, searchQuery]);

  return (
    <StreamingLayout showRightPanel={true}>
      {/* Hero Header */}
      <div className="mp-hero-header">
        <h1 className="mp-hero-title">
          Todo tu entretenimiento,<br />
          <span>en un solo lugar.</span>
        </h1>
        <p className="mp-hero-subtitle">
          Explorá películas y series de todas tus plataformas favoritas.
        </p>

        {/* Search with natural language support */}
        <StreamingSearch />
      </div>

      {/* Hero Featured Title */}
      {featured && <FeaturedHero content={featured} />}

      {/* Platform Filter Pills */}
      <PlatformFilterPills />

      {/* ── SECCIÓN 1: RECOMENDADAS PARA VOS ─────────────────────── */}
      <section className="mp-section">
        <div className="mp-section-header">
          <div className="mp-section-title">
            <span>Recomendadas para vos</span>
            <ChevronRight size={17} />
          </div>
        </div>

        {filteredRecommendations.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            No encontramos títulos con los filtros seleccionados. Probá seleccionar "Todas" o configurar tus plataformas.
          </div>
        ) : (
          <div className="mp-grid-cards">
            {filteredRecommendations.slice(0, 6).map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        )}
      </section>

      {/* ── SECCIÓN 2: CONTINUAR VIENDO ───────────────────────────── */}
      {continueWatching.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title">
              <span>Continuar viendo</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-continue">
            {continueWatching.slice(0, 4).map((item) => (
              <ContinueCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── SECCIÓN 3: MI LISTA (Si tiene títulos guardados) ──────── */}
      {savedLibrary.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title">
              <Bookmark size={18} color="#007aff" />
              <span>Mi Lista Universal ({savedLibrary.length})</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-cards">
            {savedLibrary.slice(0, 6).map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}

      {/* Bottom Learning Callout Banner */}
      <div className="mp-learning-banner">
        <Sparkles size={16} color="#007aff" />
        <span>YouApp aprende de vos para que siempre encuentres algo increíble para ver.</span>
      </div>
    </StreamingLayout>
  );
}
