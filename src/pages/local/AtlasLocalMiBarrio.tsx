import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtlasViralShareEngine } from '../../lib/atlasLocal/viralShare';
import { supabase } from '../../lib/supabase';
import './AtlasLocalMiBarrio.css';

interface OfferItem {
  offer_id: string;
  organization_id: string;
  neighborhood_id: string;
  title: string;
  description: string;
  price_text: string | null;
  valid_until: string;
  organization_name?: string;
  organization_address?: string;
  image?: string;
  badge?: string;
}

interface BusinessItem {
  organization_id: string;
  name: string;
  category: string;
  address: string;
  neighborhood_id: string;
  image?: string;
}

const DEFAULT_OFFERS: OfferItem[] = [
  {
    offer_id: 'mock-1-asado',
    organization_id: 'org-carniceria-don-jose',
    neighborhood_id: 'caballito',
    organization_name: 'Carnicería Don José',
    organization_address: 'Av. Rivadavia 5200, Caballito',
    title: '20% en asado especial',
    description: 'Los mejores cortes de novillo seleccionado con descuento del día.',
    price_text: '$6.800',
    valid_until: '2026-10-15',
    image: '/assets/caballito/asado.jpg',
    badge: 'Oferta del día'
  },
  {
    offer_id: 'mock-2-medialunas',
    organization_id: 'org-panaderia-caballito',
    neighborhood_id: 'caballito',
    organization_name: 'Panadería Caballito',
    organization_address: 'Rosario 450, Caballito',
    title: 'Promo medialunas + café',
    description: 'Medialunas artesanales recién horneadas con café a precio especial.',
    price_text: '2x1',
    valid_until: '2026-10-15',
    image: '/assets/caballito/medialunas.jpg',
    badge: 'Novedad'
  },
  {
    offer_id: 'mock-3-verduras',
    organization_id: 'org-verduleria-plaza',
    neighborhood_id: 'caballito',
    organization_name: 'Verdulería Plaza',
    organization_address: 'Av. La Plata 320, Caballito',
    title: 'Canasta fresca del día',
    description: 'Frutas y verduras de estación seleccionadas directo del productor.',
    price_text: '15% OFF',
    valid_until: '2026-10-15',
    image: '/assets/caballito/verduras.jpg',
    badge: 'Fresco'
  },
  {
    offer_id: 'mock-4-ravioles',
    organization_id: 'org-pastas-la-nonna',
    neighborhood_id: 'caballito',
    organization_name: 'Pastas La Nonna',
    organization_address: 'Guayaquil 610, Caballito',
    title: 'Ravioles caseros con descuento',
    description: 'El sabor tradicional de siempre en el corazón de Caballito.',
    price_text: '20% OFF',
    valid_until: '2026-10-20',
    image: '/assets/caballito/ravioles.jpg',
    badge: 'Destacado'
  }
];

const DEFAULT_BUSINESSES: BusinessItem[] = [
  {
    organization_id: 'org-carniceria-don-jose',
    name: 'Carnicería Don José',
    category: 'Carnicería',
    address: 'Av. Rivadavia 5200, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/asado.jpg'
  },
  {
    organization_id: 'org-panaderia-caballito',
    name: 'Panadería Caballito',
    category: 'Panadería & Confitería',
    address: 'Rosario 450, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/medialunas.jpg'
  },
  {
    organization_id: 'org-verduleria-plaza',
    name: 'Verdulería Plaza',
    category: 'Frutas y Verduras',
    address: 'Av. La Plata 320, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/verduras.jpg'
  },
  {
    organization_id: 'org-pastas-la-nonna',
    name: 'Pastas La Nonna',
    category: 'Fábrica de Pastas',
    address: 'Guayaquil 610, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/ravioles.jpg'
  },
  {
    organization_id: 'org-ferreteria-el-martillo',
    name: 'Ferretería El Martillo',
    category: 'Ferretería & Bazar',
    address: 'Av. Rivadavia 4900, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/ferreteria.jpg'
  },
  {
    organization_id: 'org-cafe-barrio',
    name: 'Café de Barrio',
    category: 'Cafetería de Especialidad',
    address: 'Av. Pedro Goyena 800, Caballito',
    neighborhood_id: 'caballito',
    image: '/assets/caballito/cafe.jpg'
  }
];

export const AtlasLocalMiBarrio: React.FC = () => {
  const navigate = useNavigate();
  const [followedBarrios, setFollowedBarrios] = useState<string[]>(['caballito']);
  const [recentOffers, setRecentOffers] = useState<OfferItem[]>(DEFAULT_OFFERS);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<BusinessItem[]>(DEFAULT_BUSINESSES);
  const [savedRelations, setSavedRelations] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
          setIsLoggedIn(true);
        }

        const res = await fetch('/api/atlas/local/mi-barrio', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.followed_barrios && data.followed_barrios.length > 0) {
            setFollowedBarrios(data.followed_barrios);
          }
          if (data.recent_offers && data.recent_offers.length > 0) {
            setRecentOffers(data.recent_offers);
          }
          if (data.featured_businesses && data.featured_businesses.length > 0) {
            setFeaturedBusinesses(data.featured_businesses);
          }
        }

        if (session?.user?.id) {
          const savedRes = await fetch(`/api/user/saved-relations?user_id=${session.user.id}`, { headers });
          if (savedRes.ok) {
            const sData = await savedRes.json();
            const caballitoSaved = (sData.relations || []).filter((r: any) => 
              r.address?.toLowerCase().includes('caballito') || 
              r.notes?.toLowerCase().includes('caballito') ||
              r.neighborhood_id === 'caballito'
            );
            setSavedRelations(caballitoSaved);
          }
        }
      } catch (err) {
        console.error('[MiBarrio] Error loading data:', err);
      }
    }

    loadData();
  }, []);

  const handleShareOffer = async (o: OfferItem) => {
    try {
      const { whatsappUrl } = await AtlasViralShareEngine.createTrackedShare({
        content_type: 'OFFER',
        content_id: o.offer_id,
        barrio_id: 'caballito',
        organization_id: o.organization_id,
        title: o.title,
        summary: `${o.organization_name || 'Comercio'} • ${o.price_text || 'Oferta'}`
      });
      window.open(whatsappUrl, '_blank');
    } catch {
      if (navigator.share) {
        navigator.share({
          title: o.title,
          text: `${o.organization_name}: ${o.title} - ${o.description}`,
          url: window.location.href
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(window.location.href);
        showToast('🔗 ¡Enlace copiado al portapapeles!');
      }
    }
  };

  const handleShareBiz = async (b: BusinessItem) => {
    try {
      const { whatsappUrl } = await AtlasViralShareEngine.createTrackedShare({
        content_type: 'BUSINESS',
        content_id: b.organization_id,
        barrio_id: 'caballito',
        organization_id: b.organization_id,
        title: b.name,
        summary: `${b.category} • ${b.address}`
      });
      window.open(whatsappUrl, '_blank');
    } catch {
      navigator.clipboard.writeText(`${window.location.origin}/local/caballito/comercio/${b.organization_id}`);
      showToast('🔗 ¡Enlace del comercio copiado!');
    }
  };

  return (
    <div className="amb-page-wrapper">
      <div className="amb-app-canvas">
        
        {/* ==================================================================
            TOP NAVIGATION BAR (COHESIVE LIGHT THEME)
            ================================================================== */}
        <header className="amb-top-bar">
          <div className="amb-top-bar-inner">
            <div className="amb-top-left">
              <Link to="/buscaindustrial" className="amb-logo-link" title="Buscador Industrial">
                <svg className="amb-logo-icon" viewBox="0 0 40 40" fill="none">
                  <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0f172a" />
                  <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill="#2563eb" />
                  <polygon points="20,13 26,16.5 26,23.5 20,27 14,23.5 14,16.5" fill="white" opacity="0.95" />
                </svg>
                <span className="amb-logo-text">Buscador Industrial</span>
              </Link>

              <button
                type="button"
                className="amb-location-pill"
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

            <div className="amb-top-center">
              <div className="amb-search-box">
                <svg className="amb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  className="amb-search-input"
                  placeholder="Buscar en mi barrio, ofertas, comercios..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="amb-top-right">
              <ul className="amb-nav-items">
                <li>
                  <Link to="/buscaindustrial" className="amb-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Inicio</span>
                  </Link>
                </li>

                <li>
                  <Link to="/productos" className="amb-nav-btn" id="amb-nav-catalogo">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                      <path d="M6 6h10" />
                      <path d="M6 10h10" />
                    </svg>
                    <span>Catálogo</span>
                  </Link>
                </li>

                <li>
                  <Link to="/local/mi-barrio" className="amb-nav-btn amb-nav-btn--active">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                      <path d="M2 7h20" />
                    </svg>
                    <span>Mi Barrio</span>
                  </Link>
                </li>

                <li>
                  <Link to="/local/mi-comunidad" className="amb-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>Mi Comunidad</span>
                  </Link>
                </li>

                <li>
                  <Link to="/mi-base" className="amb-nav-btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                    </svg>
                    <span>Mi Base</span>
                  </Link>
                </li>
              </ul>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="amb-user-menu-btn"
                  onClick={() => setIsAccountOpen(!isAccountOpen)}
                >
                  <img
                    src="/assets/caballito/user_avatar.jpg"
                    alt="Usuario"
                    className="amb-user-avatar"
                  />
                  <span className="amb-user-name">Mi cuenta</span>
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
            MAIN CONTENT AREA
            ================================================================== */}
        <main className="amb-dashboard-container">
          <div className="amb-layout-grid">
            
            {/* LEFT COLUMN: HERO, STRIP, OFERTAS, COMERCIOS */}
            <div className="amb-left-col">
              
              {/* HERO CARD */}
              <section className="amb-hero-card">
                <div className="amb-hero-left">
                  <div className="amb-badge-row">
                    <span className="amb-tag-pill-badge">Panel Vecinal</span>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Sin algoritmos ni ruido</span>
                  </div>
                  <h1 className="amb-hero-title">Mi Barrio</h1>
                  <h2 className="amb-hero-subtitle">Caballito, Ciudad Autónoma de Buenos Aires</h2>
                  <p className="amb-hero-desc">
                    Seguimiento directo y contenidos guardados. Explorá ofertas de proximidad, comercios verificados y puntos de interés comercial en tu zona.
                  </p>

                  <div className="amb-hero-stats-row">
                    <div className="amb-stat-pill">
                      <div className="amb-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                          <path d="M2 7h20" />
                        </svg>
                      </div>
                      <div className="amb-stat-content">
                        <span className="amb-stat-number">100+</span>
                        <span className="amb-stat-label">comercios locales</span>
                      </div>
                    </div>

                    <div className="amb-stat-pill">
                      <div className="amb-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="19" y1="5" x2="5" y2="19" />
                          <circle cx="6.5" cy="6.5" r="2.5" />
                          <circle cx="17.5" cy="17.5" r="2.5" />
                        </svg>
                      </div>
                      <div className="amb-stat-content">
                        <span className="amb-stat-number">31</span>
                        <span className="amb-stat-label">ofertas activas</span>
                      </div>
                    </div>

                    <div className="amb-stat-pill">
                      <div className="amb-stat-icon-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div className="amb-stat-content">
                        <span className="amb-stat-number">1.2k</span>
                        <span className="amb-stat-label">vecinos conectados</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="amb-hero-image-wrap">
                  <img
                    src="/assets/caballito/hero_landmark.jpg"
                    alt="Caballito - Parque Rivadavia"
                    className="amb-hero-img"
                  />
                  
                  <div className="amb-hero-script-overlay">
                    Tu barrio más<br />
                    conectado que nunca 📍
                  </div>

                  <div className="amb-hero-location-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>Parque Rivadavia, Caballito</span>
                  </div>
                </div>
              </section>

              {/* BARRIOS SELECTOR STRIP */}
              <div className="amb-barrios-strip">
                <div className="amb-strip-left">
                  <span className="amb-strip-label">Barrios que sigues:</span>
                  {followedBarrios.map(b => (
                    <Link
                      key={b}
                      to={`/local/${b}`}
                      className="amb-barrio-chip amb-barrio-chip--active"
                    >
                      <span>📍</span>
                      <span>{b.toUpperCase()}</span>
                      <span style={{ fontSize: '0.7rem' }}>↗</span>
                    </Link>
                  ))}
                  <Link to="/local/almagro" className="amb-barrio-chip amb-barrio-chip--inactive">
                    <span>📍</span>
                    <span>ALMAGRO</span>
                  </Link>
                  <Link to="/local/flores" className="amb-barrio-chip amb-barrio-chip--inactive">
                    <span>📍</span>
                    <span>FLORES</span>
                  </Link>
                </div>

                <div className="amb-strip-right">
                  {!isLoggedIn && (
                    <span>
                      ℹ️ <Link to="/login?returnTo=/local/mi-barrio" style={{ color: '#2563eb', fontWeight: 600 }}>Inicia sesión</Link> para sincronizar tus dispositivos.
                    </span>
                  )}
                </div>
              </div>

              {/* SECTION 1: OFERTAS ACTIVAS */}
              <section>
                <div className="amb-section-header">
                  <div className="amb-section-title-wrap">
                    <span className="amb-section-icon">🏷️</span>
                    <div>
                      <h2 className="amb-section-title">Ofertas Activas en Caballito</h2>
                      <p className="amb-section-subtitle">Promociones directas de los comercios de tu barrio</p>
                    </div>
                  </div>
                  <Link to="/local/caballito?tab=OFERTAS" className="amb-section-link">
                    Ver todas en mapa ↗
                  </Link>
                </div>

                <div className="amb-offers-grid">
                  {recentOffers.map(o => (
                    <div key={o.offer_id} className="amb-offer-card">
                      <div className="amb-offer-img-wrap">
                        <img
                          src={o.image || '/assets/caballito/asado.jpg'}
                          alt={o.title}
                          className="amb-offer-img"
                        />
                        <span className="amb-offer-badge-pill" style={{ background: '#2563eb' }}>
                          {o.badge || 'Oferta local'}
                        </span>
                        {o.price_text && (
                          <span className="amb-offer-price-tag">
                            {o.price_text}
                          </span>
                        )}
                      </div>

                      <div className="amb-offer-body">
                        <div>
                          <div className="amb-commerce-line">
                            {o.organization_name || 'Comercio Local'}
                          </div>
                          <h3 className="amb-offer-title">{o.title}</h3>
                          <p className="amb-offer-desc">{o.description}</p>
                        </div>

                        <div className="amb-offer-actions">
                          <Link
                            to={`/local/caballito/oferta/${o.offer_id}`}
                            className="amb-btn-detail"
                          >
                            <span>Ver detalle</span>
                            <span>→</span>
                          </Link>

                          <button
                            type="button"
                            className="amb-btn-share"
                            onClick={() => handleShareOffer(o)}
                            title="Compartir por WhatsApp"
                          >
                            <span>📲</span>
                            <span>Compartir</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* SECTION 2: COMERCIOS VERIFICADOS */}
              <section>
                <div className="amb-section-header">
                  <div className="amb-section-title-wrap">
                    <span className="amb-section-icon">🏬</span>
                    <div>
                      <h2 className="amb-section-title">Comercios Verificados en Caballito</h2>
                      <p className="amb-section-subtitle">Negocios de proximidad con atención presencial y catálogo directo</p>
                    </div>
                  </div>
                  <Link to="/local/caballito?tab=COMERCIOS" className="amb-section-link">
                    Explorar los 100 comercios ↗
                  </Link>
                </div>

                <div className="amb-businesses-grid">
                  {featuredBusinesses.map(b => (
                    <div key={b.organization_id} className="amb-biz-card">
                      <div className="amb-biz-top">
                        <img
                          src={b.image || '/assets/caballito/asado.jpg'}
                          alt={b.name}
                          className="amb-biz-thumb"
                        />
                        <div className="amb-biz-info">
                          <span className="amb-biz-cat-tag">{b.category}</span>
                          <h4 className="amb-biz-name" title={b.name}>{b.name}</h4>
                          <span className="amb-biz-addr" title={b.address}>
                            <span>📍</span> {b.address}
                          </span>
                        </div>
                      </div>

                      <div className="amb-biz-actions">
                        <Link
                          to={`/local/caballito/comercio/${b.organization_id}`}
                          className="amb-btn-detail"
                        >
                          <span>Ficha comercial</span>
                          <span>→</span>
                        </Link>

                        <button
                          type="button"
                          className="amb-btn-share"
                          onClick={() => handleShareBiz(b)}
                          title="Compartir comercio"
                        >
                          <span>📲 Compartir</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* RIGHT SIDEBAR */}
            <aside className="amb-right-col">
              
              {/* CARD 1: ACCIONES RÁPIDAS */}
              <div className="amb-sidebar-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#2563eb', fontSize: '1.05rem' }}>⚡</span>
                  <h3 className="amb-sidebar-title">Acciones del Barrio</h3>
                </div>

                <div className="amb-actions-list">
                  <Link to="/local/caballito?tab=MAPA" className="amb-action-btn amb-action-btn--primary">
                    <div className="amb-action-left">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                        <line x1="9" y1="3" x2="9" y2="18" />
                        <line x1="15" y1="6" x2="15" y2="21" />
                      </svg>
                      <span>Ver mapa interactivo</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>›</span>
                  </Link>

                  <Link to="/local/mi-comunidad" className="amb-action-btn amb-action-btn--outline">
                    <div className="amb-action-left">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span>Ir a Mi Comunidad</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '1rem' }}>›</span>
                  </Link>

                  <Link to="/local/caballito?tab=COMERCIOS" className="amb-action-btn amb-action-btn--outline">
                    <div className="amb-action-left">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                        <path d="M2 7h20" />
                      </svg>
                      <span>Explorar 100 comercios</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '1rem' }}>›</span>
                  </Link>

                  <Link to="/mi-base" className="amb-action-btn amb-action-btn--outline">
                    <div className="amb-action-left">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

              {/* CARD 2: CONTENIDO GUARDADO (MI BASE) */}
              <div className="amb-sidebar-card">
                <div className="amb-section-header" style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#f59e0b', fontSize: '0.95rem' }}>⭐</span>
                    <h3 className="amb-sidebar-title">Contenido Guardado</h3>
                  </div>
                  <Link to="/mi-base" className="amb-section-link" style={{ fontSize: '0.72rem' }}>
                    Ver Mi Base ↗
                  </Link>
                </div>

                {savedRelations.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.45 }}>
                    Guardá comercios y oportunidades de Caballito con el botón <strong>⭐ Guardar</strong> para tenerlos siempre a mano desde tu panel.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {savedRelations.slice(0, 4).map(rel => (
                      <div
                        key={rel.saved_id}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '6px 10px'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#0f172a' }}>
                          {rel.custom_name || rel.entity_id}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {rel.notes || rel.pipeline_stage || 'Guardado'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CARD 3: DATOS DEL BARRIO */}
              <div className="amb-sidebar-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ color: '#2563eb', fontSize: '1rem' }}>ℹ️</span>
                  <h3 className="amb-sidebar-title">Datos de Caballito</h3>
                </div>

                <div className="amb-info-grid">
                  <div className="amb-info-row">
                    <span className="amb-info-label">Comuna</span>
                    <span className="amb-info-value">Comuna 6</span>
                  </div>
                  <div className="amb-info-row">
                    <span className="amb-info-label">Ubicación</span>
                    <span className="amb-info-value">Centro de CABA</span>
                  </div>
                  <div className="amb-info-row">
                    <span className="amb-info-label">Ejes comerciales</span>
                    <span className="amb-info-value">Rivadavia / Goyena</span>
                  </div>
                  <div className="amb-info-row">
                    <span className="amb-info-label">Población estimada</span>
                    <span className="amb-info-value">~180.000 hab.</span>
                  </div>
                </div>
              </div>

            </aside>

          </div>
        </main>
      </div>

      {/* Toast Feedback */}
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

export default AtlasLocalMiBarrio;
