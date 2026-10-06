import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AtlasLocalMiComunidad.css';

interface OfferCardData {
  id: string;
  badge: { text: string; type: 'green' | 'blue' };
  image: string;
  categoryIcon: string;
  commerceName: string;
  organizationId: string;
  title: string;
  description: string;
  tag: { text: string; type: 'red' | 'orange' };
  time: string;
}

const DEFAULT_OFFERS: OfferCardData[] = [
  {
    id: 'mock-1-asado',
    badge: { text: 'Oferta nueva', type: 'green' },
    image: '/assets/caballito/asado.jpg',
    categoryIcon: '🏪',
    commerceName: 'Carnicería Don José',
    organizationId: 'org-carniceria-don-jose',
    title: '20% en asado hoy',
    description: 'Los mejores cortes, calidad de siempre en Caballito.',
    tag: { text: '🏷️ 20% OFF', type: 'red' },
    time: 'Hoy'
  },
  {
    id: 'mock-2-medialunas',
    badge: { text: 'Novedad', type: 'blue' },
    image: '/assets/caballito/medialunas.jpg',
    categoryIcon: '🥐',
    commerceName: 'Panadería Caballito',
    organizationId: 'org-panaderia-caballito',
    title: 'Promo medialunas + café',
    description: 'Medialunas artesanales con café a precio especial.',
    tag: { text: '🏷️ 2x1', type: 'orange' },
    time: 'Hasta el 15/03'
  },
  {
    id: 'mock-3-verduras',
    badge: { text: 'Oferta nueva', type: 'green' },
    image: '/assets/caballito/verduras.jpg',
    categoryIcon: '🥬',
    commerceName: 'Verdulería Plaza',
    organizationId: 'org-verduleria-plaza',
    title: 'Canasta fresca del día',
    description: 'Frutas y verduras de estación directo del productor.',
    tag: { text: '🏷️ 15% OFF', type: 'red' },
    time: 'Hoy'
  },
  {
    id: 'mock-4-ravioles',
    badge: { text: 'Destacado', type: 'blue' },
    image: '/assets/caballito/ravioles.jpg',
    categoryIcon: '🍝',
    commerceName: 'Pastas La Nonna',
    organizationId: 'org-pastas-la-nonna',
    title: 'Ravioles caseros con descuento',
    description: 'El sabor de siempre, ahora más cerca tuyo.',
    tag: { text: '🏷️ 20% OFF', type: 'red' },
    time: 'Hasta el 20/03'
  }
];

const FOLLOWED_BUSINESSES = [
  { id: 'org-carniceria-don-jose', name: 'Carnicería Don José', category: 'Carnicería', image: '/assets/caballito/asado.jpg' },
  { id: 'org-panaderia-caballito', name: 'Panadería Caballito', category: 'Panadería', image: '/assets/caballito/medialunas.jpg' },
  { id: 'org-verduleria-plaza', name: 'Verdulería Plaza', category: 'Alimentos', image: '/assets/caballito/verduras.jpg' },
  { id: 'org-pastas-la-nonna', name: 'Pastas La Nonna', category: 'Gastronomía', image: '/assets/caballito/ravioles.jpg' },
  { id: 'org-ferreteria-el-martillo', name: 'Ferretería El Martillo', category: 'Ferretería', image: '/assets/caballito/ferreteria.jpg' }
];

const SUGGESTIONS = [
  {
    id: 'sug-cafe-barrio',
    name: 'Café de Barrio',
    category: 'Cafetería • Caballito',
    image: '/assets/caballito/cafe.jpg',
    badge: { text: '🍃 Recomendado para vos', class: 'amc-tag--green' },
    orgId: 'org-cafe-barrio'
  },
  {
    id: 'sug-ferreteria-martillo',
    name: 'Ferretería El Martillo',
    category: 'Ferretería • Caballito',
    image: '/assets/caballito/ferreteria.jpg',
    badge: { text: '👥 Popular en tu barrio', class: 'amc-tag--blue' },
    orgId: 'org-ferreteria-el-martillo'
  },
  {
    id: 'sug-cava-caballito',
    name: 'La Cava de Caballito',
    category: 'Vinoteca • Caballito',
    image: '/assets/caballito/vinoteca.jpg',
    badge: { text: '✨ Nuevo en la comunidad', class: 'amc-tag--purple' },
    orgId: 'org-la-cava-caballito'
  }
];

export const AtlasLocalMiComunidad: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [savedOffers, setSavedOffers] = useState<Set<string>>(new Set());
  const [savedSuggestions, setSavedSuggestions] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const toggleSaveOffer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSavedOffers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast('Oferta removida de guardadas');
      } else {
        next.add(id);
        showToast('❤️ Oferta guardada en Mi Base');
      }
      return next;
    });
  };

  const toggleSaveSuggestion = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSavedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast(`Dejaste de seguir a ${name}`);
      } else {
        next.add(id);
        showToast(`❤️ ¡Siguiendo a ${name}!`);
      }
      return next;
    });
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'Mi Comunidad en Caballito - Buscador Industrial',
        text: 'Novedades, ofertas y comercios de Caballito en un solo lugar',
        url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      showToast('🔗 ¡Enlace copiado al portapapeles!');
    }
  };

  return (
    <div className="amc-page-wrapper">
      <div className="amc-app-canvas">
        {/* ==================================================================
            TOP NAVIGATION BAR (IDENTICAL TO MOCKUP)
            ================================================================== */}
        <header className="amc-top-bar">
          <div className="amc-top-bar-inner">
            {/* Left: Logo & Neighborhood Pill */}
            <div className="amc-top-left">
              <Link to="/buscaindustrial" className="amc-logo-link" title="Buscador Industrial">
                <svg className="amc-logo-icon" viewBox="0 0 40 40" fill="none">
                  <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0f172a" />
                  <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill="#2563eb" />
                  <polygon points="20,13 26,16.5 26,23.5 20,27 14,23.5 14,16.5" fill="white" opacity="0.95" />
                </svg>
                <span className="amc-logo-text">Buscador Industrial</span>
              </Link>

              <button
                type="button"
                className="amc-location-pill"
                onClick={() => navigate('/local/caballito')}
                title="Cambiar barrio o ver mapa"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Caballito</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>

            {/* Center: Search input */}
            <div className="amc-top-center">
              <div className="amc-search-box">
                <svg className="amc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  className="amc-search-input"
                  placeholder="Buscar comercios, ofertas, categorías..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Right: Navigation Links */}
            <div className="amc-top-right">
              <ul className="amc-nav-items">
                <li>
                  <Link to="/buscaindustrial" className="amc-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Inicio</span>
                  </Link>
                </li>

                <li>
                  <Link to="/productos" className="amc-nav-btn" id="amc-nav-catalogo">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                      <path d="M6 6h10" />
                      <path d="M6 10h10" />
                    </svg>
                    <span>Catálogo</span>
                  </Link>
                </li>

                <li>
                  <Link to="/local/mi-barrio" className="amc-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                      <path d="M2 7h20" />
                    </svg>
                    <span>Mi Barrio</span>
                  </Link>
                </li>

                <li>
                  <Link to="/local/mi-comunidad" className="amc-nav-btn amc-nav-btn--active">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>Mi Comunidad</span>
                  </Link>
                </li>

                <li>
                  <Link to="/mi-base" className="amc-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                    </svg>
                    <span>Mi Base</span>
                  </Link>
                </li>
              </ul>

              {/* Profile Avatar / Menu */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="amc-user-menu-btn"
                  onClick={() => setIsAccountOpen(!isAccountOpen)}
                >
                  <img
                    src="/assets/caballito/user_avatar.jpg"
                    alt="Usuario"
                    className="amc-user-avatar"
                  />
                  <span className="amc-user-name">Mi cuenta</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isAccountOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '8px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                      border: '1px solid #e2e8f0',
                      minWidth: '180px',
                      zIndex: 100,
                      overflow: 'hidden'
                    }}
                  >
                    <Link
                      to="/perfil"
                      style={{ display: 'block', padding: '10px 16px', fontSize: '0.84rem', color: '#1e293b', textDecoration: 'none' }}
                      onClick={() => setIsAccountOpen(false)}
                    >
                      Ver mi perfil
                    </Link>
                    <Link
                      to="/productos"
                      style={{ display: 'block', padding: '10px 16px', fontSize: '0.84rem', color: '#1e293b', textDecoration: 'none', borderTop: '1px solid #f1f5f9' }}
                      onClick={() => setIsAccountOpen(false)}
                    >
                      Catálogo
                    </Link>
                    <Link
                      to="/mi-base"
                      style={{ display: 'block', padding: '10px 16px', fontSize: '0.84rem', color: '#1e293b', textDecoration: 'none', borderTop: '1px solid #f1f5f9' }}
                      onClick={() => setIsAccountOpen(false)}
                    >
                      Mi Base de contactos
                    </Link>
                    <Link
                      to="/local/caballito"
                      style={{ display: 'block', padding: '10px 16px', fontSize: '0.84rem', color: '#1e293b', textDecoration: 'none', borderTop: '1px solid #f1f5f9' }}
                      onClick={() => setIsAccountOpen(false)}
                    >
                      Explorar Caballito
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ==================================================================
            MAIN DASHBOARD LAYOUT (2 COLUMNS: LEFT 76% + RIGHT 24%)
            ================================================================== */}
        <main className="amc-dashboard-container">
          <div className="amc-layout-grid">
            
            {/* ================================================================
                LEFT MAIN CONTENT COLUMN
                ================================================================ */}
            <div className="amc-left-col">
              
              {/* 1. HERO SECTION CARD */}
              <section className="amc-hero-card" id="hero-mi-comunidad">
                <div className="amc-hero-left">
                  <h1 className="amc-hero-title">Mi Comunidad</h1>
                  <h2 className="amc-hero-subtitle">Todo lo que seguís en Caballito, en un solo lugar.</h2>
                  <p className="amc-hero-desc">
                    Novedades, ofertas y publicaciones de tus comercios favoritos. Una comunidad local, más cerca tuyo.
                  </p>

                  {/* 3 Stats Badges in a horizontal row */}
                  <div className="amc-hero-stats-row">
                    <div className="amc-stat-pill">
                      <div className="amc-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                          <path d="M2 7h20" />
                        </svg>
                      </div>
                      <div className="amc-stat-content">
                        <span className="amc-stat-number">12</span>
                        <span className="amc-stat-label">comercios que seguís</span>
                      </div>
                    </div>

                    <div className="amc-stat-pill">
                      <div className="amc-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                          <path d="M7 7h.01" />
                        </svg>
                      </div>
                      <div className="amc-stat-content">
                        <span className="amc-stat-number">4</span>
                        <span className="amc-stat-label">categorías de interés</span>
                      </div>
                    </div>

                    <div className="amc-stat-pill">
                      <div className="amc-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="19" y1="5" x2="5" y2="19" />
                          <circle cx="6.5" cy="6.5" r="2.5" />
                          <circle cx="17.5" cy="17.5" r="2.5" />
                        </svg>
                      </div>
                      <div className="amc-stat-content">
                        <span className="amc-stat-number">31</span>
                        <span className="amc-stat-label">ofertas activas</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Landmark Image with Overlay */}
                <div className="amc-hero-image-wrap">
                  <img
                    src="/assets/caballito/hero_landmark.jpg"
                    alt="Caballito - Parque Rivadavia"
                    className="amc-hero-img"
                  />
                  
                  {/* Handwritten cursive message */}
                  <div className="amc-hero-script-overlay">
                    Nuestra comunidad<br />
                    hace un Caballito<br />
                    más fuerte 💙
                  </div>

                  {/* Location badge on bottom right */}
                  <div className="amc-hero-location-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>Caballito, CABA</span>
                  </div>
                </div>
              </section>

              {/* 2. ROW OF 3 SUMMARY CARDS */}
              <div className="amc-summary-row">
                {/* Card 1: Mi barrio */}
                <div className="amc-summary-card">
                  <div className="amc-barrio-card-content">
                    <div>
                      <div className="amc-card-badge-header">
                        <div className="amc-mini-icon-circle">📍</div>
                        <span className="amc-card-category-label">Mi barrio</span>
                      </div>
                      <h3 className="amc-summary-title">Caballito</h3>
                      <p className="amc-summary-subtitle">
                        Comunidad comercial activa y en crecimiento.
                      </p>
                    </div>
                    <img
                      src="/assets/caballito/hero_landmark.jpg"
                      alt="Caballito"
                      className="amc-barrio-thumb"
                    />
                  </div>
                </div>

                {/* Card 2: Tus intereses */}
                <div className="amc-summary-card">
                  <div className="amc-card-header-line">
                    <div className="amc-card-badge-header">
                      <div className="amc-mini-icon-circle" style={{ color: '#2563eb' }}>💙</div>
                      <span className="amc-card-category-label">Tus intereses</span>
                    </div>
                    <span className="amc-chevron-right">›</span>
                  </div>
                  <h3 className="amc-summary-title amc-summary-title--blue">4 categorías</h3>

                  {/* 2x2 categories */}
                  <div className="amc-categories-2x2">
                    <span className="amc-cat-pill-mini amc-cat-gastronomia">
                      <span>🍴</span> Gastronomía
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-carnicerias">
                      <span>🥩</span> Carnicerías
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-panaderias">
                      <span>🥐</span> Panaderías
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-ferreterias">
                      <span>🔧</span> Ferreterías
                    </span>
                  </div>
                </div>

                {/* Card 3: Actividad reciente */}
                <div className="amc-summary-card">
                  <div className="amc-card-header-line">
                    <div className="amc-card-badge-header">
                      <div className="amc-mini-icon-circle" style={{ color: '#2563eb' }}>🔔</div>
                      <span className="amc-card-category-label">Actividad reciente</span>
                    </div>
                    <span className="amc-chevron-right">›</span>
                  </div>
                  <h3 className="amc-summary-title amc-summary-title--blue">+8 novedades hoy</h3>

                  <div className="amc-activity-row">
                    <div className="amc-avatar-stack">
                      <img src="/assets/caballito/avatar1.jpg" alt="Usuario" className="amc-avatar-item" />
                      <img src="/assets/caballito/avatar2.jpg" alt="Usuario" className="amc-avatar-item" />
                      <img src="/assets/caballito/avatar3.jpg" alt="Usuario" className="amc-avatar-item" />
                      <img src="/assets/caballito/avatar4.jpg" alt="Usuario" className="amc-avatar-item" />
                    </div>
                    <p className="amc-activity-text">
                      Comercios que seguís publicaron nuevas ofertas y novedades.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. NOVEDADES PARA VOS (OFFERS GRID) */}
              <section className="amc-novedades-section">
                <div className="amc-section-header">
                  <div>
                    <div className="amc-section-title-wrap">
                      <span className="amc-section-icon">📢</span>
                      <h2 className="amc-section-title">Novedades para vos</h2>
                    </div>
                    <p className="amc-section-subtitle">
                      Publicaciones de los comercios y categorías que seguís.
                    </p>
                  </div>
                  <Link to="/local/caballito?tab=OFERTAS" className="amc-section-link">
                    Ver todas las novedades →
                  </Link>
                </div>

                {/* 4 Cards Grid */}
                <div className="amc-offers-grid">
                  {DEFAULT_OFFERS.map(offer => (
                    <div key={offer.id} className="amc-offer-card">
                      {/* Image Banner */}
                      <div className="amc-offer-image-wrap">
                        <img src={offer.image} alt={offer.title} className="amc-offer-img" />
                        
                        <span className={`amc-badge-pill amc-badge--${offer.badge.type}`}>
                          {offer.badge.text}
                        </span>

                        <button
                          type="button"
                          className={`amc-heart-btn ${savedOffers.has(offer.id) ? 'amc-heart-btn--active' : ''}`}
                          onClick={e => toggleSaveOffer(offer.id, e)}
                          title={savedOffers.has(offer.id) ? 'Remover de guardados' : 'Guardar oferta'}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill={savedOffers.has(offer.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          </svg>
                        </button>
                      </div>

                      {/* Card Body */}
                      <div className="amc-offer-body">
                        <div>
                          {/* Commerce name row */}
                          <div className="amc-commerce-row">
                            <span className="amc-commerce-icon-mini">{offer.categoryIcon}</span>
                            <span className="amc-commerce-name-mini">{offer.commerceName}</span>
                          </div>

                          {/* Title */}
                          <h4 className="amc-offer-title">{offer.title}</h4>
                          
                          {/* Description */}
                          <p className="amc-offer-desc">{offer.description}</p>
                        </div>

                        <div>
                          {/* Meta Tags Row */}
                          <div className="amc-offer-tags-row">
                            <span className={`amc-tag-pill amc-tag-pill--${offer.tag.type}`}>
                              {offer.tag.text}
                            </span>
                            <span className="amc-time-meta">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {offer.time}
                            </span>
                          </div>

                          {/* Action Button */}
                          <Link
                            to={`/local/caballito/oferta/${offer.id}`}
                            className="amc-btn-ver-oferta"
                          >
                            <span>Ver oferta</span>
                            <span>→</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. BOTTOM ROW: COMERCIOS QUE SEGUÍS + CATEGORÍAS QUE SEGUÍS */}
              <div className="amc-bottom-row">
                {/* Left Box: Comercios que seguís */}
                <div className="amc-bottom-card">
                  <div className="amc-section-header" style={{ marginBottom: 4 }}>
                    <div className="amc-section-title-wrap">
                      <span className="amc-section-icon" style={{ fontSize: '1rem' }}>🏪</span>
                      <div>
                        <h3 className="amc-section-title" style={{ fontSize: '0.94rem' }}>Comercios que seguís</h3>
                        <p className="amc-section-subtitle" style={{ fontSize: '0.7rem' }}>Tus comercios favoritos en Caballito.</p>
                      </div>
                    </div>
                    <Link to="/local/caballito?tab=COMERCIOS" className="amc-section-link" style={{ fontSize: '0.74rem' }}>
                      Ver todos →
                    </Link>
                  </div>

                  <div className="amc-followed-row">
                    {FOLLOWED_BUSINESSES.map(biz => (
                      <div
                        key={biz.id}
                        className="amc-followed-biz-chip"
                        onClick={() => navigate(`/local/caballito/comercio/${biz.id}`)}
                      >
                        <img src={biz.image} alt={biz.name} className="amc-chip-thumb" />
                        <div className="amc-chip-details">
                          <span className="amc-chip-name">{biz.name}</span>
                          <span className="amc-chip-cat">{biz.category}</span>
                        </div>
                        <span className="amc-chip-heart">♡</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Box: Categorías que seguís */}
                <div className="amc-bottom-card">
                  <div className="amc-section-header" style={{ marginBottom: 4 }}>
                    <div className="amc-section-title-wrap">
                      <span className="amc-section-icon" style={{ fontSize: '1rem' }}>🏷️</span>
                      <div>
                        <h3 className="amc-section-title" style={{ fontSize: '0.94rem' }}>Categorías que seguís</h3>
                        <p className="amc-section-subtitle" style={{ fontSize: '0.7rem' }}>Tus temas de interés.</p>
                      </div>
                    </div>
                    <span
                      className="amc-section-link"
                      style={{ fontSize: '0.74rem', cursor: 'pointer' }}
                      onClick={() => showToast('Configuración de categorías')}
                    >
                      Editar →
                    </span>
                  </div>

                  <div className="amc-followed-categories-grid">
                    <span className="amc-cat-pill-mini amc-cat-gastronomia">
                      <span>🍴</span> Gastronomía
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-carnicerias">
                      <span>🥩</span> Carnicerías
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-panaderias">
                      <span>🥐</span> Panaderías
                    </span>
                    <span className="amc-cat-pill-mini amc-cat-ferreterias">
                      <span>🔧</span> Ferreterías
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* ================================================================
                RIGHT SIDEBAR COLUMN: ACCIONES RÁPIDAS + SUGERENCIAS
                ================================================================ */}
            <aside className="amc-right-col">
              
              {/* 1. ACCIONES RÁPIDAS CARD */}
              <div className="amc-sidebar-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#2563eb', fontSize: '1.05rem' }}>⚡</span>
                  <h3 className="amc-sidebar-title">Acciones rápidas</h3>
                </div>

                <div className="amc-actions-list">
                  {/* Action 1: Primary blue button (Ver mi barrio) */}
                  <Link to="/local/mi-barrio" className="amc-action-btn amc-action-btn--primary">
                    <div className="amc-action-left">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                        <line x1="9" y1="3" x2="9" y2="18" />
                        <line x1="15" y1="6" x2="15" y2="21" />
                      </svg>
                      <span>Ver mi barrio</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>›</span>
                  </Link>

                  {/* Action 2: Explorar comercios */}
                  <Link to="/local/caballito?tab=COMERCIOS" className="amc-action-btn amc-action-btn--outline">
                    <div className="amc-action-left">
                      <svg className="amc-action-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                        <path d="M2 7h20" />
                      </svg>
                      <span>Explorar comercios</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '1rem' }}>›</span>
                  </Link>

                  {/* Action 3: Compartir con amigos */}
                  <button
                    type="button"
                    className="amc-action-btn amc-action-btn--outline"
                    onClick={handleShare}
                  >
                    <div className="amc-action-left">
                      <svg className="amc-action-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      <span>Compartir con amigos</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '1rem' }}>›</span>
                  </button>

                  {/* Action 4: Ir a Mi Base */}
                  <Link to="/mi-base" className="amc-action-btn amc-action-btn--outline">
                    <div className="amc-action-left">
                      <svg className="amc-action-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                      </svg>
                      <span>Ir a Mi Base</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '1rem' }}>›</span>
                  </Link>
                </div>
              </div>

              {/* 2. SUGERENCIAS PARA VOS CARD */}
              <div className="amc-sidebar-card">
                <div className="amc-section-header" style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#f59e0b', fontSize: '0.95rem' }}>⭐</span>
                    <h3 className="amc-sidebar-title">Sugerencias para vos</h3>
                  </div>
                  <Link to="/local/caballito?tab=COMERCIOS" className="amc-section-link" style={{ fontSize: '0.72rem' }}>
                    Ver todas →
                  </Link>
                </div>

                <div className="amc-suggestions-list">
                  {SUGGESTIONS.map(sug => (
                    <div key={sug.id} className="amc-suggestion-item">
                      <div className="amc-suggestion-left">
                        <img src={sug.image} alt={sug.name} className="amc-suggestion-thumb" />
                        <div className="amc-suggestion-details">
                          <span className="amc-suggestion-name">{sug.name}</span>
                          <span className="amc-suggestion-sub">{sug.category}</span>
                          <span className={`amc-suggestion-tag ${sug.badge.class}`}>
                            {sug.badge.text}
                          </span>
                        </div>
                      </div>

                      <div className="amc-suggestion-actions">
                        <button
                          type="button"
                          className="amc-mini-heart-btn"
                          style={{ color: savedSuggestions.has(sug.id) ? '#ef4444' : undefined }}
                          onClick={e => toggleSaveSuggestion(sug.id, sug.name, e)}
                          title={savedSuggestions.has(sug.id) ? 'Siguiendo' : 'Seguir comercio'}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill={savedSuggestions.has(sug.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          </svg>
                        </button>
                        <span
                          style={{ color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', padding: '0 2px' }}
                          onClick={() => navigate(`/local/caballito/comercio/${sug.orgId}`)}
                        >
                          ›
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </aside>

          </div>
        </main>
      </div>

      {/* Floating feedback toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 9999
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default AtlasLocalMiComunidad;
