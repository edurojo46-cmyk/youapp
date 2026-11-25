import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { getCurrentProduct, getAtlasUrl, getIndustrialUrl } from '../../packages/config/products.ts';
import './AtlasNavbar.css';

interface UserProfile {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

export default function AtlasNavbar() {
  const { user, signOut } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProduct = getCurrentProduct();
  const isAtlas = currentProduct === 'ATLAS';
  const isIndustrial = currentProduct === 'INDUSTRIAL';

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data.profile) {
              setProfile(data.profile);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load navbar profile:', err);
      }
    }
    loadProfile();
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

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await signOut();
    navigate('/login');
  };

  const displayName = profile?.display_name || 
    (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : '') ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  const initial = (displayName[0] || 'U').toUpperCase();

  const logoHref = isAtlas ? '/' : (isIndustrial ? '/' : '/');

  return (
    <nav className="atlas-nav">
      <div className="atlas-nav-inner">
        {/* Brand Logo */}
        <Link to={logoHref} className="atlas-logo">
          <svg viewBox="0 0 40 40" fill="none" width={28} height={28} className="atlas-logo-svg">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0f172a" />
            <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill="#2563eb" />
            <polygon points="20,13 26,16.5 26,23.5 20,27 14,23.5 14,16.5" fill="white" opacity="0.95" />
          </svg>
          <span className="atlas-logo-text">Atlas</span>
          <span className="atlas-logo-tag">{isIndustrial ? 'INDUSTRIAL' : 'PLATFORM'}</span>
        </Link>

        {/* Navigation Links */}
        <ul className="atlas-nav-links">
          {isAtlas && (
            <>
              <li>
                <Link 
                  to="/" 
                  className={`atlas-nav-link ${location.pathname === '/' ? 'atlas-nav-link--active' : ''}`}
                >
                  Hub
                </Link>
              </li>
              <li>
                <Link 
                  to="/productos" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/productos') ? 'atlas-nav-link--active' : ''}`}
                  id="atlas-nav-catalogo"
                >
                  Catálogo
                </Link>
              </li>
              <li>
                <Link 
                  to="/mi-base" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/mi-base') ? 'atlas-nav-link--active' : ''}`}
                >
                  Mi Base
                </Link>
              </li>
              <li>
                <a 
                  href={getIndustrialUrl('/local/caballito', { sso: true })} 
                  className={`atlas-nav-link ${location.pathname.startsWith('/local') ? 'atlas-nav-link--active' : ''}`}
                >
                  Mercado Local ↗
                </a>
              </li>
              <li>
                <a 
                  href={getIndustrialUrl('/', { sso: true })} 
                  className="atlas-nav-link"
                >
                  Buscador Industrial ↗
                </a>
              </li>
            </>
          )}

          {isIndustrial && (
            <>
              <li>
                <Link 
                  to="/" 
                  className={`atlas-nav-link ${location.pathname === '/' ? 'atlas-nav-link--active' : ''}`}
                >
                  Buscador
                </Link>
              </li>
              <li>
                <Link 
                  to="/productos" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/productos') ? 'atlas-nav-link--active' : ''}`}
                >
                  Catálogo
                </Link>
              </li>
              <li>
                <Link 
                  to="/local/caballito" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/local') ? 'atlas-nav-link--active' : ''}`}
                >
                  Mercado Local
                </Link>
              </li>
              <li>
                <a 
                  href={getAtlasUrl('/mi-base', { sso: true })} 
                  className="atlas-nav-link"
                >
                  Mi Base ↗
                </a>
              </li>
              <li>
                <a 
                  href={getAtlasUrl('/')} 
                  className="atlas-nav-link"
                >
                  Volver a Atlas
                </a>
              </li>
            </>
          )}

          {!isAtlas && !isIndustrial && (
            <>
              <li>
                <Link 
                  to="/productos" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/productos') ? 'atlas-nav-link--active' : ''}`}
                >
                  Catálogo
                </Link>
              </li>
              <li>
                <Link 
                  to="/mi-base" 
                  className={`atlas-nav-link ${location.pathname.startsWith('/mi-base') ? 'atlas-nav-link--active' : ''}`}
                >
                  Mi Base
                </Link>
              </li>
            </>
          )}
        </ul>

        {/* Right Auth Section */}
        <div className="atlas-nav-auth">
          {user && user.email ? (
            <div className="atlas-user-menu" ref={dropdownRef}>
              <button 
                type="button" 
                className="atlas-user-btn"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-expanded={isDropdownOpen}
              >
                <div className="atlas-avatar">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} className="atlas-avatar-img" />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>
                <span className="atlas-user-name">{displayName}</span>
                <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14} className="atlas-chevron">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {isDropdownOpen && (
                <div className="atlas-dropdown-panel">
                  <div className="atlas-dropdown-header">
                    <p className="atlas-dh-name">{displayName}</p>
                    <p className="atlas-dh-email">{user.email}</p>
                  </div>
                  <div className="atlas-dropdown-divider" />
                  {isIndustrial ? (
                    <>
                      <a 
                        href={getAtlasUrl('/perfil', { sso: true })} 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span>Mi perfil ↗</span>
                      </a>
                      <a 
                        href={getAtlasUrl('/perfil?tab=empresa', { sso: true })} 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
                        </svg>
                        <span>Mi empresa ↗</span>
                      </a>
                      <a 
                        href={getAtlasUrl('/mi-base', { sso: true })} 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        <span>Mi Base ↗</span>
                      </a>
                      <Link 
                        to="/local/mi-comunidad" 
                        id="account-opt-micomunidad"
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <span style={{ marginRight: '8px', fontSize: '1rem' }}>👥</span>
                        <span>Mi comunidad</span>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link 
                        to="/perfil" 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span>Mi perfil</span>
                      </Link>
                      <Link 
                        to="/perfil?tab=empresa" 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
                        </svg>
                        <span>Mi empresa</span>
                      </Link>
                      <Link 
                        to="/local/mi-comunidad" 
                        id="account-opt-micomunidad"
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <span style={{ marginRight: '8px', fontSize: '1rem' }}>👥</span>
                        <span>Mi comunidad</span>
                      </Link>
                      <Link 
                        to="/mi-base" 
                        className="atlas-dropdown-item" 
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        <span>Mi Base</span>
                      </Link>
                    </>
                  )}
                  <div className="atlas-dropdown-divider" />
                  <button 
                    type="button" 
                    className="atlas-dropdown-item atlas-dropdown-item--logout"
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
            <div className="atlas-guest-actions">
              <Link to="/login" className="atlas-btn-login">
                Ingresar
              </Link>
              <Link to="/registro" className="atlas-btn-signup">
                Crear cuenta
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
