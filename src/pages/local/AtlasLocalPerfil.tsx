import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './AtlasLocalPerfil.css';

interface ProfileData {
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  neighborhood: string | null;
  interests?: string[];
  administered_business?: {
    organization_id: string;
    name: string;
    category?: string;
    address?: string;
  } | null;
  is_owner: boolean;
  public_slug?: string | null;
  show_neighborhood?: boolean;
  show_interests?: boolean;
  show_business?: boolean;
}

export const AtlasLocalPerfil: React.FC = () => {
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<'PERFIL' | 'GUARDADOS' | 'ACTIVIDAD'>('PERFIL');

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editShowNeighborhood, setEditShowNeighborhood] = useState(true);
  const [editShowInterests, setEditShowInterests] = useState(false);
  const [editShowBusiness, setEditShowBusiness] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Account Menu State
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountBtnRef = useRef<HTMLButtonElement>(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
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

      let url = '/api/atlas/local/profile/me';
      // If identifier is provided and it's not the string 'me', call public endpoint
      if (identifier && identifier !== 'me') {
        url = `/api/atlas/local/profile/${encodeURIComponent(identifier)}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 401 && !identifier) {
          setError('Inicia sesión para ver tu perfil de la comunidad.');
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setError('El perfil comunitario no fue encontrado.');
          setLoading(false);
          return;
        }
        throw new Error(`HTTP error ${res.status}`);
      }

      const data: ProfileData = await res.json();
      setProfile(data);

      // Populate edit fields if owner
      if (data.is_owner) {
        setEditName(data.display_name || '');
        setEditBio(data.bio || '');
        setEditAvatar(data.avatar_url || '');
        setEditShowNeighborhood(data.show_neighborhood !== false);
        setEditShowInterests(Boolean(data.show_interests));
        setEditShowBusiness(Boolean(data.show_business));
      }
    } catch (err: any) {
      console.error('[AtlasLocalPerfil] Error loading profile:', err);
      setError('No pudimos cargar el perfil en este momento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [identifier, searchParams]);

  // Close account menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isAccountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target) &&
        accountBtnRef.current &&
        !accountBtnRef.current.contains(target)
      ) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAccountMenuOpen]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (testUser) {
        headers['x-user-id'] = testUser;
      }

      const payload = {
        display_name: editName,
        bio: editBio.slice(0, 160),
        avatar_url: editAvatar.trim() || null,
        show_neighborhood: editShowNeighborhood,
        show_interests: editShowInterests,
        show_business: editShowBusiness
      };

      const res = await fetch('/api/atlas/local/profile/me', {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error guardando perfil');
      }

      const resData = await res.json();
      setIsEditOpen(false);
      setToastMsg('Perfil actualizado correctamente');
      setTimeout(() => setToastMsg(null), 3500);

      // Refresh data
      await fetchProfile();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
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

  const initial = (profile?.display_name || 'U').charAt(0).toUpperCase();

  return (
    <div className="perfil-page-root">
      {/* ─── Top Navbar ─── */}
      <header className="perfil-navbar">
        <div className="perfil-navbar-inner">
          <Link to="/local/caballito" className="perfil-brand">
            <svg className="perfil-brand-logo" viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 29,9 29,23 16,30 3,23 3,9" fill="#1e3a8a" stroke="#0284c7" strokeWidth="2.5" />
              <polygon points="16,7 24,12 24,20 16,25 8,20 8,12" fill="#0284c7" />
            </svg>
            <div className="perfil-brand-text">
              <span className="perfil-brand-title">Buscador Industrial</span>
              <span className="perfil-brand-subtitle">Comunidad Caballito</span>
            </div>
          </Link>

          <div className="perfil-nav-actions">
            <Link to="/productos" className="perfil-back-btn" id="btn-perfil-catalogo">
              📦 Catálogo
            </Link>
            <Link to="/local/caballito" className="perfil-back-btn" id="btn-back-caballito">
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

      {/* ─── Main Body ─── */}
      <main className="perfil-main-container">
        {toastMsg && (
          <div style={{
            background: '#10b981',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '10px',
            marginBottom: '16px',
            fontWeight: 600,
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
          }}>
            ✓ {toastMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            <p>Cargando presencia comunitaria...</p>
          </div>
        ) : error ? (
          <div style={{
            background: '#fff',
            border: '1px solid #fee2e2',
            borderRadius: '16px',
            padding: '36px 20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#991b1b', margin: '0 0 8px' }}>Acceso al Perfil</h2>
            <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px', margin: '0 auto 20px' }}>{error}</p>
            <Link to="/local/caballito" className="perfil-btn-edit" style={{ textDecoration: 'none' }}>
              Volver a Caballito
            </Link>
          </div>
        ) : profile ? (
          <>
            {/* Owner Notice Banner */}
            {profile.is_owner && (
              <div className="perfil-owner-banner" id="banner-owner-view">
                <div className="perfil-owner-banner-left">
                  <span className="perfil-owner-banner-badge">Tu Perfil</span>
                  <span>Estás viendo tu presencia pública comunitaria.</span>
                </div>
                <div style={{ fontSize: '12px', color: '#15803d' }}>
                  Solo se muestra al vecindario lo que habilites.
                </div>
              </div>
            )}

            {/* Header Card */}
            <div className="perfil-header-card" id="profile-header-card">
              <div className="perfil-header-content">
                <div className="perfil-user-meta">
                  <div className="perfil-avatar-wrap">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.display_name} className="perfil-avatar" />
                    ) : (
                      <div className="perfil-avatar">{initial}</div>
                    )}
                  </div>

                  <div className="perfil-user-details">
                    <div className="perfil-name-row">
                      <h1 className="perfil-display-name" id="profile-display-name">
                        {profile.display_name}
                      </h1>
                      {/* Neighborhood badge rendered ONLY if show_neighborhood is allowed */}
                      {profile.neighborhood && (
                        <span className="perfil-badge-barrio" id="profile-badge-neighborhood">
                          📍 {profile.neighborhood === 'caballito' ? 'Caballito' : profile.neighborhood}
                        </span>
                      )}
                    </div>

                    {/* Bio / Status */}
                    {profile.bio ? (
                      <p className="perfil-bio-text" id="profile-bio">
                        "{profile.bio}"
                      </p>
                    ) : (
                      <p className="perfil-bio-empty" id="profile-bio-empty">
                        Sin estado definido.
                      </p>
                    )}

                    {/* Administered Business (shown only if authorized and visibility allowed) */}
                    {profile.administered_business && (
                      <div className="perfil-business-box" id="profile-business-box">
                        <span className="perfil-business-label">Administra:</span>
                        <span className="perfil-business-name">{profile.administered_business.name}</span>
                        <Link
                          to={`/local/caballito/comercio/${profile.administered_business.organization_id}`}
                          className="perfil-business-link"
                          id="link-profile-business"
                        >
                          Ver comercio →
                        </Link>
                      </div>
                    )}

                    {/* Followed Interests (shown only if visibility allowed) */}
                    {profile.interests && profile.interests.length > 0 && (
                      <div className="perfil-interests-box" id="profile-interests-box">
                        <span className="perfil-interests-label">Sigue:</span>
                        {profile.interests.map(cat => (
                          <span key={cat} className="perfil-interest-chip">
                            • {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit Button (ONLY shown in Owner View) */}
                {profile.is_owner && (
                  <div>
                    <button
                      type="button"
                      id="btn-edit-profile"
                      className="perfil-btn-edit"
                      onClick={() => setIsEditOpen(true)}
                    >
                      ✏️ Editar perfil
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Tabs */}
            <div className="perfil-tabs-bar" role="tablist">
              <button
                type="button"
                id="tab-perfil"
                role="tab"
                aria-selected={activeTab === 'PERFIL'}
                className={`perfil-tab-btn ${activeTab === 'PERFIL' ? 'active' : ''}`}
                onClick={() => setActiveTab('PERFIL')}
              >
                Perfil
              </button>
              <button
                type="button"
                id="tab-guardados"
                role="tab"
                aria-selected={activeTab === 'GUARDADOS'}
                className={`perfil-tab-btn ${activeTab === 'GUARDADOS' ? 'active' : ''}`}
                onClick={() => setActiveTab('GUARDADOS')}
              >
                Guardados
              </button>
              <button
                type="button"
                id="tab-actividad"
                role="tab"
                aria-selected={activeTab === 'ACTIVIDAD'}
                className={`perfil-tab-btn ${activeTab === 'ACTIVIDAD' ? 'active' : ''}`}
                onClick={() => setActiveTab('ACTIVIDAD')}
              >
                Actividad
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'PERFIL' && (
              <div>
                <div className="perfil-section-card">
                  <h3 className="perfil-section-title">
                    <span>🏘️</span> Presencia en la Comunidad
                  </h3>
                  <div className="perfil-info-grid">
                    <div className="perfil-info-item">
                      <div className="perfil-info-label">Barrio Principal</div>
                      <div className="perfil-info-val">
                        {profile.neighborhood ? 'Caballito (Comuna 6)' : 'Oculto'}
                      </div>
                    </div>
                    <div className="perfil-info-item">
                      <div className="perfil-info-label">Intereses Públicos</div>
                      <div className="perfil-info-val">
                        {profile.interests && profile.interests.length > 0 
                          ? `${profile.interests.length} categorías visibles` 
                          : 'No configurados o privados'}
                      </div>
                    </div>
                    <div className="perfil-info-item">
                      <div className="perfil-info-label">Comercio Vinculado</div>
                      <div className="perfil-info-val">
                        {profile.administered_business ? profile.administered_business.name : 'Ninguno'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="perfil-section-card">
                  <h3 className="perfil-section-title">
                    <span>🛡️</span> Privacidad y Seguridad
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: '0 0 12px' }}>
                    Tu correo electrónico, teléfono, ubicación geográfica exacta y credenciales de acceso son estrictamente privados y nunca se revelan a otros miembros de la comunidad.
                  </p>
                  <Link to="/configuracion" style={{ fontSize: '13px', color: '#0284c7', fontWeight: 600, textDecoration: 'none' }}>
                    Gestionar preferencias en Configuración →
                  </Link>
                </div>
              </div>
            )}

            {activeTab === 'GUARDADOS' && (
              <div className="perfil-section-card">
                <div className="perfil-empty-tab">
                  <div className="perfil-empty-icon">🔖</div>
                  <h4 className="perfil-empty-title">Ofertas y comercios guardados</h4>
                  <p className="perfil-empty-desc">
                    Tus marcadores de Caballito se guardan en tu navegador para que los encuentres rápido.
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <Link to="/local/caballito" className="perfil-back-btn">
                      Explorar ofertas de Caballito
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ACTIVIDAD' && (
              <div className="perfil-section-card">
                <div className="perfil-empty-tab">
                  <div className="perfil-empty-icon">🌱</div>
                  <h4 className="perfil-empty-title">Actividad Comunitaria</h4>
                  <p className="perfil-empty-desc">
                    Esta sección mostrará en el futuro tus aportes verificados al barrio de manera simple y transparente.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>

      {/* ─── Edit Profile Modal ─── */}
      {isEditOpen && (
        <div className="perfil-modal-overlay" id="edit-profile-modal">
          <div className="perfil-modal-card">
            <div className="perfil-modal-header">
              <h2 className="perfil-modal-title">Editar Perfil Comunitario</h2>
              <button
                type="button"
                className="perfil-modal-close-btn"
                onClick={() => setIsEditOpen(false)}
                id="btn-close-edit-profile"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="perfil-modal-body">
                {/* Display Name */}
                <div className="perfil-form-group">
                  <label className="perfil-form-label" htmlFor="edit-display-name">
                    <span>Nombre visible</span>
                  </label>
                  <input
                    id="edit-display-name"
                    type="text"
                    className="perfil-input-text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ej. Eduardo"
                    maxLength={60}
                    required
                  />
                  <p className="perfil-form-help">Cómo te verán los vecinos en la comunidad.</p>
                </div>

                {/* Bio / Status */}
                <div className="perfil-form-group">
                  <div className="perfil-form-label">
                    <label htmlFor="edit-bio">Estado o bio corta</label>
                    <span className={`perfil-char-counter ${editBio.length >= 150 ? 'limit' : editBio.length >= 130 ? 'warning' : ''}`} id="bio-char-counter">
                      {editBio.length} / 160
                    </span>
                  </div>
                  <textarea
                    id="edit-bio"
                    className="perfil-textarea"
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value.slice(0, 160))}
                    placeholder="Ej. Vecino de Caballito • Buscando buenas ofertas cerca mío"
                    rows={3}
                  />
                  <p className="perfil-form-help">Una breve frase sobre tu presencia en el barrio (máx. 160 caracteres).</p>
                </div>

                {/* Avatar URL */}
                <div className="perfil-form-group">
                  <label className="perfil-form-label" htmlFor="edit-avatar-url">
                    <span>Foto de perfil (URL)</span>
                  </label>
                  <input
                    id="edit-avatar-url"
                    type="url"
                    className="perfil-input-text"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="https://ejemplo.com/mi-foto.jpg"
                  />
                  <p className="perfil-form-help">URL pública de tu avatar o foto.</p>
                </div>

                {/* Privacy Controls */}
                <div className="perfil-privacy-group" id="profile-privacy-controls">
                  <h4 className="perfil-privacy-title">Controles de Visibilidad</h4>

                  {/* Barrio */}
                  <div className="perfil-toggle-row">
                    <div className="perfil-toggle-info">
                      <span className="perfil-toggle-label">Mostrar mi barrio en perfil</span>
                      <span className="perfil-toggle-desc">Muestra la insignia "📍 Caballito" sin datos exactos.</span>
                    </div>
                    <label className="apple-switch">
                      <input
                        type="checkbox"
                        id="toggle-show-neighborhood"
                        checked={editShowNeighborhood}
                        onChange={(e) => setEditShowNeighborhood(e.target.checked)}
                      />
                      <span className="apple-slider"></span>
                    </label>
                  </div>

                  {/* Intereses */}
                  <div className="perfil-toggle-row">
                    <div className="perfil-toggle-info">
                      <span className="perfil-toggle-label">Mostrar mis intereses públicamente</span>
                      <span className="perfil-toggle-desc">Muestra las categorías que sigues en Caballito.</span>
                    </div>
                    <label className="apple-switch">
                      <input
                        type="checkbox"
                        id="toggle-show-interests"
                        checked={editShowInterests}
                        onChange={(e) => setEditShowInterests(e.target.checked)}
                      />
                      <span className="apple-slider"></span>
                    </label>
                  </div>

                  {/* Comercio vinculado */}
                  {profile.administered_business && (
                    <div className="perfil-toggle-row">
                      <div className="perfil-toggle-info">
                        <span className="perfil-toggle-label">Mostrar comercio administrado</span>
                        <span className="perfil-toggle-desc">
                          Vincular "{profile.administered_business.name}" a tu perfil comunitario.
                        </span>
                      </div>
                      <label className="apple-switch">
                        <input
                          type="checkbox"
                          id="toggle-show-business"
                          checked={editShowBusiness}
                          onChange={(e) => setEditShowBusiness(e.target.checked)}
                        />
                        <span className="apple-slider"></span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="perfil-modal-footer">
                <button
                  type="button"
                  id="btn-cancel-edit"
                  className="perfil-btn-cancel"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-save-profile"
                  className="perfil-btn-save"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtlasLocalPerfil;
