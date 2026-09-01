import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Search, Compass, Bookmark, Radio, Settings, ChevronRight, ChevronDown,
  Bell, Play, Plus, Check, SlidersHorizontal, Sparkles, ExternalLink, X,
  ShieldCheck, Wand2, BookmarkCheck, RotateCcw, LayoutGrid
} from 'lucide-react';
import { useStreamingStore } from '../store/useStreamingStore';
import {
  FEATURED_HERO,
  RECOMMENDED_TITLES,
  CONTINUE_WATCHING_TITLES,
  ALL_STREAMING_CATALOG,
  searchStreamingCatalog
} from '../lib/streaming/streamingRepository';
import {
  STREAMING_PROVIDERS,
  POPULAR_AR_PROVIDERS,
  getProviderInfo
} from '../lib/streaming/providerRegistry';
import type { UniversalContent } from '../lib/streaming/streamingTypes';
import './MiPlataforma.css';

export default function MiPlataforma() {
  const navigate = useNavigate();
  const {
    userPlatforms,
    togglePlatform,
    isPlatformEnabled,
    activePlatformFilter,
    setActivePlatformFilter,
    searchQuery,
    setSearchQuery,
    onlyMyPlatforms,
    setOnlyMyPlatforms,
    savedLibrary,
    toggleSaveLibrary,
    isInLibrary,
    selectedContentForDetails,
    setSelectedContentForDetails,
    isPlatformsModalOpen,
    setIsPlatformsModalOpen
  } = useStreamingStore();

  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

  // Filtered titles for the "Recomendadas para vos" section
  const displayedRecommendations = useMemo(() => {
    return searchStreamingCatalog(
      searchQuery,
      activePlatformFilter === 'all' ? undefined : activePlatformFilter,
      onlyMyPlatforms,
      userPlatforms
    );
  }, [searchQuery, activePlatformFilter, onlyMyPlatforms, userPlatforms]);

  const handleOpenDetails = (content: UniversalContent) => {
    setSelectedContentForDetails(content);
  };

  const handleLaunchProvider = (url?: string) => {
    if (url && url !== '#') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="mi-plataforma-layout">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
      <aside className="mp-sidebar-left">
        <div>
          <div className="mp-logo">
            <span>YOU</span>
            <span className="mp-logo-badge">APP</span>
          </div>

          <nav>
            <ul className="mp-nav-list">
              <li>
                <button className="mp-nav-item" onClick={() => navigate('/')}>
                  <Home size={18} />
                  <span>Inicio</span>
                </button>
              </li>
              <li>
                <button className="mp-nav-item" onClick={() => navigate('/radar')}>
                  <Search size={18} />
                  <span>Buscar</span>
                </button>
              </li>
              <li>
                <button className="mp-nav-item active" onClick={() => navigate('/explorar')}>
                  <Compass size={18} />
                  <span>Explorar</span>
                </button>
              </li>
              <li>
                <button className="mp-nav-item" onClick={() => navigate('/my-lists')}>
                  <Bookmark size={18} />
                  <span>Mi lista</span>
                </button>
              </li>
              <li>
                <button className="mp-nav-item" onClick={() => navigate('/programar-tv')}>
                  <Radio size={18} />
                  <span>Señal</span>
                </button>
              </li>
              <li>
                <button className="mp-nav-item" onClick={() => navigate('/settings')}>
                  <Settings size={18} />
                  <span>Configuración</span>
                </button>
              </li>
            </ul>
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="mp-user-profile" onClick={() => navigate('/profile')}>
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
            alt="Mariano"
            className="mp-user-avatar"
          />
          <div className="mp-user-info">
            <div className="mp-user-name">Mariano</div>
            <div className="mp-user-sub">
              <span>Ver perfil</span>
              <ChevronDown size={12} />
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────── */}
      <main className="mp-main-content">
        {/* Top Header Bar */}
        <header className="mp-top-bar">
          <button
            className="mp-platforms-btn"
            onClick={() => setIsPlatformsModalOpen(true)}
          >
            <LayoutGrid size={15} color="#2563eb" />
            <span>Mis plataformas</span>
          </button>
          <button className="mp-notification-btn" title="Notificaciones">
            <Bell size={17} />
            <span className="mp-notification-dot"></span>
          </button>
        </header>

        {/* Hero Title & Subtitle */}
        <div className="mp-hero-header">
          <h1 className="mp-hero-title">
            Todo tu entretenimiento,<br />
            <span>en un solo lugar.</span>
          </h1>
          <p className="mp-hero-subtitle">
            Explorá películas y series de todas tus plataformas favoritas.
          </p>

          {/* Search Input Bar */}
          <div className="mp-search-bar">
            <Search size={17} color="#94a3b8" />
            <input
              type="text"
              className="mp-search-input"
              placeholder="Buscar por título, actor, género o director..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <SlidersHorizontal
              size={17}
              className="mp-search-filter-icon"
              onClick={() => setIsPlatformsModalOpen(true)}
            />
          </div>
        </div>

        {/* ── FEATURED HERO CARD (Interstellar) ─────────────────── */}
        <div className="mp-featured-card">
          <div className="mp-featured-visual">
            <span className="mp-featured-badge">DESTACADA</span>
            <img
              src={FEATURED_HERO.backdropUrl}
              alt={FEATURED_HERO.title}
              className="mp-featured-img"
            />
            <div className="mp-featured-overlay"></div>
          </div>

          <div className="mp-featured-details">
            <h2 className="mp-featured-heading">{FEATURED_HERO.title}</h2>
            <div className="mp-featured-meta">
              {FEATURED_HERO.year} · {FEATURED_HERO.durationText} · {FEATURED_HERO.genres.join(', ')}
            </div>
            <div className="mp-featured-match">
              {FEATURED_HERO.matchScore}% para vos
            </div>
            <p className="mp-featured-desc">
              {FEATURED_HERO.description}
            </p>

            <div className="mp-featured-actions">
              <button
                className="mp-btn-primary"
                onClick={() => handleOpenDetails(FEATURED_HERO)}
              >
                <Play size={15} fill="#ffffff" />
                <span>Ver ahora</span>
              </button>
              <button
                className="mp-btn-secondary"
                onClick={() => toggleSaveLibrary(FEATURED_HERO)}
              >
                {isInLibrary(FEATURED_HERO.id) ? (
                  <>
                    <Check size={15} color="#2563eb" />
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

        {/* Carousel Pagination Dots */}
        <div className="mp-carousel-dots">
          <span className={`mp-dot ${activeHeroIndex === 0 ? 'active' : ''}`} onClick={() => setActiveHeroIndex(0)}></span>
          <span className={`mp-dot ${activeHeroIndex === 1 ? 'active' : ''}`} onClick={() => setActiveHeroIndex(1)}></span>
          <span className={`mp-dot ${activeHeroIndex === 2 ? 'active' : ''}`} onClick={() => setActiveHeroIndex(2)}></span>
          <span className={`mp-dot ${activeHeroIndex === 3 ? 'active' : ''}`} onClick={() => setActiveHeroIndex(3)}></span>
          <span className={`mp-dot ${activeHeroIndex === 4 ? 'active' : ''}`} onClick={() => setActiveHeroIndex(4)}></span>
        </div>

        {/* ── PLATFORM FILTER PILLS ─────────────────────────────── */}
        <div className="mp-platform-pills">
          <button
            className={`mp-pill ${activePlatformFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('all')}
          >
            Todas
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'netflix' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('netflix')}
          >
            Netflix
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'prime_video' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('prime_video')}
          >
            Prime Video
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'disney_plus' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('disney_plus')}
          >
            Disney+
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'max' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('max')}
          >
            Max
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'apple_tv_plus' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('apple_tv_plus')}
          >
            Apple TV+
          </button>
          <button
            className={`mp-pill ${activePlatformFilter === 'paramount_plus' ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter('paramount_plus')}
          >
            Paramount+
          </button>
          <button
            className="mp-pill"
            onClick={() => setIsPlatformsModalOpen(true)}
          >
            Más ▾
          </button>
        </div>

        {/* ── SECTION: RECOMENDADAS PARA VOS ────────────────────── */}
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title" onClick={() => {}}>
              <span>Recomendadas para vos</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-cards">
            {displayedRecommendations.slice(0, 6).map((item) => {
              const primaryProv = getProviderInfo(item.primaryProvider);
              return (
                <div
                  key={item.id}
                  className="mp-card"
                  onClick={() => handleOpenDetails(item)}
                >
                  <div className="mp-card-poster-wrap">
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="mp-card-poster"
                      loading="lazy"
                    />
                  </div>
                  <div className="mp-card-info">
                    <div className="mp-card-title">{item.title}</div>
                    <div className="mp-card-meta">
                      {item.year || ''} {item.durationText ? `· ${item.durationText}` : ''}
                    </div>
                    <div className="mp-card-match">
                      {item.matchScore || 90}% match
                    </div>
                    <div className="mp-card-provider">
                      <span style={{ color: primaryProv.color }}>●</span>
                      <span>{primaryProv.name}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECTION: CONTINUAR VIENDO ─────────────────────────── */}
        <section className="mp-section">
          <div className="mp-section-header">
            <div className="mp-section-title" onClick={() => {}}>
              <span>Continuar viendo</span>
              <ChevronRight size={17} />
            </div>
          </div>

          <div className="mp-grid-continue">
            {CONTINUE_WATCHING_TITLES.map((item) => {
              const primaryProv = getProviderInfo(item.primaryProvider);
              return (
                <div
                  key={item.id}
                  className="mp-continue-card"
                  onClick={() => handleOpenDetails(item)}
                >
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="mp-continue-thumb"
                  />
                  <div className="mp-continue-details">
                    <div className="mp-continue-title">{item.title}</div>
                    <div className="mp-continue-sub">
                      {item.currentSeasonEpisode || item.remainingText || item.durationText}
                    </div>
                    <div className="mp-continue-provider">
                      <span style={{ color: primaryProv.color }}>●</span>
                      <span>{primaryProv.name}</span>
                    </div>
                    <div className="mp-continue-progress-bg">
                      <div
                        className="mp-continue-progress-fill"
                        style={{ width: `${item.progressPercent || 50}%` }}
                      ></div>
                    </div>
                  </div>
                  <button
                    className="mp-play-circle-btn"
                    title="Continuar reproducción"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = item.availability[0]?.webUrl;
                      handleLaunchProvider(url);
                    }}
                  >
                    <Play size={14} fill="#2563eb" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Learning Banner */}
        <div className="mp-learning-banner">
          <Sparkles size={16} color="#2563eb" />
          <span>YouApp aprende de vos para que siempre encuentres algo increíble para ver.</span>
        </div>
      </main>

      {/* ── RIGHT SIDEBAR ("Tu experiencia, unificada") ──────────── */}
      <aside className="mp-sidebar-right">
        <div className="mp-unified-card">
          <h3 className="mp-unified-title">Tu experiencia, unificada</h3>

          {/* Feature 1: Búsqueda única */}
          <div className="mp-feature-item">
            <div className="mp-feature-icon">
              <Search size={15} />
            </div>
            <div className="mp-feature-text">
              <div className="mp-feature-heading">Búsqueda única</div>
              <p className="mp-feature-desc">
                Encontrá títulos en todas tus plataformas desde un solo lugar.
              </p>
            </div>
          </div>

          {/* Feature 2: ¿Dónde verlo? */}
          <div className="mp-feature-item">
            <div className="mp-feature-icon">
              <ShieldCheck size={15} />
            </div>
            <div className="mp-feature-text">
              <div className="mp-feature-heading">¿Dónde verlo?</div>
              <p className="mp-feature-desc">
                Comparamos y te mostramos dónde está disponible.
              </p>
            </div>
          </div>

          {/* Feature 3: Recomendaciones personales */}
          <div className="mp-feature-item">
            <div className="mp-feature-icon">
              <Wand2 size={15} />
            </div>
            <div className="mp-feature-text">
              <div className="mp-feature-heading">Recomendaciones personales</div>
              <p className="mp-feature-desc">
                Sugerencias inteligentes basadas en tu gusto y tu historial.
              </p>
            </div>
          </div>

          {/* Feature 4: Agregá a tu señal */}
          <div className="mp-feature-item">
            <div className="mp-feature-icon">
              <BookmarkCheck size={15} />
            </div>
            <div className="mp-feature-text">
              <div className="mp-feature-heading">Agregá a tu señal</div>
              <p className="mp-feature-desc">
                Guardá lo que te interesa y recibí recordatorios personalizados.
              </p>
            </div>
          </div>

          {/* Feature 5: Continuá donde dejaste */}
          <div className="mp-feature-item">
            <div className="mp-feature-icon">
              <RotateCcw size={15} />
            </div>
            <div className="mp-feature-text">
              <div className="mp-feature-heading">Continuá donde dejaste</div>
              <p className="mp-feature-desc">
                Retomá tus series y películas en cualquier plataforma.
              </p>
            </div>
          </div>
        </div>

        <button
          className="mp-smart-suggestions-btn"
          onClick={() => navigate('/my-algorithm')}
        >
          <Sparkles size={16} />
          <span>Sugerencias inteligentes</span>
        </button>
      </aside>

      {/* ── MODAL: MIS PLATAFORMAS ──────────────────────────────── */}
      {isPlatformsModalOpen && (
        <div
          className="mp-modal-backdrop"
          onClick={() => setIsPlatformsModalOpen(false)}
        >
          <div
            className="mp-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mp-modal-header">
              <h3 className="mp-modal-title">Mis Plataformas</h3>
              <button
                className="mp-modal-close"
                onClick={() => setIsPlatformsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13.5px', color: '#64748b', marginBottom: '20px' }}>
              Seleccioná los servicios que ya tenés contratados. YouApp priorizará películas y series incluidas en tus suscripciones en Argentina para que no tengas que pagar de más.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {POPULAR_AR_PROVIDERS.map((prov) => {
                const active = isPlatformEnabled(prov.code);
                return (
                  <div
                    key={prov.code}
                    onClick={() => togglePlatform(prov.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      border: `1px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                      background: active ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '18px' }}>
                        {prov.code === 'netflix' ? '🔴' : prov.code === 'prime_video' ? '🔵' : prov.code === 'disney_plus' ? '🔷' : prov.code === 'max' ? '🟣' : prov.code === 'apple_tv_plus' ? '⚫' : '⭐'}
                      </span>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {prov.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Disponible en Argentina (AR)
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: active ? '#2563eb' : '#f1f5f9',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800
                      }}
                    >
                      {active && <Check size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="mp-btn-primary"
                onClick={() => setIsPlatformsModalOpen(false)}
              >
                Guardar preferencias
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DÓNDE VERLA EN ARGENTINA ─────────────────────── */}
      {selectedContentForDetails && (
        <div
          className="mp-modal-backdrop"
          onClick={() => setSelectedContentForDetails(null)}
        >
          <div
            className="mp-modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px' }}
          >
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 className="mp-modal-title">{selectedContentForDetails.title}</h3>
                <span
                  style={{
                    background: '#eff6ff',
                    color: '#2563eb',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  {selectedContentForDetails.matchScore || 95}% match
                </span>
              </div>
              <button
                className="mp-modal-close"
                onClick={() => setSelectedContentForDetails(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <img
                src={selectedContentForDetails.posterUrl}
                alt={selectedContentForDetails.title}
                style={{
                  width: '120px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                  {selectedContentForDetails.year} · {selectedContentForDetails.durationText || `${selectedContentForDetails.durationMin} min`} · {selectedContentForDetails.genres.join(', ')}
                </div>
                {selectedContentForDetails.director && (
                  <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '4px' }}>
                    <strong>Director:</strong> {selectedContentForDetails.director}
                  </div>
                )}
                {selectedContentForDetails.cast && (
                  <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '8px' }}>
                    <strong>Elenco:</strong> {selectedContentForDetails.cast.join(', ')}
                  </div>
                )}
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                  {selectedContentForDetails.description}
                </p>
              </div>
            </div>

            {/* Dónde verla en Argentina */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>
                Dónde verla en Argentina 🇦🇷
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {selectedContentForDetails.availability.map((avail, idx) => {
                  const isUserSubscribed = isPlatformEnabled(avail.provider);
                  const prov = getProviderInfo(avail.provider);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: isUserSubscribed ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${isUserSubscribed ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '18px' }}>
                          {isUserSubscribed ? '✓' : '○'}
                        </span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                            {prov.name}
                          </div>
                          <div style={{ fontSize: '11px', color: isUserSubscribed ? '#2563eb' : '#64748b', fontWeight: isUserSubscribed ? 700 : 500 }}>
                            {isUserSubscribed ? '✓ Incluida con tu suscripción' : avail.accessLabel || (avail.access === 'subscription' ? 'Suscripción requerida' : avail.access)}
                          </div>
                        </div>
                      </div>

                      <button
                        className="mp-btn-primary"
                        style={{ padding: '8px 14px', fontSize: '12px' }}
                        onClick={() => handleLaunchProvider(avail.webUrl)}
                      >
                        <ExternalLink size={13} />
                        <span>Abrir en {prov.name}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  className="mp-btn-secondary"
                  onClick={() => toggleSaveLibrary(selectedContentForDetails)}
                >
                  {isInLibrary(selectedContentForDetails.id) ? (
                    <>
                      <Check size={14} color="#2563eb" />
                      <span>En mi lista</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>Guardar en mi lista</span>
                    </>
                  )}
                </button>

                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Datos verificados para Argentina · Powered by YouApp Brain
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
