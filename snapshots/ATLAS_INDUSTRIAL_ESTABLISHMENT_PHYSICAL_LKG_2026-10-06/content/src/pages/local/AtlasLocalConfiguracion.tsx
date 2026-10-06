import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './AtlasLocalConfiguracion.css';

const AVAILABLE_CATEGORIES = [
  { id: 'GASTRONOMIA', label: 'Gastronomía' },
  { id: 'ALIMENTOS', label: 'Alimentos y Bebidas' },
  { id: 'INDUMENTARIA', label: 'Indumentaria y Calzado' },
  { id: 'SERVICIOS', label: 'Servicios Profesionales' },
  { id: 'EQUIPOS / MANTENIMIENTO', label: 'Equipos y Mantenimiento' },
  { id: 'PACKAGING / IMPRENTA', label: 'Packaging e Imprenta' },
  { id: 'HOGAR', label: 'Hogar y Decoración' }
];

export const AtlasLocalConfiguracion: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [followedCategories, setFollowedCategories] = useState<string[]>([]);
  const [isFollowingCaballito, setIsFollowingCaballito] = useState(true);
  const [localPromos, setLocalPromos] = useState(() => {
    return localStorage.getItem('atlas_cfg_promos') !== 'false';
  });
  const [communityAlerts, setCommunityAlerts] = useState(() => {
    return localStorage.getItem('atlas_cfg_alerts') !== 'false';
  });
  const [locationStatus, setLocationStatus] = useState<string>('No comprobado');
  const [checkingLocation, setCheckingLocation] = useState(false);

  // Account Menu State
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};

        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (testUser) {
          headers['x-user-id'] = testUser;
        }

        const res = await fetch('/api/atlas/local/profile/me', { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.followed_categories)) {
            setFollowedCategories(data.followed_categories);
          }
          setIsFollowingCaballito(data.is_following_caballito !== false);
        }
      } catch (err) {
        console.warn('Could not load preferences:', err);
      }
    }
    loadData();
  }, [searchParams]);

  // Handle toggling category follow
  const handleToggleCategory = async (catId: string) => {
    const isCurrentlyFollowed = followedCategories.includes(catId);
    const updated = isCurrentlyFollowed
      ? followedCategories.filter(c => c !== catId)
      : [...followedCategories, catId];
    setFollowedCategories(updated);

    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) headers['x-user-id'] = testUser;

      await fetch('/api/atlas/local/caballito/follow-category', {
        method: 'POST',
        headers,
        body: JSON.stringify({ category_id: catId })
      });
    } catch (e) {
      console.warn('Failed to persist category follow:', e);
    }
  };

  const handleTogglePromos = (checked: boolean) => {
    setLocalPromos(checked);
    localStorage.setItem('atlas_cfg_promos', String(checked));
  };

  const handleToggleAlerts = (checked: boolean) => {
    setCommunityAlerts(checked);
    localStorage.setItem('atlas_cfg_alerts', String(checked));
  };

  const checkGeolocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocalización no soportada en este navegador');
      return;
    }
    setCheckingLocation(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus('Permitido (disponible para ordenar ofertas por cercanía)');
        setCheckingLocation(false);
      },
      (err) => {
        setLocationStatus(`Bloqueado o no concedido (${err.message})`);
        setCheckingLocation(false);
      },
      { timeout: 5000 }
    );
  };

  const handleSignOut = async () => {
    setIsAccountMenuOpen(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn(e);
    }
    localStorage.removeItem('atlas_test_user_id');
    navigate('/local/caballito');
  };

  return (
    <div className="config-page-root">
      {/* ─── Top Navbar ─── */}
      <header className="config-navbar">
        <div className="config-navbar-inner">
          <Link to="/local/caballito" className="config-brand">
            <svg className="config-brand-logo" viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 29,9 29,23 16,30 3,23 3,9" fill="#1e3a8a" stroke="#0284c7" strokeWidth="2.5" />
              <polygon points="16,7 24,12 24,20 16,25 8,20 8,12" fill="#0284c7" />
            </svg>
            <div className="config-brand-text">
              <span className="config-brand-title">Buscador Industrial</span>
              <span className="config-brand-subtitle">Configuración</span>
            </div>
          </Link>

          <div className="config-nav-actions">
            <Link to="/productos" className="config-back-btn" id="btn-config-catalogo">
              📦 Catálogo
            </Link>
            <Link to="/local/caballito" className="config-back-btn" id="btn-back-caballito">
              ← Volver al barrio
            </Link>

            {/* Account Menu */}
            <div className="caballito-account-wrapper" ref={accountMenuRef} style={{ position: 'relative' }}>
              <button
                ref={accountBtnRef}
                type="button"
                id="btn-mi-cuenta"
                className="caballito-user-btn"
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                title="Mi cuenta"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                <span>👤</span>
                <span>Mi cuenta</span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>{isAccountMenuOpen ? '▴' : '⌵'}</span>
              </button>

              {isAccountMenuOpen && (
                <div
                  className="caballito-account-dropdown"
                  id="caballito-account-dropdown"
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: '210px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    boxShadow: '0 12px 24px -4px rgba(15, 23, 42, 0.15)',
                    padding: '6px 0',
                    zIndex: 1100
                  }}
                >
                  <button
                    type="button"
                    id="account-opt-perfil"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/perfil');
                    }}
                  >
                    <span>👤</span>
                    <span>Ver mi perfil</span>
                  </button>
                  <button
                    type="button"
                    id="account-opt-catalogo"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/productos');
                    }}
                  >
                    <span>📦</span>
                    <span>Catálogo</span>
                  </button>
                  <button
                    type="button"
                    id="account-opt-mibarrio"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/local/mi-barrio');
                    }}
                  >
                    <span>📍</span>
                    <span>Mi Barrio</span>
                  </button>
                  <button
                    type="button"
                    id="account-opt-micomunidad"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/local/mi-comunidad');
                    }}
                  >
                    <span>👥</span>
                    <span>Mi Comunidad</span>
                  </button>
                  <button
                    type="button"
                    id="account-opt-mibase"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/mi-base');
                    }}
                  >
                    <span>📁</span>
                    <span>Mi Base</span>
                  </button>
                  <button
                    type="button"
                    id="account-opt-configuracion"
                    role="menuitem"
                    className="caballito-account-menu-item"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      navigate('/configuracion');
                    }}
                  >
                    <span>⚙️</span>
                    <span>Configuración</span>
                  </button>
                  <div className="caballito-account-dropdown-divider" />
                  <button
                    type="button"
                    id="account-opt-logout"
                    role="menuitem"
                    className="caballito-account-menu-item danger"
                    onClick={handleSignOut}
                  >
                    <span>🚪</span>
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="config-main-container">
        <div className="config-page-header">
          <h1 className="config-page-title" id="config-title">Configuración</h1>
          <p className="config-page-subtitle">
            Personalizá tus preferencias, permisos y experiencia en la comunidad de Buscador Industrial.
          </p>
        </div>

        {/* Callout to Edit Public Profile without repeating fields */}
        <div className="config-profile-callout" id="callout-edit-profile">
          <div className="config-callout-text">
            <strong>¿Querés personalizar tu avatar, bio o visibilidad comunitaria?</strong>
            <div>Editá tu presencia pública directamente desde tu Perfil de la comunidad.</div>
          </div>
          <Link to="/perfil" className="config-callout-btn" id="link-edit-public-profile">
            Editar mi perfil público →
          </Link>
        </div>

        {/* Group 1: Mi Barrio */}
        <section className="config-group-card" id="config-barrio-section">
          <div className="config-group-header">
            <h2 className="config-group-title">
              <span>📍</span> Mi Barrio Principal
            </h2>
            <p className="config-group-desc">El centro comercial y comunitario sobre el que se priorizan tus búsquedas.</p>
          </div>
          <div className="config-group-body">
            <div className="config-row">
              <div className="config-row-left">
                <span className="config-row-label">Barrio seleccionado</span>
                <span className="config-row-subtext">Comuna 6 • Centro Geográfico CABA</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="config-barrio-pill">📍 Caballito</span>
                <Link to="/local/mi-barrio" className="config-back-btn" id="link-mi-barrio">
                  Ver Mi Barrio →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Group 2: Mis Intereses */}
        <section className="config-group-card" id="config-interests-section">
          <div className="config-group-header">
            <h2 className="config-group-title">
              <span>🏷️</span> Mis Intereses y Rubros
            </h2>
            <p className="config-group-desc">
              Seleccioná las categorías comerciales que deseás priorizar en tu feed de ofertas.
            </p>
          </div>
          <div className="config-group-body">
            <div className="config-chips-wrap">
              {AVAILABLE_CATEGORIES.map(cat => {
                const isSelected = followedCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`config-category-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleCategory(cat.id)}
                    id={`chip-cat-${cat.id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>
              Podés elegir si estos intereses son visibles en tu perfil público desde el editor de perfil.
            </p>
          </div>
        </section>

        {/* Group 3: Ubicación y Cercanía */}
        <section className="config-group-card" id="config-location-section">
          <div className="config-group-header">
            <h2 className="config-group-title">
              <span>🧭</span> Ubicación y Proximidad
            </h2>
            <p className="config-group-desc">
              Permite ordenar comercios y ofertas por distancia respecto a donde te encuentres.
            </p>
          </div>
          <div className="config-group-body">
            <div className="config-row">
              <div className="config-row-left">
                <span className="config-row-label">Permiso del navegador</span>
                <span className="config-row-subtext" id="location-permission-status">{locationStatus}</span>
              </div>
              <button
                type="button"
                className="config-back-btn"
                id="btn-check-geolocation"
                onClick={checkGeolocation}
                disabled={checkingLocation}
              >
                {checkingLocation ? 'Comprobando...' : 'Comprobar permiso'}
              </button>
            </div>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#475569',
              lineHeight: 1.45
            }}>
              🔒 <strong>Garantía de Privacidad Atlas:</strong> Tus coordenadas geográficas exactas NUNCA se guardan en nuestros servidores ni se hacen públicas. El cálculo de cercanía ocurre en tu dispositivo.
            </div>
          </div>
        </section>

        {/* Group 4: Comunicaciones */}
        <section className="config-group-card" id="config-communications-section">
          <div className="config-group-header">
            <h2 className="config-group-title">
              <span>🔔</span> Comunicaciones y Notificaciones
            </h2>
            <p className="config-group-desc">Configurá las alertas sobre oportunidades en Caballito.</p>
          </div>
          <div className="config-group-body">
            <div className="config-row">
              <div className="config-row-left">
                <span className="config-row-label">Nuevas ofertas de comercios seguidos</span>
                <span className="config-row-subtext">Avisos destacados cuando se publiquen promociones.</span>
              </div>
              <label className="apple-switch">
                <input
                  type="checkbox"
                  id="toggle-local-promos"
                  checked={localPromos}
                  onChange={(e) => handleTogglePromos(e.target.checked)}
                />
                <span className="apple-slider"></span>
              </label>
            </div>

            <div className="config-row">
              <div className="config-row-left">
                <span className="config-row-label">Avisos comunitarios y aperturas</span>
                <span className="config-row-subtext">Novedades sobre nuevos comercios en el barrio.</span>
              </div>
              <label className="apple-switch">
                <input
                  type="checkbox"
                  id="toggle-community-alerts"
                  checked={communityAlerts}
                  onChange={(e) => handleToggleAlerts(e.target.checked)}
                />
                <span className="apple-slider"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Group 5: Privacidad y Políticas de Datos */}
        <section className="config-group-card" id="config-privacy-section">
          <div className="config-group-header">
            <h2 className="config-group-title">
              <span>🛡️</span> Privacidad por Defecto (SSOT)
            </h2>
            <p className="config-group-desc">
              Reglas estrictas de protección de datos personales en el entorno comunitario.
            </p>
          </div>
          <div className="config-group-body">
            <table className="config-privacy-table">
              <thead>
                <tr>
                  <th>Dato o Atributo</th>
                  <th>Nivel de Visibilidad</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Correo electrónico</strong></td>
                  <td><span className="config-privacy-badge-private">SIEMPRE PRIVADO</span></td>
                  <td>Solo para autenticación y seguridad</td>
                </tr>
                <tr>
                  <td><strong>Teléfono de contacto</strong></td>
                  <td><span className="config-privacy-badge-private">SIEMPRE PRIVADO</span></td>
                  <td>No visible en perfiles comunitarios</td>
                </tr>
                <tr>
                  <td><strong>Ubicación exacta / Domicilio</strong></td>
                  <td><span className="config-privacy-badge-private">SIEMPRE PRIVADO</span></td>
                  <td>Nunca se expone ni almacena lat/lng</td>
                </tr>
                <tr>
                  <td><strong>Membresía en organizaciones</strong></td>
                  <td><span className="config-privacy-badge-conditional">CONDICIONAL</span></td>
                  <td>Solo visible si decidís vincular tu comercio</td>
                </tr>
                <tr>
                  <td><strong>Intereses y categorías</strong></td>
                  <td><span className="config-privacy-badge-conditional">OPCIONAL (DEFAULT OFF)</span></td>
                  <td>Activación manual en Perfil</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
              <Link to="/mi-base" className="config-back-btn" id="link-cfg-mibase">
                Gestionar Cuenta y Datos en Mi Base →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AtlasLocalConfiguracion;
