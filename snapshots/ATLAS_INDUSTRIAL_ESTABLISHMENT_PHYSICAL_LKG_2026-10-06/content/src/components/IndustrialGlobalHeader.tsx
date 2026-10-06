import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import './IndustrialGlobalHeader.css';

interface UserProfile {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

interface AccountContext {
  administers_business?: boolean;
  business?: {
    organization_id?: string;
    name?: string;
  };
}

export default function IndustrialGlobalHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accountContext, setAccountContext] = useState<AccountContext | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load user profile
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user?.id) { setProfile(null); return; }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data.profile) setProfile(data.profile);
          }
        }
      } catch (err) {
        console.warn('[IndustrialGlobalHeader] Could not load profile:', err);
      }
    }
    loadProfile();
    return () => { isMounted = false; };
  }, [user?.id]);

  // Load merchant account context
  useEffect(() => {
    let isMounted = true;
    async function loadContext() {
      if (!user?.id) { setAccountContext(null); return; }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        const testUser = localStorage.getItem('atlas_test_user_id');
        if (testUser) {
          headers['x-user-id'] = testUser;
          headers['x-atlas-test-auth'] = 'atlas-test-suite';
        }
        const res = await fetch('/api/atlas/local/account/context', { headers });
        if (res.ok && isMounted) setAccountContext(await res.json());
      } catch (e) {
        // silent
      }
    }
    loadContext();
    return () => { isMounted = false; };
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    setIsMobileOpen(false);
    await signOut();
    navigate('/login');
  };

  const displayName = profile?.display_name ||
    (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : '') ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  const initial = (displayName[0] || 'U').toUpperCase();

  const isActive = (paths: string[]) =>
    paths.some(p => location.pathname === p || location.pathname.startsWith(p + '/') || location.pathname.startsWith(p + '?'))
      ? 'igh-nav-link--active' : '';

  return (
    <>
      <nav className="igh-nav">
        <div className="igh-nav-inner">
          {/* Logo */}
          <Link to="/buscaindustrial" className="igh-logo">
            <svg viewBox="0 0 40 40" fill="none" width={26} height={26}>
              <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0f172a" />
              <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill="#2563eb" />
              <polygon points="20,13 26,16.5 26,23.5 20,27 14,23.5 14,16.5" fill="white" opacity="0.95" />
            </svg>
            <span className="igh-logo-text">Buscador Industrial</span>
          </Link>

          {/* Desktop Nav Links */}
          <ul className="igh-nav-links">
            <li>
              <Link
                to="/buscaindustrial"
                className={`igh-nav-link ${isActive(['/buscaindustrial'])}`}
              >
                Buscar
              </Link>
            </li>
            <li>
              <Link
                to="/productos"
                className={`igh-nav-link ${isActive(['/productos', '/productos/catalogo'])}`}
                id="nav-catalogo"
              >
                Catálogo
              </Link>
            </li>
            <li>
              <Link
                to="/mi-base"
                className={`igh-nav-link ${isActive(['/mi-base'])}`}
              >
                Mi Base
              </Link>
            </li>
            <li>
              <Link
                to="/local/caballito?tab=B2B"
                className={`igh-nav-link`}
                id="nav-tengo-necesito"
              >
                Tengo / Necesito
              </Link>
            </li>
            <li>
              <Link
                to="/local/mi-comunidad"
                className={`igh-nav-link ${isActive(['/local/mi-comunidad', '/mi-comunidad'])}`}
              >
                Mi Comunidad
              </Link>
            </li>
            <li>
              <Link
                to="/local/mi-barrio"
                className={`igh-nav-link ${isActive(['/local/mi-barrio'])}`}
              >
                Mi Barrio
              </Link>
            </li>
          </ul>

          {/* Right: Auth section */}
          <div className="igh-nav-auth">
            {user && user.email ? (
              <div className="igh-user-menu" ref={dropdownRef}>
                <button
                  type="button"
                  className="igh-user-btn"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  aria-expanded={isDropdownOpen}
                >
                  <div className="igh-avatar">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={displayName} className="igh-avatar-img" />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <span className="igh-user-name">Mi cuenta</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14} className="igh-chevron">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {isDropdownOpen && (
                  <div className="igh-dropdown-panel">
                    <div className="igh-dropdown-header">
                      <p className="igh-dh-name">{displayName}</p>
                      <p className="igh-dh-email">{user.email}</p>
                    </div>
                    <div className="igh-dropdown-divider" />

                    <Link to="/perfil" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      <span>Ver mi perfil</span>
                    </Link>

                    <Link to="/local/mi-barrio" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      <span>Mi Barrio</span>
                    </Link>

                    <Link to="/mi-base" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      <span>Mi Base</span>
                    </Link>

                    <Link to="/configuracion" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Configuración</span>
                    </Link>

                    {accountContext?.administers_business && (
                      <>
                        <div className="igh-dropdown-divider" />
                        <div className="igh-dropdown-section-label">
                          {accountContext.business?.name || 'Mi Comercio'}
                        </div>
                        <Link
                          to={`/local/caballito/comercio/${accountContext.business?.organization_id}`}
                          className="igh-dropdown-item"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
                          </svg>
                          <span>Mi comercio</span>
                        </Link>
                        <Link to="/mis-ofertas" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                          <span style={{ marginRight: '2px', fontSize: '1rem' }}>🏷️</span>
                          <span>Mis ofertas</span>
                        </Link>
                        <Link to="/comercio/metricas" className="igh-dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                          </svg>
                          <span>Métricas</span>
                        </Link>
                      </>
                    )}

                    <div className="igh-dropdown-divider" />
                    <button
                      type="button"
                      className="igh-dropdown-item igh-dropdown-item--logout"
                      onClick={handleLogout}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                      </svg>
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="igh-guest-actions">
                <Link to="/login" className="igh-btn-login">Ingresar</Link>
                <Link to="/registro" className="igh-btn-signup">Crear cuenta</Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="igh-mobile-toggle"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Abrir menú"
          >
            {isMobileOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Drawer */}
        {isMobileOpen && (
          <div className="igh-mobile-drawer">
            <Link to="/buscaindustrial" className={`igh-mobile-link ${isActive(['/buscaindustrial'])}`}>
              Buscar
            </Link>
            <Link to="/productos" className={`igh-mobile-link ${isActive(['/productos'])}`} id="mobile-nav-catalogo">
              Catálogo
            </Link>
            <Link to="/mi-base" className={`igh-mobile-link ${isActive(['/mi-base'])}`}>
              Mi Base
            </Link>
            <Link to="/local/caballito?tab=B2B" className="igh-mobile-link" id="mobile-nav-tengo-necesito">
              Tengo / Necesito
            </Link>
            <Link to="/local/mi-comunidad" className={`igh-mobile-link ${isActive(['/local/mi-comunidad', '/mi-comunidad'])}`}>
              Mi Comunidad
            </Link>
            <Link to="/local/mi-barrio" className={`igh-mobile-link ${isActive(['/local/mi-barrio'])}`}>
              Mi Barrio
            </Link>

            <div className="igh-mobile-divider" />

            {user && user.email ? (
              <>
                <Link to="/perfil" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                  Ver mi perfil
                </Link>
                <Link to="/configuracion" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                  Configuración
                </Link>

                {accountContext?.administers_business && (
                  <>
                    <div className="igh-mobile-section-label">{accountContext.business?.name || 'Mi Comercio'}</div>
                    <Link
                      to={`/local/caballito/comercio/${accountContext.business?.organization_id}`}
                      className="igh-mobile-link"
                      onClick={() => setIsMobileOpen(false)}
                    >
                      Mi comercio
                    </Link>
                    <Link to="/mis-ofertas" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                      Mis ofertas
                    </Link>
                    <Link to="/comercio/metricas" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                      Métricas
                    </Link>
                  </>
                )}

                <div className="igh-mobile-divider" />
                <button className="igh-mobile-link igh-mobile-logout" onClick={handleLogout}>
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                  Ingresar
                </Link>
                <Link to="/registro" className="igh-mobile-link" onClick={() => setIsMobileOpen(false)}>
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
