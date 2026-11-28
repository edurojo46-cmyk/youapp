import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  Compass,
  Film,
  Home,
  Menu,
  Music2,
  Radio,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Tv,
  User,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from './YouAppOfficialLogo';
import { TvUserSessionMenu } from '../tv/TvUserSessionMenu';

const HIDDEN_PREFIXES = [
  '/login',
  '/share',
  '/embed/',
  '/pip-frame',
  '/antena/',
  '/remote',
  '/tools/',
  '/timeline-pilot',
  '/motion-voice'
];

const DRAWER_LINKS = [
  { label: 'Inicio', path: '/', icon: Home },
  { label: 'Señales · Armá la tuya', path: '/senales', icon: Sparkles },
  { label: 'Mi Señal', path: '/misenal1', icon: Radio },
  { label: 'MiTV', path: '/mitv', icon: Tv },
  { label: 'Buscar', path: '/search', icon: Search },
  { label: 'YOU MUSIC', path: '/youmusic', icon: Music2 },
  { label: 'Reels', path: '/reels', icon: Film },
  { label: 'Lecturas', path: '/lecturas', icon: BookOpen },
  { label: 'Mis Listas', path: '/my-lists', icon: Bookmark },
  { label: 'Mi Algoritmo', path: '/my-algorithm', icon: Sparkles },
  { label: 'Repetidoras', path: '/repetidoras', icon: Share2 },
  { label: 'YOU Remote', path: '/remote', icon: Smartphone },
  { label: 'Mi Perfil', path: '/perfil', icon: User }
];

export function MobileTopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <>
      <header className="ymtb-bar" aria-label="Barra superior móvil">
        <div className="ymtb-left">
          <button
            type="button"
            className="ymtb-hamburger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={19} strokeWidth={2.2} /> : <Menu size={20} strokeWidth={2.2} />}
          </button>
        </div>

        <div className="ymtb-logo-btn">
          <YouAppOfficialLogo size="sm" theme="dark" to="/" />
        </div>

        <div className="ymtb-right" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="ymtb-hamburger"
            onClick={() => navigate('/perfil')}
            aria-label="Mi Perfil"
            title="Mi Perfil"
            style={
              pathname === '/perfil'
                ? {
                    background: 'rgba(0, 113, 227, 0.35)',
                    border: '1px solid rgba(100, 210, 255, 0.55)',
                    color: '#e0f2fe'
                  }
                : undefined
            }
          >
            <User size={18} strokeWidth={2.1} />
          </button>
          <TvUserSessionMenu compact variant="glass" />
        </div>
      </header>

      {menuOpen && (
        <div
          className="ymtb-drawer-backdrop"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <aside
            className="ymtb-drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menú principal"
          >
            <div className="ymtb-drawer-head">
              <YouAppOfficialLogo size="sm" theme="dark" to="/" onClick={() => { setMenuOpen(false); navigate('/'); }} />
              <button
                type="button"
                className="ymtb-drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                <X size={19} />
              </button>
            </div>

            <nav className="ymtb-drawer-nav">
              {DRAWER_LINKS.map((item) => {
                const Icon = item.icon;
                const active =
                  item.path === '/'
                    ? pathname === '/'
                    : pathname === item.path || pathname.startsWith(`${item.path}/`);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`ymtb-drawer-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(item.path);
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <style>{`
        .ymtb-bar,
        .ymtb-mitv-pullwrap,
        .ymtb-drawer-backdrop {
          display: none;
        }
        body.youapp-landscape-fs .ymtb-bar,
        body.youapp-landscape-fs header.ys-topbar,
        body.youapp-landscape-fs header.mitv-header,
        body.youapp-landscape-fs nav.ms-topnav,
        body.youapp-landscape-fs header.ymv1-header {
          display: none !important;
        }
        body.youapp-landscape-fs {
          padding-top: 0 !important;
        }

        @media (max-width: 768px) {
          /* Reemplaza las barras de escritorio en móvil para evitar doble header y cortes */
          nav.home-navbar,
          header.mitv-header,
          nav.ms-topnav,
          header.ys-topbar,
          header.ml-topbar,
          header.ma-topbar,
          header.ymv1-header,
          header.yr-header,
          header.yl-header,
          header.yd-topnav,
          header.mp-topbar,
          header.rep-topnav {
            display: none !important;
          }

          .app-layout {
            padding-top: calc(48px + env(safe-area-inset-top));
            padding-bottom: env(safe-area-inset-bottom);
            box-sizing: border-box;
          }

          .ymtb-mitv-pullwrap {
            position: fixed;
            top: env(safe-area-inset-top);
            left: 0;
            right: 0;
            z-index: 98;
            display: flex;
            justify-content: center;
            pointer-events: none;
          }

          .ymtb-mitv-pulltab {
            pointer-events: auto;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            height: 20px;
            padding: 0 12px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-top: none;
            border-radius: 0 0 12px 12px;
            background: rgba(14, 16, 22, 0.56);
            backdrop-filter: saturate(160%) blur(14px);
            -webkit-backdrop-filter: saturate(160%) blur(14px);
            color: rgba(255, 255, 255, 0.72);
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }

          .ymtb-mitv-pulltab:active {
            background: rgba(14, 16, 22, 0.85);
            color: #ffffff;
          }

          .ymtb-pull-pill {
            width: 24px;
            height: 3px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.45);
          }

          .ymtb-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 98;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            height: calc(48px + env(safe-area-inset-top));
            padding: env(safe-area-inset-top) 10px 0 10px;
            box-sizing: border-box;
            background: rgba(14, 16, 22, 0.76);
            backdrop-filter: saturate(180%) blur(22px);
            -webkit-backdrop-filter: saturate(180%) blur(22px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.3);
          }

          .ymtb-bar--mitv {
            height: calc(42px + env(safe-area-inset-top));
            background: rgba(14, 16, 22, 0.72);
          }

          .ymtb-left {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 6px;
          }

          .ymtb-hamburger {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.07);
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.15s ease, transform 0.12s ease;
          }

          .ymtb-collapse-btn {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
            color: rgba(255, 255, 255, 0.8);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }

          .ymtb-hamburger:active {
            transform: scale(0.95);
            background: rgba(255, 255, 255, 0.16);
          }

          .ymtb-logo-btn {
            background: transparent;
            border: none;
            padding: 4px 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }

          .ymtb-right {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
          }

          .ymtb-drawer-backdrop {
            position: fixed;
            inset: 0;
            z-index: 120;
            display: flex;
            background: rgba(0, 0, 0, 0.62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }

          .ymtb-drawer {
            width: min(290px, 82vw);
            height: 100%;
            background: rgba(15, 18, 26, 0.96);
            backdrop-filter: saturate(180%) blur(28px);
            -webkit-backdrop-filter: saturate(180%) blur(28px);
            border-right: 1px solid rgba(255, 255, 255, 0.14);
            box-shadow: 16px 0 48px rgba(0, 0, 0, 0.65);
            display: flex;
            flex-direction: column;
            padding: calc(14px + env(safe-area-inset-top)) 14px calc(24px + env(safe-area-inset-bottom)) 14px;
            box-sizing: border-box;
            overflow-y: auto;
          }

          .ymtb-drawer-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 6px 14px 6px;
            margin-bottom: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          }

          .ymtb-drawer-close {
            width: 34px;
            height: 34px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.08);
            color: #f8fafc;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }

          .ymtb-drawer-nav {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .ymtb-drawer-item {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 11px 14px;
            border: 1px solid transparent;
            border-radius: 14px;
            background: transparent;
            color: rgba(245, 247, 250, 0.86);
            font-size: 0.92rem;
            font-weight: 600;
            text-align: left;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }

          .ymtb-drawer-item:active {
            background: rgba(255, 255, 255, 0.1);
          }

          .ymtb-drawer-item.active {
            background: rgba(100, 210, 255, 0.16);
            border-color: rgba(100, 210, 255, 0.34);
            color: #64d2ff;
          }
        }
      `}</style>
    </>
  );
}
