import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Compass, Flame, Film, Tv } from 'lucide-react';
import { StreamingLayout } from '../../components/streaming/StreamingLayout';
import { StreamingSearch } from '../../components/streaming/StreamingSearch';
import { PlatformFilterPills } from '../../components/streaming/PlatformFilterPills';
import { StreamingCard } from '../../components/streaming/StreamingCard';
import { useStreamingStore } from '../../store/useStreamingStore';
import { streamingRepository } from '../../lib/streaming/streamingRepository';
import type { UniversalContent } from '../../lib/streaming/streamingTypes';

export default function ExplorarStreaming() {
  const {
    userPlatforms,
    activePlatformFilter,
    onlyMyPlatforms,
    searchQuery
  } = useStreamingStore();

  const [catalog, setCatalog] = useState<UniversalContent[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  const GENRES = [
    { code: 'all', label: 'Todos los géneros' },
    { code: 'ciencia ficción', label: 'Ciencia Ficción' },
    { code: 'drama', label: 'Drama' },
    { code: 'acción', label: 'Acción' },
    { code: 'comedia', label: 'Comedia' },
    { code: 'romance', label: 'Romance' },
    { code: 'animación', label: 'Animación' },
    { code: 'crimen', label: 'Crimen & Misterio' }
  ];

  useEffect(() => {
    streamingRepository.searchCatalog({}).then(setCatalog);
  }, []);

  const filteredCatalog = useMemo(() => {
    let list = [...catalog];

    if (onlyMyPlatforms || activePlatformFilter === 'my_platforms') {
      const set = new Set(userPlatforms);
      list = list.filter(item => item.availability.some(a => set.has(a.provider)));
    } else if (activePlatformFilter !== 'all') {
      list = list.filter(item => item.availability.some(a => a.provider === activePlatformFilter));
    }

    if (selectedGenre !== 'all') {
      list = list.filter(item => 
        item.genres.some(g => g.toLowerCase().includes(selectedGenre.toLowerCase()))
      );
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => (
        item.title.toLowerCase().includes(q) ||
        item.genres.some(g => g.toLowerCase().includes(q)) ||
        (item.director && item.director.toLowerCase().includes(q)) ||
        (item.cast && item.cast.some(c => c.toLowerCase().includes(q))) ||
        (item.description && item.description.toLowerCase().includes(q))
      ));
    }

    return list;
  }, [catalog, userPlatforms, activePlatformFilter, onlyMyPlatforms, selectedGenre, searchQuery]);

  const movies = filteredCatalog.filter(c => c.type === 'movie');
  const series = filteredCatalog.filter(c => c.type === 'series');

  return (
    <StreamingLayout showRightPanel={true}>
      <div className="mp-hero-header">
        <h1 className="mp-hero-title">
          Explorá todo el cine y las series,<br />
          <span>sin fronteras de plataforma.</span>
        </h1>
        <p className="mp-hero-subtitle">
          Descubrí qué ver hoy comparando disponibilidad en tiempo real en Argentina.
        </p>

        <StreamingSearch />
      </div>

      {/* Platform Filter Pills */}
      <PlatformFilterPills />

      {/* Genre Pills */}
      <div className="mp-platform-pills" style={{ marginTop: '-14px', marginBottom: '28px' }}>
        {GENRES.map((genre) => (
          <button
            key={genre.code}
            className={`mp-pill ${selectedGenre === genre.code ? 'active' : ''}`}
            onClick={() => setSelectedGenre(genre.code)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {genre.label}
          </button>
        ))}
      </div>

      {/* ── TENDENCIAS Y DESTACADOS ── */}
      <section className="mp-section">
        <div className="mp-section-header">
          <div className="mp-section-title">
            <Flame size={18} color="#007aff" />
            <span>Tendencias en Argentina</span>
            <ChevronRight size={17} />
          </div>
        </div>

        {filteredCatalog.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            No se encontraron títulos para los filtros seleccionados.
          </div>
        ) : (
          <div className="mp-grid-cards">
            {filteredCatalog.slice(0, 6).map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        )}
      </section>

      {/* ── PELÍCULAS ── */}
      {movies.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title">
              <Film size={18} color="#007aff" />
              <span>Películas aclamadas</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-cards">
            {movies.map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── SERIES ── */}
      {series.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title">
              <Tv size={18} color="#007aff" />
              <span>Series para maratonear</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-cards">
            {series.map((item) => (
              <StreamingCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}
    </StreamingLayout>
  );
}
